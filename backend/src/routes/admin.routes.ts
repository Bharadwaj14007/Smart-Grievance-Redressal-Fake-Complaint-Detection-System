import argon2 from 'argon2'
import { AIJobStatus, NotificationChannel, NotificationDeliveryStatus, Priority, Prisma, Role } from '@prisma/client'
import { Router } from 'express'
import { z } from 'zod'
import { prisma } from '../config/prisma.js'
import { env } from '../config/env.js'
import { authenticate, requireRoles } from '../middleware/auth.js'
import { writeAudit } from '../services/audit.service.js'
import { assignComplaint } from '../services/complaint.service.js'
import { asyncHandler, HttpError } from '../utils/errors.js'

export const adminRouter = Router()
adminRouter.use(authenticate, requireRoles(Role.ADMIN))

const aiCandidateSchema = z.object({
  complaintId: z.string().uuid(),
  trackingId: z.string(),
  similarity: z.number().min(0).max(1),
  method: z.string().default('legacy_unlabeled'),
  signals: z.array(z.object({
    name: z.string(),
    value: z.number(),
    normalizedValue: z.number().min(0).max(1).optional(),
    weight: z.number().min(0).max(1).optional(),
    contribution: z.number().min(0).max(1).optional(),
  })),
})

function analysisResult(value: Prisma.JsonValue | null | undefined) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Prisma.JsonObject : {}
}

const departmentSchema = z.object({
  name: z.string().trim().min(2).max(160),
  code: z.string().trim().min(2).max(32),
  description: z.string().max(4000).optional(),
  state: z.string().max(100).optional(),
  district: z.string().max(100).optional(),
  jurisdiction: z.string().max(2000).optional(),
  active: z.boolean().optional(),
})
const categorySchema = z.object({
  name: z.string().trim().min(2).max(120),
  departmentId: z.string().uuid().optional(),
  defaultPriority: z.nativeEnum(Priority).optional(),
  slaHours: z.number().int().min(1).max(24 * 365).optional(),
  active: z.boolean().optional(),
})
const officerSchema = z.object({
  email: z.string().email().transform((value) => value.trim().toLowerCase()),
  password: z.string().min(12).max(128).optional(),
  fullName: z.string().trim().min(2).max(160),
  departmentId: z.string().uuid().optional(),
  jurisdiction: z.string().max(2000).optional(),
  phone: z.string().max(32).optional(),
})

adminRouter.get('/dashboard', asyncHandler(async (_req, res) => {
  const [complaints, citizens, officers, departments, statuses, categories] = await Promise.all([
    prisma.complaint.count(),
    prisma.user.count({ where: { role: Role.CITIZEN, status: 'ACTIVE' } }),
    prisma.user.count({ where: { role: Role.OFFICER, status: 'ACTIVE' } }),
    prisma.department.count({ where: { active: true } }),
    prisma.complaint.groupBy({ by: ['status'], _count: { _all: true } }),
    prisma.complaint.groupBy({ by: ['categoryId'], _count: { _all: true } }),
  ])
  res.json({ success: true, data: { complaints, citizens, officers, departments, statuses, categories } })
}))

