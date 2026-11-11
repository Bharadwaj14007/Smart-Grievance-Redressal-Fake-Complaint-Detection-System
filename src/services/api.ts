import axios, { type InternalAxiosRequestConfig } from 'axios'

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
  const isSessionEndpoint = /^\/auth\/(?:login|register|refresh|logout)(?:\?|$)/.test(request?.url ?? '')
  if (!request || request._retriedAfterRefresh || isSessionEndpoint) throw error
  request._retriedAfterRefresh = true
  refreshInFlight ??= axios.post(`${apiClient.defaults.baseURL}/auth/refresh`, {}, { withCredentials: true })
    .finally(() => { refreshInFlight = null })
  try {
    await refreshInFlight
    return apiClient.request(request)
  } catch {
    throw error
  }
})
