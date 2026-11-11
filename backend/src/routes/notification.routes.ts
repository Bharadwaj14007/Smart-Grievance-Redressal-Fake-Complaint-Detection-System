import { Router } from 'express'
import { prisma } from '../config/prisma.js'
import { authenticate } from '../middleware/auth.js'
import { asyncHandler, HttpError } from '../utils/errors.js'

export const notificationRouter = Router()
notificationRouter.use(authenticate)

notificationRouter.get('/', asyncHandler(async (req, res) => {
  const page = Math.max(1, Number(req.query.page) || 1)
  const pageSize = Math.min(100, Math.max(1, Number(req.query.pageSize) || 20))
  const unreadOnly = req.query.unread === 'true'
  const where = { userId: req.user!.id, ...(unreadOnly ? { readAt: null } : {}) }
  const [items, unreadCount] = await prisma.$transaction([
    prisma.notification.findMany({ where, orderBy: { createdAt: 'desc' }, skip: (page - 1) * pageSize, take: pageSize }),
    prisma.notification.count({ where: { userId: req.user!.id, readAt: null } }),
  ])
  res.json({ success: true, data: { items, unreadCount, page, pageSize } })
}))

notificationRouter.patch('/:id/read', asyncHandler(async (req, res) => {
  const updated = await prisma.notification.updateMany({
    where: { id: req.params.id, userId: req.user!.id, readAt: null },
    data: { readAt: new Date() },
  })
  if (!updated.count) {
    const exists = await prisma.notification.findFirst({ where: { id: req.params.id, userId: req.user!.id }, select: { id: true } })
    if (!exists) throw new HttpError(404, 'Notification not found.')
  }
  res.json({ success: true, message: 'Notification marked as read.' })
}))

notificationRouter.patch('/read-all', asyncHandler(async (req, res) => {
  const result = await prisma.notification.updateMany({ where: { userId: req.user!.id, readAt: null }, data: { readAt: new Date() } })
  res.json({ success: true, message: 'Notifications marked as read.', data: { updatedCount: result.count } })
}))