adminRouter.get('/ai/monitoring', asyncHandler(async (_req, res) => {
  const [statusGroups, completed] = await Promise.all([
    prisma.aIAnalysis.groupBy({ by: ['status'], _count: { _all: true } }),
    prisma.aIAnalysis.findMany({
      where: { status: AIJobStatus.COMPLETED, result: { not: Prisma.DbNull } },
      orderBy: { createdAt: 'desc' },
      take: 100,
      select: {
        id: true,
        status: true,
        createdAt: true,
        complaint: { select: { id: true, trackingId: true, title: true } },
        result: true,
      },
    }),
  ])
  let modelAvailability: { status: string; models?: unknown; reason?: string } = {
    status: env.AI_SERVICE_URL ? 'unreachable' : 'not_configured',
  }
  if (env.AI_SERVICE_URL) {
    try {
      const response = await fetch(new URL('/healthz', env.AI_SERVICE_URL), { signal: AbortSignal.timeout(2000) })
      if (response.ok) {
        const health = await response.json() as { models?: unknown }
        modelAvailability = { status: 'available', models: health.models }
      } else {
        modelAvailability = { status: 'unhealthy', reason: `AI service returned HTTP ${response.status}.` }
      }
    } catch {
      modelAvailability = { status: 'unreachable', reason: 'AI service health check did not succeed.' }
    }
  }
  const counts = Object.fromEntries(statusGroups.map(({ status, _count }) => [status, _count._all]))
  const recentAnalyses = completed.map((analysis) => {
    const result = analysisResult(analysis.result)
    const images = Array.isArray(result.images) ? result.images.filter((image) => image && typeof image === 'object' && !Array.isArray(image)) as Prisma.JsonObject[] : []
    const candidates = Array.isArray(result.duplicateCandidates)
      ? result.duplicateCandidates.flatMap((candidate) => {
        const parsed = aiCandidateSchema.safeParse(candidate)
        return parsed.success ? [parsed.data] : []
      })
      : []
    const imageIndicators = images.flatMap((image) =>
      Array.isArray(image.forensicIndicators)
        ? image.forensicIndicators.filter((indicator): indicator is string => typeof indicator === 'string').map((indicator) => ({ imageId: String(image.id ?? ''), indicator }))
        : [],
    )
    return {
      id: analysis.id,
      status: analysis.status,
      createdAt: analysis.createdAt,
      complaint: analysis.complaint,
      model: result.model ?? null,
      predictedCategory: result.predictedCategory ?? null,
      recommendedPriority: result.recommendedPriority ?? null,
      duplicateCandidates: candidates,
      imageIndicators,
    }
  })
  res.json({ success: true, data: { counts, modelAvailability, recentAnalyses } })
}))

adminRouter.get('/notification-deliveries', asyncHandler(async (req, res) => {
  const query = z.object({
    page: z.coerce.number().int().min(1).default(1),
    pageSize: z.coerce.number().int().min(1).max(100).default(50),
    channel: z.nativeEnum(NotificationChannel).optional(),
    status: z.nativeEnum(NotificationDeliveryStatus).optional(),
  }).parse(req.query)
  const where = {
    ...(query.channel ? { channel: query.channel } : {}),
    ...(query.status ? { status: query.status } : {}),
  }
  const [items, total] = await prisma.$transaction([
    prisma.notificationDelivery.findMany({
      where,
      orderBy: { updatedAt: 'desc' },
      skip: (query.page - 1) * query.pageSize,
      take: query.pageSize,
      select: {
        id: true,
        channel: true,
        status: true,
        attemptCount: true,
        providerMessageId: true,
        error: true,
        createdAt: true,
        updatedAt: true,
        notification: {
          select: {
            type: true,
            message: true,
            user: { select: { email: true } },
          },
        },
      },
    }),
    prisma.notificationDelivery.count({ where }),
  ])
  res.json({ success: true, data: { items, total, page: query.page, pageSize: query.pageSize } })
}))
adminRouter.get('/citizens', asyncHandler(async (req, res) => {
  const q = typeof req.query.q === 'string' ? req.query.q.trim() : ''
  const status = req.query.status === undefined ? undefined : z.enum(['active', 'inactive']).parse(req.query.status)
  const users = await prisma.user.findMany({
    where: { role: Role.CITIZEN, ...(status === 'inactive' ? { status: 'INACTIVE' } : status === 'active' ? { status: 'ACTIVE' } : {}), ...(q ? { OR: [{ email: { contains: q, mode: 'insensitive' } }, { citizenProfile: { fullName: { contains: q, mode: 'insensitive' } } }] } : {}) },
    select: { id: true, email: true, status: true, createdAt: true, citizenProfile: true, _count: { select: { complaints: true } } },
    orderBy: { createdAt: 'desc' },
  })
  res.json({ success: true, data: users })
}))

adminRouter.patch('/citizens/:id/status', asyncHandler(async (req, res) => {
  const status = z.enum(['ACTIVE', 'INACTIVE', 'SUSPENDED']).parse(req.body.status)
  const user = await prisma.user.update({ where: { id: req.params.id, role: Role.CITIZEN }, data: { status }, select: { id: true, email: true, status: true } })
  await writeAudit(req, 'CITIZEN_STATUS_CHANGED', 'User', user.id, { status })
  res.json({ success: true, data: user })
}))

adminRouter.get('/officers', asyncHandler(async (_req, res) => {
  const officers = await prisma.user.findMany({
    where: { role: Role.OFFICER },
    select: { id: true, email: true, status: true, officerProfile: { include: { department: true } }, assignments: { where: { active: true }, select: { id: true } } },
    orderBy: { email: 'asc' },
  })
  res.json({ success: true, data: officers })
}))

