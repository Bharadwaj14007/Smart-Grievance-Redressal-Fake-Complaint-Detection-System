import { z } from 'zod'

export const registerSchema = z.object({
  email: z.string().trim().email().max(320).transform((value) => value.toLowerCase()),
  password: z.string().min(12).max(128),
  fullName: z.string().trim().min(2).max(160),
  phone: z.string().trim().max(32).optional(),
})

export const loginSchema = z.object({
  email: z.string().trim().email().max(320).transform((value) => value.toLowerCase()),
  password: z.string().min(1).max(128),
})
