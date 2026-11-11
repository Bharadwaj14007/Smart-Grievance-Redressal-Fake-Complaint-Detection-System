import type { NextFunction, Request, RequestHandler, Response } from 'express'

export class HttpError extends Error {
  constructor(public readonly status: number, message: string, public readonly details?: unknown) {
    super(message)
    this.name = 'HttpError'
  }
}

export function asyncHandler(handler: (req: Request, res: Response, next: NextFunction) => Promise<unknown>): RequestHandler {
  return (req, res, next) => {
    void handler(req, res, next).catch(next)
  }
}
