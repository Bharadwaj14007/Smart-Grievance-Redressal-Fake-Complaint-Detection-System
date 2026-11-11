import type { Request } from 'express'
import { prisma } from '../config/prisma.js'

export async function writeAudit(req: Request, action: string, entityType: string, entityId?: string, metadata?: object) {
  return prisma.auditLog.create({
    data: {
      actorId: req.user?.id,
      action,
      entityType,
      entityId,
      metadata,
      ipAddress: req.ip,
    },
  })
}
