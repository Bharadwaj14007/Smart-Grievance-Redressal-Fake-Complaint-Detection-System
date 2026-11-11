import { app } from './app.js'
import { env } from './config/env.js'
import { prisma } from './config/prisma.js'
import { closeQueues } from './services/queue.service.js'

const server = app.listen(env.PORT, () => {
  console.info(`Nagrik Setu API listening on port ${env.PORT}`)
})

let closing = false
async function shutdown(signal: string) {
  if (closing) return
  closing = true
  console.info(`Received ${signal}; shutting down.`)
  server.close(async (error) => {
    if (error) {
      console.error('HTTP server shutdown failed.', error)
      process.exitCode = 1
    }
    try {
      await closeQueues()
      await prisma.$disconnect()
    } catch (shutdownError) {
      console.error('Backend shutdown failed.', shutdownError)
      process.exitCode = 1
    }
  })
  setTimeout(() => {
    console.error('Graceful shutdown timed out.')
    process.exit(1)
  }, 10_000).unref()
}

process.on('SIGINT', () => void shutdown('SIGINT'))
process.on('SIGTERM', () => void shutdown('SIGTERM'))
