import { ComplaintStatus, Prisma, Priority, Role } from '@prisma/client'
import type { Request } from 'express'
import { prisma } from '../config/prisma.js'
import { env } from '../config/env.js'
import { getAIQueue } from './queue.service.js'
import { writeAudit } from './audit.service.js'
import { HttpError } from '../utils/errors.js'

const transitions: Record<ComplaintStatus, ComplaintStatus[]> = {
  SUBMITTED: ['AI_ANALYSIS', 'ASSIGNED', 'UNDER_INVESTIGATION', 'ESCALATED'],
  AI_ANALYSIS: ['ASSIGNED', 'UNDER_INVESTIGATION', 'ESCALATED'],
  ASSIGNED: ['UNDER_INVESTIGATION', 'IN_PROGRESS', 'ESCALATED'],
  UNDER_INVESTIGATION: ['IN_PROGRESS', 'RESOLVED', 'ESCALATED'],
  IN_PROGRESS: ['UNDER_INVESTIGATION', 'RESOLVED', 'ESCALATED'],
  RESOLVED: ['CLOSED', 'IN_PROGRESS'],
  CLOSED: [],
  ESCALATED: ['ASSIGNED', 'UNDER_INVESTIGATION', 'IN_PROGRESS', 'RESOLVED'],
}

export async function createComplaint(req: Request, input: {
  title: string
  description: string
  categoryId: string
  severity: Priority
  incidentAt?: string
  consent: true
  location: { address: string; state: string; district: string; city: string; pincode: string; latitude: number; longitude: number }
}) {
  if (!req.user) throw new HttpError(401, 'Authentication required.')
  const category = await prisma.complaintCategory.findFirst({ where: { id: input.categoryId, active: true } })
  if (!category) throw new HttpError(400, 'Selected complaint category is unavailable.')

  const complaint = await prisma.$transaction(async (tx) => {
    const year = new Date().getUTCFullYear()
    const sequence = await tx.trackingSequence.upsert({
      where: { year },
      create: { year, value: 1 },
      update: { value: { increment: 1 } },
      select: { value: true },
    })
    const trackingId = `GRV-${year}-${String(sequence.value).padStart(6, '0')}`
    const created = await tx.complaint.create({
      data: {
        trackingId,
        citizenId: req.user!.id,
        categoryId: category.id,
        departmentId: category.departmentId,
        title: input.title,
        description: input.description,
        severity: input.severity,
        priority: input.severity,
        incidentAt: input.incidentAt ? new Date(input.incidentAt) : undefined,
        consent: input.consent,
        location: { create: input.location },
        history: { create: { toStatus: ComplaintStatus.SUBMITTED, actorId: req.user!.id, note: 'Complaint submitted.' } },
        aiAnalyses: { create: { status: env.REDIS_URL && env.AI_SERVICE_URL ? 'QUEUED' : 'NOT_CONFIGURED' } },
        notifications: { create: { userId: req.user!.id, type: 'COMPLAINT_SUBMITTED', message: `Complaint ${trackingId} was submitted.` } },
      },
      include: { category: true, location: true, history: true, aiAnalyses: true },
    })
    await tx.auditLog.create({
      data: { actorId: req.user!.id, action: 'COMPLAINT_SUBMITTED', entityType: 'Complaint', entityId: created.id, ipAddress: req.ip },
    })
    return created
  })

  if (env.REDIS_URL && env.AI_SERVICE_URL) {
    try {
      await getAIQueue()?.add('analyze-complaint', { complaintId: complaint.id }, {
        attempts: 4,
        backoff: { type: 'exponential', delay: 1500 },
        removeOnComplete: 1000,
        removeOnFail: 3000,
      })
    } catch (error) {
      console.error(`Failed to enqueue AI analysis for ${complaint.trackingId}`, error)
      await prisma.aIAnalysis.updateMany({ where: { complaintId: complaint.id }, data: { status: 'FAILED', error: 'AI job queue unavailable.' } })
    }
  }
  return complaint
}

