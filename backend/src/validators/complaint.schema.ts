import { ComplaintStatus, Priority } from '@prisma/client'
import { z } from 'zod'

export const createComplaintSchema = z.object({
  title: z.string().trim().min(10).max(200),
  description: z.string().trim().min(30).max(10000),
  categoryId: z.string().uuid(),
  severity: z.nativeEnum(Priority),
  incidentAt: z.string().datetime().optional(),
  consent: z.literal(true),
  location: z.object({
    address: z.string().trim().min(5).max(1000),
    state: z.string().trim().min(2).max(100),
    district: z.string().trim().min(2).max(100),
    city: z.string().trim().min(2).max(100),
    pincode: z.string().regex(/^\d{6}$/),
    latitude: z.number().min(-90).max(90),
    longitude: z.number().min(-180).max(180),
  }),
})

export const complaintQuerySchema = z.object({
  status: z.nativeEnum(ComplaintStatus).optional(),
  categoryId: z.string().uuid().optional(),
  departmentId: z.string().uuid().optional(),
  severity: z.nativeEnum(Priority).optional(),
  from: z.string().date().optional(),
  to: z.string().date().optional(),
  q: z.string().trim().max(200).optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
})

export const statusSchema = z.object({
  status: z.enum(['UNDER_INVESTIGATION', 'IN_PROGRESS', 'RESOLVED', 'CLOSED', 'ESCALATED']),
  note: z.string().trim().max(4000).optional(),
})
