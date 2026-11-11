import axios, { type AxiosError, type InternalAxiosRequestConfig } from 'axios'

export const apiClient = axios.create({
  baseURL: import.meta.env.VITE_API_BASE_URL || '/api/v1',
  headers: { Accept: 'application/json' },
  timeout: 15000,
  withCredentials: true,
})

type RetryableRequest = InternalAxiosRequestConfig & { _retriedAfterRefresh?: boolean }
let refreshInFlight: Promise<unknown> | null = null

apiClient.interceptors.response.use(undefined, async (error: unknown) => {
  if (!axios.isAxiosError(error) || error.response?.status !== 401) throw error
  const request = error.config as RetryableRequest | undefined
  const isSessionEndpoint = /^\/?auth\/(?:login|register|refresh|logout)(?:\?|$)/.test(request?.url ?? '')
  if (!request || request._retriedAfterRefresh || isSessionEndpoint) throw error
  request._retriedAfterRefresh = true
  refreshInFlight ??= axios.post(`${(apiClient.defaults.baseURL ?? '').replace(/\/+$/, '')}/auth/refresh`, {}, { withCredentials: true })
    .finally(() => { refreshInFlight = null })
  try {
    await refreshInFlight
    return apiClient.request(request)
  } catch {
    if (typeof window !== 'undefined') window.dispatchEvent(new Event('portal:session-expired'))
    throw error
  }
})

export function getApiErrorMessage(error: unknown, fallback = 'The request could not be completed.') {
  if (axios.isAxiosError(error)) {
    const data = error.response?.data as { message?: unknown } | undefined
    if (typeof data?.message === 'string') return data.message
    if (!error.response) return 'The service could not be reached. Check your connection and try again.'
  }
  return error instanceof Error ? error.message : fallback
}

export function isUnauthorizedError(error: unknown) {
  return (error as AxiosError | undefined)?.response?.status === 401
}