export async function listComplaints(req: Request, query: {
  status?: string; categoryId?: string; departmentId?: string; severity?: Priority
  from?: string; to?: string; q?: string; page: number; pageSize: number
}) {
  if (!req.user) throw new HttpError(401, 'Authentication required.')
  const where: Prisma.ComplaintWhereInput = {}
  if (req.user.role === Role.CITIZEN) where.citizenId = req.user.id
  if (req.user.role === Role.OFFICER) where.assignments = { some: { officerId: req.user.id, active: true } }
  if (query.status && Object.values(ComplaintStatus).includes(query.status as ComplaintStatus)) where.status = query.status as ComplaintStatus
  if (query.categoryId) where.categoryId = query.categoryId
  if (query.departmentId) where.departmentId = query.departmentId
  if (query.severity) where.severity = query.severity
  if (query.from || query.to) where.createdAt = { ...(query.from ? { gte: new Date(query.from) } : {}), ...(query.to ? { lte: new Date(`${query.to}T23:59:59.999Z`) } : {}) }
  if (query.q) where.OR = [
    { trackingId: { contains: query.q, mode: 'insensitive' } },
    { title: { contains: query.q, mode: 'insensitive' } },
    { description: { contains: query.q, mode: 'insensitive' } },
  ]
  const [items, total] = await prisma.$transaction([
    prisma.complaint.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip: (query.page - 1) * query.pageSize,
      take: query.pageSize,
      include: { category: true, department: true, location: true, assignments: { where: { active: true }, include: { officer: { select: { id: true, email: true, officerProfile: true } } } } },
    }),
    prisma.complaint.count({ where }),
  ])
  return { items, total, page: query.page, pageSize: query.pageSize }
}

export async function getComplaintForUser(req: Request, id: string) {
  if (!req.user) throw new HttpError(401, 'Authentication required.')
  const complaint = await prisma.complaint.findUnique({
    where: { id },
    include: {
      category: true, department: true, location: true, images: true, resolutionEvidence: true,
      history: { orderBy: { createdAt: 'asc' } },
      notes: { where: req.user.role !== Role.CITIZEN ? {} : { isPublic: true }, orderBy: { createdAt: 'asc' }, include: { author: { select: { email: true, role: true } } } },
      assignments: { where: { active: true }, include: { officer: { select: { id: true, email: true, officerProfile: true } } } },
      aiAnalyses: { orderBy: { createdAt: 'desc' }, take: 1 },
    },
  })
  if (!complaint) throw new HttpError(404, 'Complaint not found.')
  if (req.user.role === Role.CITIZEN && complaint.citizenId !== req.user.id) throw new HttpError(403, 'You cannot access this complaint.')
  if (req.user.role === Role.OFFICER && !complaint.assignments.some((assignment) => assignment.officerId === req.user!.id && assignment.active)) throw new HttpError(403, 'This complaint is not assigned to you.')
  return complaint
}

