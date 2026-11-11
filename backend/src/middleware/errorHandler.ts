import type { ErrorRequestHandler } from 'express'
import { ZodError } from 'zod'
import { Prisma } from '@prisma/client'
import { HttpError } from '../utils/errors.js'

export const errorHandler: ErrorRequestHandler = (error, _req, res, _next) => {
  if (error instanceof ZodError) {
    res.status(400).json({ success: false, message: 'Request validation failed', errors: error.flatten() })
    return
  }
  if (error instanceof HttpError) {
    res.status(error.status).json({ success: false, message: error.message, ...(error.details ? { details: error.details } : {}) })
    return
  }
  if (error instanceof Prisma.PrismaClientKnownRequestError) {
    const status = error.code === 'P2002' ? 409 : error.code === 'P2025' ? 404 : error.code === 'P2023' ? 400 : 400
    res.status(status).json({ success: false, message: status === 409 ? 'A record with this value already exists.' : status === 404 ? 'Record not found.' : 'Database request could not be completed.' })
    return
  }
  if (error instanceof Error && error.name === 'MulterError') {
    res.status(error.message.includes('File too large') ? 413 : 400).json({ success: false, message: error.message })
    return
  }
  if (error instanceof Error && 'type' in error && error.type === 'entity.parse.failed') {
    res.status(400).json({ success: false, message: 'Request body contains invalid JSON.' })
    return
  }
  if (error instanceof Error && 'type' in error && error.type === 'entity.too.large') {
    res.status(413).json({ success: false, message: 'Request body is too large.' })
    return
  }
  console.error('Unhandled API error', error)
  res.status(500).json({ success: false, message: 'Internal server error' })
}
