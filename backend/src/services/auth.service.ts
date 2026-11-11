import argon2 from 'argon2'
import { Role } from '@prisma/client'
import type { Request } from 'express'
import { prisma } from '../config/prisma.js'
import { HttpError } from '../utils/errors.js'
import { createRefreshToken, hashRefreshToken } from './token.service.js'
import { writeAudit } from './audit.service.js'

const refreshExpiry = () => new Date(Date.now() + 30 * 24 * 60 * 60 * 1000)

export async function registerCitizen(req: Request, input: { email: string; password: string; fullName: string; phone?: string }) {
  const passwordHash = await argon2.hash(input.password, { type: argon2.argon2id })
  const user = await prisma.$transaction(async (tx) => {
    const created = await tx.user.create({
      data: {
        email: input.email,
        passwordHash,
        role: Role.CITIZEN,
        citizenProfile: { create: { fullName: input.fullName, phone: input.phone } },
      },
      select: { id: true, email: true, role: true, status: true, citizenProfile: true },
    })
    await tx.auditLog.create({ data: { actorId: created.id, action: 'CITIZEN_REGISTERED', entityType: 'User', entityId: created.id, ipAddress: req.ip } })
    return created
  })
  return user
}

export async function authenticateUser(req: Request, email: string, password: string) {
  const user = await prisma.user.findUnique({
    where: { email },
    include: { citizenProfile: true, officerProfile: true },
  })
  if (!user || user.status !== 'ACTIVE' || !(await argon2.verify(user.passwordHash, password))) {
    throw new HttpError(401, 'Invalid email or password.')
  }
  const refreshToken = createRefreshToken()
  await prisma.$transaction([
    prisma.refreshToken.create({ data: { userId: user.id, tokenHash: hashRefreshToken(refreshToken), expiresAt: refreshExpiry() } }),
    prisma.auditLog.create({ data: { actorId: user.id, action: 'LOGIN', entityType: 'User', entityId: user.id, ipAddress: req.ip } }),
  ])
  return { user, refreshToken }
}

export async function rotateRefreshToken(rawToken: string) {
  const tokenHash = hashRefreshToken(rawToken)
  const token = await prisma.refreshToken.findUnique({ where: { tokenHash }, include: { user: true } })
  if (!token || token.revokedAt || token.expiresAt <= new Date() || token.user.status !== 'ACTIVE') {
    throw new HttpError(401, 'Refresh session is invalid or expired.')
  }
  const refreshToken = createRefreshToken()
  await prisma.$transaction(async (tx) => {
    const consumed = await tx.refreshToken.updateMany({
      where: { id: token.id, revokedAt: null, expiresAt: { gt: new Date() } },
      data: { revokedAt: new Date() },
    })
    if (consumed.count !== 1) throw new HttpError(401, 'Refresh session has already been used.')
    await tx.refreshToken.create({ data: { userId: token.userId, tokenHash: hashRefreshToken(refreshToken), expiresAt: refreshExpiry() } })
  })
  return { user: token.user, refreshToken }
}

export async function revokeRefreshToken(req: Request, rawToken?: string) {
  if (!rawToken) return
  const tokenHash = hashRefreshToken(rawToken)
  const token = await prisma.refreshToken.findUnique({ where: { tokenHash }, select: { id: true, userId: true } })
  if (!token) return
  await prisma.$transaction([
    prisma.refreshToken.updateMany({ where: { id: token.id, revokedAt: null }, data: { revokedAt: new Date() } }),
    prisma.auditLog.create({ data: { actorId: req.user?.id ?? token.userId, action: 'LOGOUT', entityType: 'User', entityId: token.userId, ipAddress: req.ip } }),
  ])
}

export async function getCurrentUser(userId: string) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, email: true, role: true, status: true, createdAt: true, citizenProfile: true, officerProfile: { include: { department: true } } },
  })
  if (!user || user.status !== 'ACTIVE') throw new HttpError(401, 'Account is inactive or unavailable.')
  return user
}