export async function updateStatus(req: Request, id: string, nextStatus: ComplaintStatus, note?: string) {
  await getComplaintForUser(req, id)
  const result = await prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM complaints WHERE id = ${id}::uuid FOR UPDATE`
    const current = await tx.complaint.findUnique({ where: { id } })
    if (!current) throw new HttpError(404, 'Complaint not found.')
    if (req.user!.role === Role.OFFICER) {
      const assignment = await tx.complaintAssignment.findFirst({ where: { complaintId: id, officerId: req.user!.id, active: true }, select: { id: true } })
      if (!assignment) throw new HttpError(403, 'This complaint is not assigned to you.')
    }
    if (!transitions[current.status].includes(nextStatus)) throw new HttpError(409, `Cannot transition complaint from ${current.status} to ${nextStatus}.`)
    const changed = await tx.complaint.updateMany({ where: { id, status: current.status }, data: { status: nextStatus } })
    if (!changed.count) throw new HttpError(409, 'Complaint status changed; reload and try again.')
    const complaint = await tx.complaint.findUniqueOrThrow({ where: { id } })
    await tx.complaintStatusHistory.create({ data: { complaintId: id, fromStatus: current.status, toStatus: nextStatus, note, actorId: req.user!.id } })
    await tx.notification.create({
      data: {
        userId: current.citizenId,
        complaintId: id,
        type: nextStatus === 'RESOLVED' ? 'COMPLAINT_RESOLVED' : nextStatus === 'ESCALATED' ? 'COMPLAINT_ESCALATED' : 'STATUS_CHANGED',
        message: `Complaint ${current.trackingId} status changed to ${nextStatus}.`,
      },
    })
    await tx.auditLog.create({ data: { actorId: req.user!.id, action: 'COMPLAINT_STATUS_CHANGED', entityType: 'Complaint', entityId: id, metadata: { from: current.status, to: nextStatus }, ipAddress: req.ip } })
    return complaint
  })
  return result
}

export async function addInvestigationNote(req: Request, id: string, body: string, isPublic: boolean) {
  const complaint = await getComplaintForUser(req, id)
  if (req.user?.role === Role.CITIZEN) throw new HttpError(403, 'Citizens cannot add investigation notes.')
  const note = await prisma.$transaction(async (tx) => {
    const created = await tx.investigationNote.create({ data: { complaintId: id, authorId: req.user!.id, body, isPublic } })
    await tx.auditLog.create({ data: { actorId: req.user!.id, action: 'INVESTIGATION_NOTE_ADDED', entityType: 'Complaint', entityId: id, ipAddress: req.ip } })
    if (isPublic) await tx.notification.create({ data: { userId: complaint.citizenId, complaintId: id, type: 'OFFICER_REMARK', message: `A new update was added to ${complaint.trackingId}.` } })
    return created
  })
  return note
}

export async function assignComplaint(req: Request, id: string, officerId: string, departmentId?: string) {
  const complaint = await prisma.complaint.findUnique({ where: { id } })
  if (!complaint) throw new HttpError(404, 'Complaint not found.')
  const officer = await prisma.user.findFirst({ where: { id: officerId, role: Role.OFFICER, status: 'ACTIVE' }, include: { officerProfile: true } })
  if (!officer?.officerProfile) throw new HttpError(400, 'Selected officer is unavailable.')
  const department = departmentId ?? officer.officerProfile.departmentId ?? complaint.departmentId
  if (!department) throw new HttpError(400, 'A department must be selected for assignment.')
  return prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM complaints WHERE id = ${id}::uuid FOR UPDATE`
    const current = await tx.complaint.findUnique({ where: { id } })
    if (!current) throw new HttpError(404, 'Complaint not found.')
    if (current.status === 'CLOSED' || current.status === 'RESOLVED') throw new HttpError(409, 'Resolved or closed complaints cannot be assigned.')
    const activeOfficer = await tx.user.findFirst({ where: { id: officerId, role: Role.OFFICER, status: 'ACTIVE' }, select: { id: true } })
    if (!activeOfficer) throw new HttpError(400, 'Selected officer is unavailable.')
    const activeDepartment = await tx.department.findFirst({ where: { id: department, active: true }, select: { id: true } })
    if (!activeDepartment) throw new HttpError(400, 'Selected department is unavailable.')
    await tx.complaintAssignment.updateMany({ where: { complaintId: id, active: true }, data: { active: false, endedAt: new Date() } })
    await tx.complaintAssignment.create({ data: { complaintId: id, officerId, departmentId: department, assignedById: req.user!.id } })
    const updated = await tx.complaint.update({ where: { id }, data: { departmentId: department, status: 'ASSIGNED' } })
    await tx.complaintStatusHistory.create({ data: { complaintId: id, fromStatus: current.status, toStatus: 'ASSIGNED', actorId: req.user!.id, note: 'Complaint assigned to an officer.' } })
    await tx.notification.create({ data: { userId: current.citizenId, complaintId: id, type: 'COMPLAINT_ASSIGNED', message: `Complaint ${current.trackingId} was assigned for investigation.` } })
    await tx.auditLog.create({ data: { actorId: req.user!.id, action: 'COMPLAINT_ASSIGNED', entityType: 'Complaint', entityId: id, metadata: { officerId, departmentId: department }, ipAddress: req.ip } })
    return updated
  })
}
