import { apiClient, getApiErrorMessage, isUnauthorizedError } from './api'
import { mapSession, type ApiEnvelope, type ApiUser } from './api.models'
import { queryClient, invalidatePortalData } from './queryClient'
import { isDemoMode, useAppStore } from '../store/useAppStore'

function clearSessionData() {
  useAppStore.setState({
    session: null,
    complaints: [],
    notifications: [],
    departments: [],
    categories: [],
    officers: [],
    citizens: [],
    auditLogs: [],
    dashboardStats: undefined,
    prioritySlaHours: { Critical: 12, High: 24, Medium: 72, Low: 120 },
  })
  queryClient.removeQueries({ queryKey: ['portal-data'] })
  queryClient.removeQueries({ queryKey: ['complaint-detail'] })
}

export const authService = {
  login: async (email: string, password: string) => {
    if (isDemoMode) return useAppStore.getState().login(email, password)
    const response = await apiClient.post<ApiEnvelope<ApiUser>>('/auth/login', { email, password })
    const session = mapSession(response.data.data)
    clearSessionData()
    useAppStore.setState({ session })
    queryClient.setQueryData(['session'], session)
    return session
  },
  registerCitizen: async (name: string, email: string, password: string) => {
    if (isDemoMode) return useAppStore.getState().registerCitizen(name, email, password)
    try {
      await apiClient.post('/auth/register', { fullName: name, email, password })
      const session = await authService.login(email, password)
      return { user: session, error: session ? undefined : 'Account created. Sign in to continue.' }
    } catch (error) {
      return { user: null, error: getApiErrorMessage(error, 'Unable to create the account.') }
    }
  },
  getCurrentSession: async () => {
    if (isDemoMode) return useAppStore.getState().session
    try {
      const response = await apiClient.get<ApiEnvelope<ApiUser>>('/auth/me')
      return mapSession(response.data.data)
    } catch (error) {
      if (isUnauthorizedError(error)) return null
      throw error
    }
  },
  updateProfile: async (profile: {
    name: string
    phone: string
    address: string
    state: string
    district: string
    city: string
    pincode: string
  }) => {
    if (isDemoMode) {
      useAppStore.getState().updateProfile(profile)
      return useAppStore.getState().session
    }
    const body = useAppStore.getState().session?.role === 'officer'
      ? {
          fullName: profile.name,
          phone: profile.phone || null,
          jurisdiction: profile.address || null,
        }
      : {
          fullName: profile.name,
          phone: profile.phone || null,
          address: profile.address || null,
          state: profile.state || null,
          district: profile.district || null,
          city: profile.city || null,
          pincode: profile.pincode || null,
        }
    const response = await apiClient.patch<ApiEnvelope<ApiUser>>('/auth/me', body)
    const session = mapSession(response.data.data)
    useAppStore.setState({ session })
    queryClient.setQueryData(['session'], session)
    return session
  },
  logout: async () => {
    if (isDemoMode) {
      useAppStore.getState().logout()
      return
    }
    try {
      await apiClient.post('/auth/logout')
    } finally {
      clearSessionData()
      queryClient.setQueryData(['session'], null)
    }
  },
}