adminRouter.post('/officers', asyncHandler(async (req, res) => {
  const input = officerSchema.parse(req.body)
  if (!input.password) throw new HttpError(400, 'Password is required when creating an officer.')
  const passwordHash = await argon2.hash(input.password, { type: argon2.argon2id })
  const user = await prisma.user.create({
    data: {
      email: input.email,
      passwordHash,
      role: Role.OFFICER,
      officerProfile: { create: { fullName: input.fullName, departmentId: input.departmentId, jurisdiction: input.jurisdiction, phone: input.phone } },
    },
    select: { id: true, email: true, role: true, status: true, officerProfile: true },
  })
  await writeAudit(req, 'OFFICER_CREATED', 'User', user.id)
  res.status(201).json({ success: true, data: user })
}))

adminRouter.patch('/officers/:id', asyncHandler(async (req, res) => {
  const input = officerSchema.omit({ password: true }).partial().parse(req.body)
  const user = await prisma.user.update({
    where: { id: req.params.id, role: Role.OFFICER },
    data: {
      ...(input.email ? { email: input.email } : {}),
      ...(input.fullName || input.departmentId || input.jurisdiction || input.phone ? {
        officerProfile: { update: {
          ...(input.fullName ? { fullName: input.fullName } : {}),
          ...(input.departmentId ? { departmentId: input.departmentId } : {}),
          ...(input.jurisdiction ? { jurisdiction: input.jurisdiction } : {}),
          ...(input.phone ? { phone: input.phone } : {}),
        } },
      } : {}),
    },
    select: { id: true, email: true, role: true, status: true, officerProfile: true },
  })
  await writeAudit(req, 'OFFICER_UPDATED', 'User', user.id)
  res.json({ success: true, data: user })
}))

adminRouter.patch('/officers/:id/status', asyncHandler(async (req, res) => {
  const status = z.enum(['ACTIVE', 'INACTIVE', 'SUSPENDED']).parse(req.body.status)
  const user = await prisma.user.update({ where: { id: req.params.id, role: Role.OFFICER }, data: { status }, select: { id: true, email: true, status: true } })
  await writeAudit(req, 'OFFICER_STATUS_CHANGED', 'User', user.id, { status })
  res.json({ success: true, data: user })
}))

adminRouter.get('/departments', asyncHandler(async (_req, res) => {
  const departments = await prisma.department.findMany({ include: { categories: true, officers: true, _count: { select: { complaints: true } } }, orderBy: { name: 'asc' } })
  res.json({ success: true, data: departments })
}))
adminRouter.post('/departments', asyncHandler(async (req, res) => {
  const data = departmentSchema.parse(req.body)
  const department = await prisma.department.create({ data })
  await writeAudit(req, 'DEPARTMENT_CREATED', 'Department', department.id)
  res.status(201).json({ success: true, data: department })
}))
adminRouter.patch('/departments/:id', asyncHandler(async (req, res) => {
  const data = departmentSchema.partial().parse(req.body)
  const department = await prisma.department.update({ where: { id: req.params.id }, data })
  await writeAudit(req, 'DEPARTMENT_UPDATED', 'Department', department.id)
  res.json({ success: true, data: department })
}))
adminRouter.delete('/departments/:id', asyncHandler(async (req, res) => {
  const department = await prisma.department.delete({ where: { id: req.params.id } })
  await writeAudit(req, 'DEPARTMENT_DELETED', 'Department', department.id)
  res.json({ success: true, message: 'Department deleted.' })
}))

adminRouter.get('/categories', asyncHandler(async (_req, res) => {
  res.json({ success: true, data: await prisma.complaintCategory.findMany({ include: { department: true }, orderBy: { name: 'asc' } }) })
}))
adminRouter.post('/categories', asyncHandler(async (req, res) => {
  const category = await prisma.complaintCategory.create({ data: categorySchema.parse(req.body) })
  await writeAudit(req, 'CATEGORY_CREATED', 'ComplaintCategory', category.id)
  res.status(201).json({ success: true, data: category })
}))
adminRouter.patch('/categories/:id', asyncHandler(async (req, res) => {
  const category = await prisma.complaintCategory.update({ where: { id: req.params.id }, data: categorySchema.partial().parse(req.body) })
  await writeAudit(req, 'CATEGORY_UPDATED', 'ComplaintCategory', category.id)
  res.json({ success: true, data: category })
}))
adminRouter.delete('/categories/:id', asyncHandler(async (req, res) => {
  const category = await prisma.complaintCategory.delete({ where: { id: req.params.id } })
  await writeAudit(req, 'CATEGORY_DELETED', 'ComplaintCategory', category.id)
  res.json({ success: true, message: 'Category deleted.' })
}))

