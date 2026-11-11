import { Router } from 'express'
import { prisma } from '../config/prisma.js'
import { asyncHandler } from '../utils/errors.js'

export const metadataRouter = Router()

metadataRouter.get('/departments', asyncHandler(async (_req, res) => {
  const departments = await prisma.department.findMany({
    where: { active: true },
    select: { id: true, name: true, code: true, state: true, district: true },
    orderBy: { name: 'asc' },
  })
  res.json({ success: true, data: departments })
}))

metadataRouter.get('/categories', asyncHandler(async (_req, res) => {
  const categories = await prisma.complaintCategory.findMany({
    where: { active: true },
    select: { id: true, name: true, defaultPriority: true, slaHours: true, department: { select: { id: true, name: true } } },
    orderBy: { name: 'asc' },
  })
  res.json({ success: true, data: categories })
}))
