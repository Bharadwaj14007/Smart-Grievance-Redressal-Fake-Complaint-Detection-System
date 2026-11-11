import type { ApiEnvelope } from '@shared/api-contracts'

const API_BASE = '/api/v1'
let refreshRequest: Promise<boolean> | null = null

export class ApiError extends Error {
  constructor(message: string, readonly status: number) {
    super(message)
    this.name = 'ApiError'
  }
}

async function refreshSession() {
  refreshRequest ??= fetch(`${API_BASE}/auth/refresh`, {
    method: 'POST',
    credentials: 'include',
    headers: { Accept: 'application/json' },
  }).then((response) => response.ok).catch(() => false).finally(() => { refreshRequest = null })
  return refreshRequest
}

function isSessionEndpoint(path: string) {
  return /^\/auth\/(?:login|register|refresh|logout)(?:\?|$)/.test(path)
}

async function send(path: string, init?: RequestInit): Promise<Response> {
  const response = await fetch(`${API_BASE}${path}`, {
    ...init,
    credentials: 'include',
    headers: { Accept: 'application/json', ...init?.headers },
  })
  if (response.status === 401 && !isSessionEndpoint(path) && await refreshSession()) {
    return fetch(`${API_BASE}${path}`, {
      ...init,
      credentials: 'include',
      headers: { Accept: 'application/json', ...init?.headers },
    })
  }
  return response
}

export async function apiRequest<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await send(path, init)
  const payload = await response.json().catch(() => null) as ApiEnvelope<T> | { success?: boolean; message?: string } | null
  if (!response.ok) {
    const message = payload && 'message' in payload && typeof payload.message === 'string'
      ? payload.message
      : `Request failed (${response.status}).`
    throw new ApiError(message, response.status)
  }
  if (payload && 'data' in payload) return payload.data
  if (payload && 'success' in payload && payload.success === true) return undefined as T
  throw new Error('The server returned an invalid response.')
}

export async function apiBlob(path: string) {
  const response = await send(path)
  if (!response.ok) throw new Error(`Unable to load private evidence (${response.status}).`)
  return response.blob()
}
