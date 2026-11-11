import { apiClient } from './api'
import type { ApiEnvelope } from './api.models'
import type { AdminAIMonitoring } from './ai.models'
import type { NotificationDeliveryPage } from './notification.models'
import { invalidatePortalData } from './queryClient'
import { isDemoMode, useAppStore } from '../store/useAppStore'

export const adminService = {
  getAIMonitoring: async (): Promise<AdminAIMonitoring> => {
    if (isDemoMode) {
      const counts: Record<string, number> = {}
      for (const complaint of useAppStore.getState().complaints) {
        const status = complaint.aiStatus ?? 'NOT_CONFIGURED'
        counts[status] = (counts[status] ?? 0) + 1
      }
      return { counts, modelAvailability: { status: 'not_configured' }, recentAnalyses: [] }
    }
    const response = await apiClient.get<ApiEnvelope<AdminAIMonitoring>>('/admin/ai/monitoring')
    return response.data.data
  },
  getNotificationDeliveries: async (): Promise<NotificationDeliveryPage> => {
    if (isDemoMode) return { items: [], total: 0, page: 1, pageSize: 50 }
    const response = await apiClient.get<ApiEnvelope<NotificationDeliveryPage>>('/admin/notification-deliveries?page=1&pageSize=50')
    return response.data.data
  },
  getDashboardStatistics: () => {
    const state = useAppStore.getState()
    if (state.dashboardStats) return state.dashboardStats
    return {
      complaints: state.complaints.length,
      citizens: state.citizens.length,
      officers: state.officers.filter((officer) => officer.active).length,
      statuses: {},
    }
  },
  getAuditLogs: () => useAppStore.getState().auditLogs,
  getReports: () => useAppStore.getState().complaints,
  setCitizenActive: async (id: string, active: boolean) => {
    if (isDemoMode) return useAppStore.getState().setCitizenActive(id, active)
    await apiClient.patch(`/admin/citizens/${id}/status`, { status: active ? 'ACTIVE' : 'INACTIVE' })
    await invalidatePortalData()
  },
  setOfficerActive: async (id: string, active: boolean) => {
    if (isDemoMode) return useAppStore.getState().setOfficerActive(id, active)
    await apiClient.patch(`/admin/officers/${id}/status`, { status: active ? 'ACTIVE' : 'INACTIVE' })
    await invalidatePortalData()
  },
  setPrioritySla: async (priority: string, hours: number) => {
    if (isDemoMode) return useAppStore.getState().setPrioritySla(priority as 'Low' | 'Medium' | 'High' | 'Critical', hours)
    const configs = await apiClient.get<{ data: { id: string; priority: string | null; categoryId: string | null }[] }>('/admin/sla')
    const existing = configs.data.data.find((item) => !item.categoryId && item.priority?.toLowerCase() === priority.toLowerCase())
    const body = {
      categoryId: null,
      priority: priority.toUpperCase(),
      responseHours: hours,
      resolutionHours: hours,
      active: true,
    }
    if (existing) await apiClient.put(`/admin/sla/${existing.id}`, body)
    else await apiClient.post('/admin/sla', body)
    await invalidatePortalData()
  },
  exportReport: async (from?: string, to?: string) => {
    if (isDemoMode) throw new Error('Report export is not available in demonstration mode.')
    const response = await apiClient.get('/admin/reports.csv', {
      params: { ...(from ? { from } : {}), ...(to ? { to } : {}) },
      responseType: 'blob',
    })
    return response.data as Blob
  },
  resetDemoData: () => {
    if (!isDemoMode) throw new Error('Demonstration data is not available in API mode.')
    useAppStore.getState().resetDemoData()
  },
}
