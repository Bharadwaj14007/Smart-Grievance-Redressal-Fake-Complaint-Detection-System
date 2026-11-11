import { Readable } from 'node:stream'
import { pipeline } from 'node:stream/promises'
import { ComplaintStatus, Prisma, Role } from '@prisma/client'
import { Router } from 'express'
import multer from 'multer'
import { prisma } from '../config/prisma.js'
import { authenticate, requireRoles } from '../middleware/auth.js'
import { asyncHandler, HttpError } from '../utils/errors.js'
import { complaintQuerySchema, createComplaintSchema, statusSchema } from '../validators/complaint.schema.js'
import { addInvestigationNote, assignComplaint, createComplaint, getComplaintForUser, listComplaints, updateStatus } from '../services/complaint.service.js'
import { getPrivateImage, storePrivateImage } from '../services/storage.service.js'
import { writeAudit } from '../services/audit.service.js'
import { queueComplaintReanalysis } from '../services/ai-analysis.service.js'

export const complaintRouter = Router()
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 512 * 1024, files: 4 } })
complaintRouter.use(authenticate)

complaintRouter.get('/', asyncHandler(async (req, res) => {
  const query = complaintQuerySchema.parse(req.query)
  res.json({ success: true, data: await listComplaints(req, query) })
}))
complaintRouter.post('/', requireRoles(Role.CITIZEN), asyncHandler(async (req, res) => {
  const input = createComplaintSchema.parse(req.body)
  const complaint = await createComplaint(req, input)
  res.status(201).json({ success: true, message: 'Complaint submitted successfully.', data: complaint })
}))

complaintRouter.get('/:id', asyncHandler(async (req, res) => {
  res.json({ success: true, data: await getComplaintForUser(req, req.params.id) })
}))

complaintRouter.patch('/:id/status', asyncHandler(async (req, res) => {
  if (req.user?.role === Role.CITIZEN) throw new HttpError(403, 'Citizens cannot change complaint status.')
  const input = statusSchema.parse(req.body)
  const result = await updateStatus(req, req.params.id, input.status as ComplaintStatus, input.note)
  res.json({ success: true, message: 'Complaint status updated.', data: result })
}))

complaintRouter.post('/:id/notes', asyncHandler(async (req, res) => {
  const body = req.body as { body?: unknown; isPublic?: unknown }
  if (typeof body.body !== 'string' || body.body.trim().length < 1 || body.body.length > 4000) throw new HttpError(400, 'A note of up to 4,000 characters is required.')
  if (body.isPublic !== undefined && typeof body.isPublic !== 'boolean') throw new HttpError(400, 'isPublic must be a boolean.')
  const note = await addInvestigationNote(req, req.params.id, body.body.trim(), body.isPublic === true)
  res.status(201).json({ success: true, message: 'Investigation note added.', data: note })
}))

complaintRouter.post('/:id/assign', requireRoles(Role.ADMIN), asyncHandler(async (req, res) => {
  const body = req.body as { officerId?: unknown; departmentId?: unknown }
  if (typeof body.officerId !== 'string') throw new HttpError(400, 'Officer ID is required.')
  if (body.departmentId !== undefined && typeof body.departmentId !== 'string') throw new HttpError(400, 'Department ID must be a string.')
  const complaint = await assignComplaint(req, req.params.id, body.officerId, body.departmentId)
  res.json({ success: true, message: 'Complaint assigned.', data: complaint })
}))

complaintRouter.post('/:id/images', upload.array('images', 4), asyncHandler(async (req, res) => {
  const complaint = await getComplaintForUser(req, req.params.id)
  if (req.user?.role !== Role.CITIZEN || complaint.citizenId !== req.user.id) throw new HttpError(403, 'Only the complaint owner can add complaint images.')
  const files = (req.files as Express.Multer.File[] | undefined) ?? []
  if (!files.length) throw new HttpError(400, 'Select at least one image.')
  const stored = []
  for (const file of files) {
    const object = await storePrivateImage(file.buffer, file.mimetype)
    stored.push(await prisma.complaintImage.create({
      data: { complaintId: complaint.id, objectKey: object.key, contentType: object.contentType, sizeBytes: object.sizeBytes },
    }))
  }
  if (stored.length) await queueComplaintReanalysis(complaint.id)
  await writeAudit(req, 'COMPLAINT_IMAGES_UPLOADED', 'Complaint', complaint.id, { count: stored.length })
  res.status(201).json({ success: true, message: 'Complaint images uploaded.', data: stored })
}))

