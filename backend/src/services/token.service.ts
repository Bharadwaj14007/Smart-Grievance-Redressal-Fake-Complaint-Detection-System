import { createHmac, randomBytes } from 'node:crypto'
import jwt from 'jsonwebtoken'
import type { Response } from 'express'
import { env } from '../config/env.js'

export const ACCESS_COOKIE = 'accessToken'
export const REFRESH_COOKIE = 'refreshToken'
export const refreshCookieOptions = {
  httpOnly: true,
  secure: env.cookieSecure,
  sameSite: 'lax' as const,
  path: '/api/v1/auth',
  maxAge: 30 * 24 * 60 * 60 * 1000,
}

export function hashRefreshToken(token: string) {
  return createHmac('sha256', env.REFRESH_TOKEN_SECRET).update(token).digest('hex')
}

export function createRefreshToken() {
  return randomBytes(48).toString('base64url')
}

export function setSessionCookies(res: Response, user: { id: string; email: string; role: string }, refreshToken: string) {
  const accessToken = jwt.sign({ email: user.email, role: user.role }, env.JWT_SECRET, { subject: user.id, expiresIn: '15m', issuer: 'nagrik-setu-api' })
  res.cookie(ACCESS_COOKIE, accessToken, {
    httpOnly: true,
    secure: env.cookieSecure,
    sameSite: 'lax',
    path: '/api',
    maxAge: 15 * 60 * 1000,
  })
  res.cookie(REFRESH_COOKIE, refreshToken, refreshCookieOptions)
}

export function clearSessionCookies(res: Response) {
  res.clearCookie(ACCESS_COOKIE, { httpOnly: true, secure: env.cookieSecure, sameSite: 'lax', path: '/api' })
  res.clearCookie(REFRESH_COOKIE, { httpOnly: true, secure: env.cookieSecure, sameSite: 'lax', path: '/api/v1/auth' })
}
