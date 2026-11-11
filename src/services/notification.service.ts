import { apiClient } from './api'
import { invalidatePortalData } from './queryClient'
import { isDemoMode, useAppStore } from '../store/useAppStore'

export const notificationService = {
  getNotifications: () => useAppStore.getState().notifications,
  markAsRead: async (id: string) => {
    if (isDemoMode) return useAppStore.getState().markNotificationRead(id)
    await apiClient.patch(`/notifications/${id}/read`)
    await invalidatePortalData()
  },
  markAllAsRead: async () => {
    if (isDemoMode) return useAppStore.getState().markAllNotificationsRead()
    await apiClient.patch('/notifications/read-all')
    await invalidatePortalData()
  },
}
