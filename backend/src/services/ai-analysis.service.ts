import { env } from '../config/env.js'
import { prisma } from '../config/prisma.js'
import { getAIQueue } from './queue.service.js'

export async function enqueueAIAnalysis(complaintId: string, analysisId: string) {
  if (!env.REDIS_URL || !env.AI_SERVICE_URL) return
  try {
    const queue = getAIQueue()
    if (!queue) throw new Error('AI job queue is not configured.')
    await queue.add('analyze-complaint', { complaintId, analysisId }, {
      jobId: analysisId,
      attempts: 4,
      backoff: { type: 'exponential', delay: 1500 },
      removeOnComplete: 1000,
      removeOnFail: 3000,
    })
  } catch (error) {
    console.error(`Failed to enqueue AI analysis ${analysisId} for complaint ${complaintId}.`, error)
    await prisma.aIAnalysis.updateMany({
      where: { id: analysisId, status: 'QUEUED' },
      data: { status: 'FAILED', error: 'AI job queue unavailable.' },
    })
  }
}

export async function queueComplaintReanalysis(complaintId: string) {
  if (!env.REDIS_URL || !env.AI_SERVICE_URL) return
  const analysis = await prisma.aIAnalysis.create({
    data: { complaintId, status: 'QUEUED' },
    select: { id: true },
  })
  await enqueueAIAnalysis(complaintId, analysis.id)
}
