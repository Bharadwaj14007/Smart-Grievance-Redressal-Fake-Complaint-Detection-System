import { Router } from 'express'
import rateLimit from 'express-rate-limit'
import { z } from 'zod'
import { Role } from '@prisma/client'
import { prisma } from '../config/prisma.js'
import { authenticate } from '../middleware/auth.js'
import { asyncHandler, HttpError } from '../utils/errors.js'
import { loginSchema, registerSchema } from '../validators/auth.schema.js'
import { authenticateUser, getCurrentUser, registerCitizen, revokeRefreshToken, rotateRefreshToken } from '../services/auth.service.js'
import { clearSessionCookies, REFRESH_COOKIE, setSessionCookies } from '../services/token.service.js'

export const authRouter = Router()
const authLimiter = rateLimit({ windowMs: 15 * 60 * 1000, limit: 30, standardHeaders: true, legacyHeaders: false })
authRouter.use(authLimiter)

authRouter.post('/register', asyncHandler(async (req, res) => {
  const input = registerSchema.parse(req.body)
  const user = await registerCitizen(req, input)
  res.status(201).json({ success: true, message: 'Citizen account created.', data: { id: user.id, email: user.email, role: user.role, profile: user.citizenProfile } })
}))

authRouter.post('/login', asyncHandler(async (req, res) => {
  const input = loginSchema.parse(req.body)
  const { user, refreshToken } = await authenticateUser(req, input.email, input.password)
  setSessionCookies(res, user, refreshToken)
  res.json({ success: true, message: 'Signed in successfully.', data: { id: user.id, email: user.email, role: user.role, status: user.status, citizenProfile: user.citizenProfile, officerProfile: user.officerProfile } })
}))

authRouter.post('/refresh', asyncHandler(async (req, res) => {
  const rawToken = req.cookies?.[REFRESH_COOKIE] as string | undefined
  if (!rawToken) {
    clearSessionCookies(res)
    res.status(401).json({ success: false, message: 'Refresh session is missing.' })
    return
  }
  const { user, refreshToken } = await rotateRefreshToken(rawToken)
  setSessionCookies(res, user, refreshToken)
  res.json({ success: true, message: 'Session refreshed.', data: { id: user.id, email: user.email, role: user.role, status: user.status } })
}))

authRouter.post('/logout', asyncHandler(async (req, res) => {
  await revokeRefreshToken(req, req.cookies?.[REFRESH_COOKIE] as string | undefined)
  clearSessionCookies(res)
  res.json({ success: true, message: 'Signed out successfully.' })
}))

authRouter.get('/me', authenticate, asyncHandler(async (req, res) => {
  const user = await getCurrentUser(req.user!.id)
  res.json({ success: true, data: user })
}))

authRouter.patch('/me', authenticate, asyncHandler(async (req, res) => {
  if (req.user!.role === Role.CITIZEN) {
    const input = z.object({
      fullName: z.string().trim().min(2).max(160).optional(),
      phone: z.string().trim().max(32).nullable().optional(),
      address: z.string().trim().max(1000).nullable().optional(),
      state: z.string().trim().max(100).nullable().optional(),
      district: z.string().trim().max(100).nullable().optional(),
      city: z.string().trim().max(100).nullable().optional(),
      pincode: z.string().regex(/^\d{6}$/).nullable().optional(),
    }).refine((value) => Object.keys(value).length > 0).parse(req.body)
    await prisma.citizenProfile.update({ where: { userId: req.user!.id }, data: input })
  } else if (req.user!.role === Role.OFFICER) {
    const input = z.object({
      fullName: z.string().trim().min(2).max(160).optional(),
      phone: z.string().trim().max(32).nullable().optional(),
      jurisdiction: z.string().trim().max(2000).nullable().optional(),
    }).refine((value) => Object.keys(value).length > 0).parse(req.body)
    await prisma.officerProfile.update({ where: { userId: req.user!.id }, data: input })
  } else {
    throw new HttpError(403, 'Administrator profile changes are managed by the system operator.')
  }
  res.json({ success: true, message: 'Profile updated.', data: await getCurrentUser(req.user!.id) })
}))
