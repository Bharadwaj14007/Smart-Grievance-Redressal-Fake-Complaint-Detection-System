import { Queue, Worker, type Job } from 'bullmq'
import { Redis } from 'ioredis'
import { Prisma } from '@prisma/client'
import { z } from 'zod'
import { env } from './config/env.js'
import { prisma } from './config/prisma.js'

const analysisResponse = z.object({
  status: z.enum(['COMPLETED', 'NOT_CONFIGURED']),
  result: z.record(z.unknown()).nullable(),
})

async function analyzeComplaint(job: Job<{ complaintId: string }>) {
  if (!env.AI_SERVICE_URL) throw new Error('AI service is not configured.')
  const complaint = await prisma.complaint.findUnique({
    where: { id: job.data.complaintId },
    select: { id: true, title: true, description: true, category: { select: { name: true } }, location: { select: { state: true, district: true, city: true } } },
  })
  if (!complaint) throw new Error('Complaint no longer exists.')
  await prisma.aIAnalysis.updateMany({ where: { complaintId: complaint.id, status: 'QUEUED' }, data: { status: 'PROCESSING', error: null } })

  const response = await fetch(new URL('/v1/analyze', env.AI_SERVICE_URL), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(complaint),
    signal: AbortSignal.timeout(30_000),
  })
  if (!response.ok) throw new Error(`AI service returned HTTP ${response.status}.`)
  const output = analysisResponse.parse(await response.json())
  await prisma.aIAnalysis.updateMany({
    where: { complaintId: complaint.id, status: 'PROCESSING' },
    data: {
      status: output.status,
      result: output.result === null ? undefined : JSON.parse(JSON.stringify(output.result)) as Prisma.InputJsonValue,
      error: null,
    },
  })
}

if (!env.REDIS_URL) throw new Error('REDIS_URL is required to start the AI worker.')
const connection = new Redis(env.REDIS_URL, { maxRetriesPerRequest: null })
const worker = new Worker('complaint-ai-analysis', analyzeComplaint, { connection, concurrency: 4 })
const slaQueue = new Queue('complaint-sla-check', { connection })
const slaWorker = new Worker('complaint-sla-check', async () => {
  const [complaints, configurations] = await Promise.all([
    prisma.complaint.findMany({
      where: { status: { notIn: ['CLOSED', 'RESOLVED', 'ESCALATED'] }, createdAt: { lte: new Date(Date.now() - 60 * 60 * 1000) } },
      include: { category: { select: { slaHours: true } } },
      orderBy: { createdAt: 'asc' },
      take: 1000,
    }),
    prisma.sLAConfiguration.findMany({ where: { active: true } }),
  ])
  for (const complaint of complaints) {
    const matching = configurations
      .filter((item) => (!item.categoryId || item.categoryId === complaint.categoryId) && (!item.priority || item.priority === complaint.priority))
      .sort((a, b) =>
        Number(Boolean(b.categoryId)) * 2 + Number(Boolean(b.priority))
        - Number(Boolean(a.categoryId)) * 2 - Number(Boolean(a.priority)),
      )
    const config = matching[0]
    const responsePending = complaint.status === 'SUBMITTED' || complaint.status === 'AI_ANALYSIS'
    const targetHours = responsePending ? config?.responseHours ?? complaint.category.slaHours : config?.resolutionHours ?? complaint.category.slaHours
    if (complaint.createdAt.getTime() + targetHours * 60 * 60 * 1000 > Date.now()) continue
    await prisma.$transaction(async (tx) => {
      const changed = await tx.complaint.updateMany({ where: { id: complaint.id, status: complaint.status }, data: { status: 'ESCALATED' } })
      if (!changed.count) return
      await tx.complaintStatusHistory.create({
        data: {
          complaintId: complaint.id,
          fromStatus: complaint.status,
          toStatus: 'ESCALATED',
          note: `Automatically escalated because the ${responsePending ? 'response' : 'resolution'} SLA elapsed.`,
        },
      })
      await tx.notification.create({
        data: {
          userId: complaint.citizenId,
          complaintId: complaint.id,
          type: 'SLA_ESCALATED',
          message: `Complaint ${complaint.trackingId} was escalated after its ${responsePending ? 'response' : 'resolution'} target elapsed.`,
        },
      })
      await tx.auditLog.create({
        data: { action: 'SLA_ESCALATION', entityType: 'Complaint', entityId: complaint.id, metadata: { targetHours, responsePending } },
      })
    })
  }
}, { connection, concurrency: 1 })

await slaQueue.add('periodic-check', {}, { repeat: { every: 15 * 60 * 1000 }, jobId: 'sla-periodic-check' })

worker.on('failed', (job, error) => {
  console.error('Complaint AI job failed.', { jobId: job?.id, error })
  if (job && job.attemptsMade >= Number(job.opts.attempts ?? 1)) {
    void prisma.aIAnalysis.updateMany({
      where: { complaintId: job.data.complaintId, status: { in: ['QUEUED', 'PROCESSING'] } },
      data: { status: 'FAILED', error: 'AI analysis could not be completed.' },
    }).catch((updateError: unknown) => console.error('Could not persist AI failure state.', updateError))
  }
})
slaWorker.on('failed', (job, error) => {
  console.error('SLA check failed.', { jobId: job?.id, error })
})

let closing = false
async function shutdown(signal: string) {
  if (closing) return
  closing = true
  console.info(`AI worker received ${signal}; shutting down.`)
  await slaWorker.close()
  await slaQueue.close()
  await worker.close()
  await connection.quit()
  await prisma.$disconnect()
}
process.on('SIGINT', () => void shutdown('SIGINT'))
process.on('SIGTERM', () => void shutdown('SIGTERM'))