adminRouter.post('/complaints/:id/assign', asyncHandler(async (req, res) => {
  const body = z.object({ officerId: z.string().uuid(), departmentId: z.string().uuid().optional() }).parse(req.body)
  res.json({ success: true, data: await assignComplaint(req, req.params.id, body.officerId, body.departmentId) })
}))

adminRouter.post('/complaints/:id/duplicate-reviews', asyncHandler(async (req, res) => {
  const input = z.object({
    candidateId: z.string().uuid(),
    decision: z.enum(['LINKED', 'SEPARATE', 'MANUAL_REVIEW']),
    notes: z.string().max(4000).optional(),
  }).parse(req.body)
  if (input.candidateId === req.params.id) throw new HttpError(400, 'A complaint cannot be a duplicate of itself.')
  const [complaint, candidate, latestAnalysis] = await Promise.all([
    prisma.complaint.findUnique({ where: { id: req.params.id }, select: { id: true } }),
    prisma.complaint.findUnique({ where: { id: input.candidateId }, select: { id: true } }),
    prisma.aIAnalysis.findFirst({ where: { complaintId: req.params.id }, orderBy: { createdAt: 'desc' }, select: { status: true, result: true } }),
  ])
  if (!complaint || !candidate) throw new HttpError(404, 'Complaint or duplicate candidate not found.')
  const duplicateCandidates = latestAnalysis?.status === 'COMPLETED' ? analysisResult(latestAnalysis.result).duplicateCandidates : undefined
  const parsedCandidates = Array.isArray(duplicateCandidates)
    ? duplicateCandidates.flatMap((item) => {
      const parsed = aiCandidateSchema.safeParse(item)
      return parsed.success ? [parsed.data] : []
    })
    : []
  const generatedCandidate = parsedCandidates.find((item) => item.complaintId === input.candidateId)
  const review = await prisma.$transaction(async (tx) => {
    const saved = await tx.duplicateReview.create({
      data: {
        complaintId: req.params.id,
        candidateId: input.candidateId,
        reviewerId: req.user!.id,
        decision: input.decision,
        similarity: generatedCandidate?.similarity,
        notes: input.notes,
      },
    })
    await tx.auditLog.create({ data: { actorId: req.user!.id, action: 'DUPLICATE_REVIEW_RECORDED', entityType: 'Complaint', entityId: req.params.id, metadata: { candidateId: input.candidateId, decision: input.decision }, ipAddress: req.ip } })
    return saved
  })
  res.status(201).json({ success: true, data: review })
}))

adminRouter.get('/audit-logs', asyncHandler(async (req, res) => {
  const page = Math.max(1, Number(req.query.page) || 1)
  const pageSize = Math.min(100, Math.max(1, Number(req.query.pageSize) || 50))
  const [items, total] = await prisma.$transaction([
    prisma.auditLog.findMany({ include: { actor: { select: { email: true, role: true } } }, orderBy: { createdAt: 'desc' }, skip: (page - 1) * pageSize, take: pageSize }),
    prisma.auditLog.count(),
  ])
  res.json({ success: true, data: { items, total, page, pageSize } })
}))

adminRouter.get('/sla', asyncHandler(async (_req, res) => {
  res.json({ success: true, data: await prisma.sLAConfiguration.findMany({ include: { category: true } }) })
}))
adminRouter.post('/sla', asyncHandler(async (req, res) => {
  const input = z.object({
    categoryId: z.string().uuid().nullable().optional(),
    priority: z.nativeEnum(Priority).nullable().optional(),
    responseHours: z.number().int().min(1).max(8760),
    resolutionHours: z.number().int().min(1).max(8760),
    active: z.boolean().optional(),
  }).parse(req.body)
  const config = await prisma.sLAConfiguration.create({ data: input })
  await writeAudit(req, 'SLA_CONFIGURATION_UPDATED', 'SLAConfiguration', config.id)
  res.status(201).json({ success: true, data: config })
}))
adminRouter.put('/sla/:id', asyncHandler(async (req, res) => {
  const id = z.string().uuid().parse(req.params.id)
  const input = z.object({
    categoryId: z.string().uuid().nullable().optional(),
    priority: z.nativeEnum(Priority).nullable().optional(),
    responseHours: z.number().int().min(1).max(8760),
    resolutionHours: z.number().int().min(1).max(8760),
    active: z.boolean().optional(),
  }).parse(req.body)
  const config = await prisma.sLAConfiguration.upsert({
    where: { id },
    create: { id, ...input },
    update: input,
  })
  await writeAudit(req, 'SLA_CONFIGURATION_UPDATED', 'SLAConfiguration', config.id)
  res.json({ success: true, data: config })
}))

