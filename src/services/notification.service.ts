import { useAppStore } from '../store/useAppStore'

export const notificationService = {
  getNotifications: () => useAppStore.getState().notifications,
  markAsRead: (id: string) => useAppStore.getState().markNotificationRead(id),
  markAllAsRead: () => useAppStore.getState().markAllNotificationsRead(),
}
