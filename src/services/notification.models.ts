export type NotificationDelivery = {
  id: string
  channel: 'EMAIL' | 'SMS'
  status: 'NOT_CONFIGURED' | 'QUEUED' | 'PROCESSING' | 'DELIVERED' | 'FAILED'
  attemptCount: number
  providerMessageId?: string | null
  error?: string | null
  createdAt: string
  updatedAt: string
  notification: {
    type: string
    message: string
    user: { email: string }
  }
}

export type NotificationDeliveryPage = {
  items: NotificationDelivery[]
  total: number
  page: number
  pageSize: number
}
