import { jest } from '@jest/globals'

type MockDelivery = {
  id: string
  channel: 'EMAIL' | 'SMS'
  attemptCount: number
  notification: {
    message: string
    complaint: { trackingId: string } | null
    user: {
      email: string
      citizenProfile: { phone: string | null } | null
      officerProfile: { phone: string | null } | null
    }
  }
}

const mockFindMany = jest.fn<(...args: unknown[]) => Promise<MockDelivery[]>>()
const mockUpdateMany = jest.fn<(...args: unknown[]) => Promise<{ count: number }>>()
const mockUpdate = jest.fn<(...args: unknown[]) => Promise<unknown>>()
const mockSendMail = jest.fn<(...args: unknown[]) => Promise<{ messageId?: string }>>()
const mockCreateTransport = jest.fn<(...args: unknown[]) => { sendMail: typeof mockSendMail }>()
const mockFetch = jest.fn<typeof fetch>()
const mockEnv: {
  emailDeliveryConfigured: boolean
  SMTP_HOST: string
  SMTP_PORT: number
  SMTP_FROM: string
  SMTP_USER?: string
  SMTP_PASSWORD?: string
  smsDeliveryConfigured: boolean
  SMS_ACCOUNT_SID?: string
  SMS_AUTH_TOKEN?: string
  SMS_FROM?: string
} = {
  emailDeliveryConfigured: true,
  SMTP_HOST: 'mail.example.test',
  SMTP_PORT: 587,
  SMTP_FROM: 'noreply@example.test',
  SMTP_USER: undefined,
  SMTP_PASSWORD: undefined,
  smsDeliveryConfigured: false,
  SMS_ACCOUNT_SID: undefined,
  SMS_AUTH_TOKEN: undefined,
  SMS_FROM: undefined,
}

jest.unstable_mockModule('../src/config/env.js', () => ({ env: mockEnv }))
jest.unstable_mockModule('../src/config/prisma.js', () => ({
  prisma: { notificationDelivery: { findMany: mockFindMany, updateMany: mockUpdateMany, update: mockUpdate } },
}))
jest.unstable_mockModule('nodemailer', () => ({ default: { createTransport: mockCreateTransport } }))

const { NotificationDeliveryStatus } = await import('@prisma/client')
const { deliverPendingNotifications } = await import('../src/services/notification-delivery.service.js')

function delivery(channel: MockDelivery['channel'], phone: string | null = '+14155550123'): MockDelivery {
  return {
    id: 'delivery-id',
    channel,
    attemptCount: 0,
    notification: {
      message: 'Your grievance status changed.',
      complaint: { trackingId: 'GRV-2026-000001' },
      user: {
        email: 'citizen@example.test',
        citizenProfile: { phone },
        officerProfile: null,
      },
    },
  }
}

describe('notification delivery worker', () => {
  const originalFetch = global.fetch

  beforeEach(() => {
    jest.clearAllMocks()
    mockEnv.smsDeliveryConfigured = false
    mockEnv.SMS_ACCOUNT_SID = undefined
    mockEnv.SMS_AUTH_TOKEN = undefined
    mockEnv.SMS_FROM = undefined
    mockFindMany.mockResolvedValue([delivery('EMAIL')])
    mockUpdateMany.mockResolvedValue({ count: 1 })
    mockUpdate.mockResolvedValue({})
    mockSendMail.mockResolvedValue({ messageId: 'email-message-id' })
    mockCreateTransport.mockReturnValue({ sendMail: mockSendMail })
    global.fetch = mockFetch
  })

  afterAll(() => {
    global.fetch = originalFetch
  })

  it('records a successful SMTP delivery', async () => {
    await deliverPendingNotifications()
    expect(mockCreateTransport).toHaveBeenCalledWith(expect.objectContaining({ host: 'mail.example.test', port: 587 }))
    expect(mockSendMail).toHaveBeenCalledWith(expect.objectContaining({
      to: 'citizen@example.test',
      subject: 'Nagrik Setu update: GRV-2026-000001',
      text: 'Your grievance status changed.',
    }))
    expect(mockUpdate).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ status: NotificationDeliveryStatus.DELIVERED, providerMessageId: 'email-message-id' }),
    }))
  })

  it('schedules a retry after a transient SMTP error', async () => {
    mockSendMail.mockRejectedValue(new Error('SMTP unavailable'))
    await deliverPendingNotifications()
    expect(mockUpdate).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        status: NotificationDeliveryStatus.QUEUED,
        error: 'SMTP unavailable',
        nextAttemptAt: expect.any(Date),
      }),
    }))
  })

  it('sends SMS through Twilio and records its provider id', async () => {
    mockEnv.smsDeliveryConfigured = true
    mockEnv.SMS_ACCOUNT_SID = 'AC123456789'
    mockEnv.SMS_AUTH_TOKEN = 'test-auth-token'
    mockEnv.SMS_FROM = '+14155550000'
    mockFindMany.mockResolvedValue([delivery('SMS')])
    mockFetch.mockResolvedValue(new Response(JSON.stringify({ sid: 'SM123456789' }), { status: 201 }))

    await deliverPendingNotifications()

    expect(mockFetch).toHaveBeenCalledWith(
      'https://api.twilio.com/2010-04-01/Accounts/AC123456789/Messages.json',
      expect.objectContaining({ method: 'POST' }),
    )
    expect(mockUpdate).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ status: NotificationDeliveryStatus.DELIVERED, providerMessageId: 'SM123456789' }),
    }))
  })
})