complaintRouter.post('/:id/resolution-evidence', requireRoles(Role.OFFICER, Role.ADMIN), upload.single('image'), asyncHandler(async (req, res) => {
  const complaint = await getComplaintForUser(req, req.params.id)
  const file = req.file
  if (!file) throw new HttpError(400, 'Select an image file.')
  const object = await storePrivateImage(file.buffer, file.mimetype)
  const evidence = await prisma.resolutionEvidence.create({
    data: { complaintId: complaint.id, objectKey: object.key, contentType: object.contentType, sizeBytes: object.sizeBytes },
  })
  await writeAudit(req, 'RESOLUTION_EVIDENCE_UPLOADED', 'Complaint', complaint.id)
  res.status(201).json({ success: true, message: 'Resolution evidence uploaded.', data: evidence })
}))

complaintRouter.get('/:id/images/:imageId', asyncHandler(async (req, res) => {
  const complaint = await getComplaintForUser(req, req.params.id)
  const image = await prisma.complaintImage.findFirst({ where: { id: req.params.imageId, complaintId: complaint.id } })
  if (!image) throw new HttpError(404, 'Image not found.')
  const object = await getPrivateImage(image.objectKey)
  if (!object.Body) throw new HttpError(502, 'Private image storage returned no image data.')
  res.setHeader('Content-Type', image.contentType)
  res.setHeader('Cache-Control', 'private, no-store')
  await pipeline(object.Body as Readable, res)
}))

complaintRouter.get('/:id/resolution-evidence/:evidenceId', asyncHandler(async (req, res) => {
  const complaint = await getComplaintForUser(req, req.params.id)
  const evidence = await prisma.resolutionEvidence.findFirst({ where: { id: req.params.evidenceId, complaintId: complaint.id } })
  if (!evidence) throw new HttpError(404, 'Resolution evidence not found.')
  const object = await getPrivateImage(evidence.objectKey)
  if (!object.Body) throw new HttpError(502, 'Private image storage returned no image data.')
  res.setHeader('Content-Type', evidence.contentType)
  res.setHeader('Cache-Control', 'private, no-store')
  await pipeline(object.Body as Readable, res)
}))

complaintRouter.post('/:id/feedback', requireRoles(Role.CITIZEN), asyncHandler(async (req, res) => {
  const complaint = await getComplaintForUser(req, req.params.id)
  if (!['RESOLVED', 'CLOSED'].includes(complaint.status)) throw new HttpError(409, 'Feedback is available after a complaint is resolved.')
  const body = req.body as { rating?: unknown; comment?: unknown }
  if (!Number.isInteger(body.rating) || Number(body.rating) < 1 || Number(body.rating) > 5) throw new HttpError(400, 'Rating must be an integer from 1 to 5.')
  if (body.comment !== undefined && (typeof body.comment !== 'string' || body.comment.length > 2000)) throw new HttpError(400, 'Comment must be at most 2,000 characters.')
  const feedback = await prisma.feedback.create({
    data: { complaintId: complaint.id, citizenId: req.user!.id, rating: Number(body.rating), comment: body.comment as string | undefined },
  })
  await writeAudit(req, 'COMPLAINT_FEEDBACK_SUBMITTED', 'Complaint', complaint.id)
  res.status(201).json({ success: true, message: 'Feedback submitted.', data: feedback })
}))

complaintRouter.get('/:id/ai-analysis', asyncHandler(async (req, res) => {
  const complaint = await getComplaintForUser(req, req.params.id)
  const analyses = await prisma.aIAnalysis.findMany({
    where: { complaintId: complaint.id },
    orderBy: { createdAt: 'desc' },
  })
  const history = req.user?.role === Role.ADMIN
    ? analyses
    : analyses.map((analysis) => {
      const result = analysis.result && typeof analysis.result === 'object' && !Array.isArray(analysis.result)
        ? analysis.result as Prisma.JsonObject
        : {}
      const officerImages = Array.isArray(result.images)
        ? result.images.flatMap((image) => {
          if (!image || typeof image !== 'object' || Array.isArray(image)) return []
          const record = image as Prisma.JsonObject
          return [{
            id: record.id,
            width: record.width,
            height: record.height,
            format: record.format,
            capturedAt: record.capturedAt,
            classification: record.classification,
            forensicIndicators: record.forensicIndicators,
            elaMeanDifference: record.elaMeanDifference,
            opencv: record.opencv,
          }]
        })
        : []
      return {
      id: analysis.id,
      status: analysis.status,
      createdAt: analysis.createdAt,
      updatedAt: analysis.updatedAt,
      ...(req.user?.role === Role.OFFICER
        ? {
          result: {
            model: result.model,
            processedAt: result.processedAt,
            processingSeconds: result.processingSeconds,
            predictedCategory: result.predictedCategory,
            recommendedDepartment: result.recommendedDepartment,
            recommendedPriority: result.recommendedPriority,
            images: officerImages,
            humanReviewRequired: result.humanReviewRequired,
          },
        }
        : {}),
      }
    })
  res.json({
    success: true,
    data: {
      latest: history[0] ?? { status: 'NOT_CONFIGURED', result: null },
      history,
    },
  })
}))
