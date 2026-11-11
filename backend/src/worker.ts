import { Queue, Worker, type Job } from 'bullmq'
import { Redis } from 'ioredis'
import { Prisma } from '@prisma/client'
import { z } from 'zod'
import { env } from './config/env.js'
import { prisma } from './config/prisma.js'
import { getPrivateImage } from './services/storage.service.js'

const analysisResponse = z.object({
  status: z.enum(['COMPLETED', 'NOT_CONFIGURED']),
  result: z.record(z.unknown()).nullable(),
})

async function analyzeComplaint(job: Job<{ complaintId: string }>) {
  if (!env.AI_SERVICE_URL) throw new Error('AI service is not configured.')
  const complaint = await prisma.complaint.findUnique({
    where: { id: job.data.complaintId },
    select: {
      id: true,
      trackingId: true,
      title: true,
      description: true,
      severity: true,
      createdAt: true,
      incidentAt: true,
      category: { select: { id: true, name: true } },
      location: { select: { state: true, district: true, city: true, latitude: true, longitude: true } },
      images: { select: { id: true, contentType: true, objectKey: true } },
    },
  })
  if (!complaint) throw new Error('Complaint no longer exists.')
  await prisma.aIAnalysis.updateMany({ where: { complaintId: complaint.id, status: 'QUEUED' }, data: { status: 'PROCESSING', error: null } })

  const [categories, candidateRows, images] = await Promise.all([
    prisma.complaintCategory.findMany({
      where: { active: true },
      select: { id: true, name: true, department: { select: { id: true, name: true } } },
    }),
    prisma.complaint.findMany({
      where: { id: { not: complaint.id }, createdAt: { gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) } },
      orderBy: { createdAt: 'desc' },
      take: 100,
      select: {
        id: true,
        trackingId: true,
        title: true,
        description: true,
        categoryId: true,
        createdAt: true,
        location: { select: { state: true, district: true, city: true, latitude: true, longitude: true } },
        aiAnalyses: { where: { status: 'COMPLETED' }, orderBy: { createdAt: 'desc' }, take: 1, select: { result: true } },
      },
    }),
    Promise.all(complaint.images.map(async (image) => {
      const object = await getPrivateImage(image.objectKey)
      const bytes = await object.Body?.transformToByteArray()
      if (!bytes) throw new Error(`Could not read complaint image ${image.id} for AI analysis.`)
      return { id: image.id, contentType: image.contentType, data: Buffer.from(bytes).toString('base64') }
    })),
  ])
  const candidates = candidateRows.map((candidate) => {
    const storedResult = candidate.aiAnalyses[0]?.result
    const result = storedResult && typeof storedResult === 'object' && !Array.isArray(storedResult) ? storedResult : {}
    const storedImages = Array.isArray(result.images) ? result.images : []
    const imageRecords = storedImages.filter(
      (image): image is Prisma.JsonObject => image !== null && typeof image === 'object' && !Array.isArray(image),
    )
    const textEmbedding = Array.isArray(result.textEmbedding) && result.textEmbedding.every((value) => typeof value === 'number')
      ? result.textEmbedding as number[]
      : undefined
    const imageEmbeddings = imageRecords
      .map((image) => image.embedding)
      .filter((embedding): embedding is number[] => Array.isArray(embedding) && embedding.every((value) => typeof value === 'number'))
    const perceptualHashes = imageRecords
      .map((image) => image.perceptualHash)
      .filter((hash): hash is string => typeof hash === 'string')
    return {
      id: candidate.id,
      trackingId: candidate.trackingId,
      title: candidate.title,
      description: candidate.description,
      categoryId: candidate.categoryId,
      createdAt: candidate.createdAt.toISOString(),
      location: candidate.location,
      textEmbedding,
      imageEmbeddings,
      perceptualHashes,
    }
  })
  const response = await fetch(new URL('/v1/analyze', env.AI_SERVICE_URL), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      ...complaint,
      createdAt: complaint.createdAt.toISOString(),
      incidentAt: complaint.incidentAt?.toISOString() ?? null,
      categories: categories.map((category) => ({
        id: category.id,
        name: category.name,
        departmentId: category.department?.id ?? null,
        department: category.department?.name ?? null,
      })),
      candidates,
      images,
    }),
    signal: AbortSignal.timeout(300_000),
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
const worker = new Worker('complaint-ai-analysis', analyzeComplaint, { connection, concurrency: 1 })
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