adminRouter.get('/reports.csv', asyncHandler(async (req, res) => {
  const dateQuery = z.object({
    from: z.string().date().optional(),
    to: z.string().date().optional(),
  }).parse(req.query)
  if (dateQuery.from && dateQuery.to && dateQuery.from > dateQuery.to) {
    throw new HttpError(400, 'The report start date must be on or before its end date.')
  }
  const complaints = await prisma.complaint.findMany({
    where: dateQuery.from || dateQuery.to ? {
      createdAt: {
        ...(dateQuery.from ? { gte: new Date(`${dateQuery.from}T00:00:00.000Z`) } : {}),
        ...(dateQuery.to ? { lte: new Date(`${dateQuery.to}T23:59:59.999Z`) } : {}),
      },
    } : undefined,
    select: { trackingId: true, title: true, status: true, severity: true, priority: true, createdAt: true, category: { select: { name: true } }, department: { select: { name: true } } },
    orderBy: { createdAt: 'desc' },
    take: 10000,
  })
  const csvEscape = (value: string) => `"${(/^[\u0000-\u0020]*[=+\-@\t\r]/.test(value) ? `'${value}` : value).replace(/"/g, '""')}"`
  const lines = [
    ['tracking_id', 'title', 'category', 'department', 'status', 'severity', 'priority', 'created_at'].map(csvEscape).join(','),
    ...complaints.map((item) => [item.trackingId, item.title, item.category.name, item.department?.name ?? '', item.status, item.severity, item.priority, item.createdAt.toISOString()].map(csvEscape).join(',')),
  ]
  res.type('text/csv').attachment('complaints-report.csv').send(`\uFEFF${lines.join('\r\n')}`)
}))

adminRouter.get('/complaints/:id/duplicates', asyncHandler(async (req, res) => {
  const id = z.string().uuid().parse(req.params.id)
  const complaint = await prisma.complaint.findUnique({ where: { id }, select: { id: true, trackingId: true } })
  if (!complaint) throw new HttpError(404, 'Complaint not found.')
  const [reviews, latestAnalysis] = await Promise.all([
    prisma.duplicateReview.findMany({
      where: { OR: [{ complaintId: id }, { candidateId: id }] },
      include: { complaint: { select: { trackingId: true } }, candidate: { select: { trackingId: true } }, reviewer: { select: { email: true } } },
      orderBy: { createdAt: 'desc' },
    }),
    prisma.aIAnalysis.findFirst({ where: { complaintId: id }, orderBy: { createdAt: 'desc' }, select: { status: true, result: true } }),
  ])
  const duplicateCandidates = latestAnalysis?.status === 'COMPLETED' ? analysisResult(latestAnalysis.result).duplicateCandidates : undefined
  const parsedCandidates = Array.isArray(duplicateCandidates)
    ? duplicateCandidates.flatMap((item) => {
      const parsed = aiCandidateSchema.safeParse(item)
      return parsed.success ? [parsed.data] : []
    })
    : []
  const candidateRecords = parsedCandidates.length
    ? await prisma.complaint.findMany({
      where: { id: { in: parsedCandidates.map((item) => item.complaintId) } },
      select: {
        id: true,
        trackingId: true,
        title: true,
        description: true,
        incidentAt: true,
        createdAt: true,
        category: { select: { name: true } },
        location: { select: { address: true, city: true, district: true, state: true, latitude: true, longitude: true } },
        images: { select: { id: true, contentType: true, sizeBytes: true } },
      },
    })
    : []
  const byId = new Map(candidateRecords.map((record) => [record.id, record]))
  const candidates = parsedCandidates.flatMap((candidate) => {
    const record = byId.get(candidate.complaintId)
    return record ? [{ ...record, similarity: candidate.similarity, method: candidate.method, signals: candidate.signals }] : []
  })
  res.json({
    success: true,
    data: {
      complaintId: complaint.trackingId,
      analysisStatus: latestAnalysis?.status ?? 'NOT_CONFIGURED',
      candidates,
      reviews,
    },
  })
}))
