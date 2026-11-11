import { Queue } from 'bullmq'
import { Redis } from 'ioredis'
import { env } from '../config/env.js'

let connection: Redis | undefined
let aiQueue: Queue | undefined

export function getAIQueue() {
  if (!env.REDIS_URL) return undefined
  if (!connection) connection = new Redis(env.REDIS_URL, { maxRetriesPerRequest: null })
  if (!aiQueue) aiQueue = new Queue('complaint-ai-analysis', { connection })
  return aiQueue
}

export async function closeQueues() {
  await aiQueue?.close()
  await connection?.quit()
  aiQueue = undefined
  connection = undefined
}
