import type { NextFunction, Request, Response } from 'express'
import jwt from 'jsonwebtoken'
import { Role } from '@prisma/client'
import { env } from '../config/env.js'
import { prisma } from '../config/prisma.js'
import { HttpError } from '../utils/errors.js'

export async function authenticate(req: Request, _res: Response, next: NextFunction) {
  try {
    const token = req.cookies?.accessToken
    if (!token) throw new HttpError(401, 'Authentication required.')
    const payload = jwt.verify(token, env.JWT_SECRET) as jwt.JwtPayload
    if (!payload.sub || !payload.email || !Object.values(Role).includes(payload.role as Role)) {
      throw new HttpError(401, 'Invalid authentication token.')
    }
    const user = await prisma.user.findUnique({ where: { id: payload.sub }, select: { id: true, email: true, role: true, status: true } })
    if (!user || user.status !== 'ACTIVE') throw new HttpError(401, 'Account is inactive or unavailable.')
    req.user = { id: user.id, email: user.email, role: user.role }
    next()
  } catch (error) {
    next(error instanceof jwt.JsonWebTokenError || error instanceof jwt.TokenExpiredError ? new HttpError(401, 'Session expired. Please sign in again.') : error)
  }
}

export function requireRoles(...roles: Role[]) {
  return (req: Request, _res: Response, next: NextFunction) => {
    if (!req.user) return next(new HttpError(401, 'Authentication required.'))
    if (!roles.includes(req.user.role)) return next(new HttpError(403, 'You are not allowed to perform this action.'))
    next()
  }
}
