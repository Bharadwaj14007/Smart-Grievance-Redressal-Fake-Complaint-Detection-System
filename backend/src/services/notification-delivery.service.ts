import nodemailer from 'nodemailer'
import { NotificationChannel, NotificationDeliveryStatus, Prisma } from '@prisma/client'
import { env } from '../config/env.js'
import { prisma } from '../config/prisma.js'

type NotificationInput = {
  userId: string
  complaintId?: string
  type: string
  message: string
}

type DeliveryProvider = {
  send(recipient: string, subject: string, message: string): Promise<{ messageId?: string }>
}

function providerFor(channel: NotificationChannel): DeliveryProvider | undefined {
  if (channel === NotificationChannel.EMAIL && env.emailDeliveryConfigured && env.SMTP_HOST && env.SMTP_FROM) {
    const transport = nodemailer.createTransport({
      host: env.SMTP_HOST,
      port: env.SMTP_PORT,
      secure: env.SMTP_PORT === 465,
      ...(env.SMTP_USER && env.SMTP_PASSWORD ? { auth: { user: env.SMTP_USER, pass: env.SMTP_PASSWORD } } : {}),
    })
    return {
      async send(recipient, subject, message) {
        const result = await transport.sendMail({ from: env.SMTP_FROM, to: recipient, subject, text: message })
        return { messageId: result.messageId }
      },
    }
  }
  if (channel === NotificationChannel.SMS && env.smsDeliveryConfigured && env.SMS_ACCOUNT_SID && env.SMS_AUTH_TOKEN && env.SMS_FROM) {
    return {
      async send(recipient, _subject, message) {
        const body = new URLSearchParams({ To: recipient, From: env.SMS_FROM!, Body: message })
        const credentials = Buffer.from(`${env.SMS_ACCOUNT_SID}:${env.SMS_AUTH_TOKEN}`).toString('base64')
        const response = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${env.SMS_ACCOUNT_SID}/Messages.json`, {
          method: 'POST',
          headers: {
            Authorization: `Basic ${credentials}`,
            'Content-Type': 'application/x-www-form-urlencoded',
          },
          body,
          signal: AbortSignal.timeout(15_000),
        })
        const payload = await response.json() as { sid?: string; message?: string }
        if (!response.ok) throw new Error(payload.message ?? `SMS provider returned HTTP ${response.status}.`)
        return { messageId: payload.sid }
      },
    }
  }
  return undefined
}

export async function createNotification(tx: Prisma.TransactionClient, input: NotificationInput) {
  const notification = await tx.notification.create({
    data: {
      userId: input.userId,
      complaintId: input.complaintId,
      type: input.type,
      message: input.message,
    },
  })
  await tx.notificationDelivery.createMany({
    data: [
      {
        notificationId: notification.id,
        channel: NotificationChannel.EMAIL,
        status: env.emailDeliveryConfigured ? NotificationDeliveryStatus.QUEUED : NotificationDeliveryStatus.NOT_CONFIGURED,
        error: env.emailDeliveryConfigured ? null : 'SMTP delivery is not configured; in-app notification is available.',
      },
      {
        notificationId: notification.id,
        channel: NotificationChannel.SMS,
        status: env.smsDeliveryConfigured ? NotificationDeliveryStatus.QUEUED : NotificationDeliveryStatus.NOT_CONFIGURED,
        error: env.smsDeliveryConfigured ? null : 'SMS delivery is not configured; in-app notification is available.',
      },
    ],
  })
  return notification
}

function recipientFor(delivery: {
  channel: NotificationChannel
  notification: {
    user: {
      email: string
      citizenProfile: { phone: string | null } | null
      officerProfile: { phone: string | null } | null
    }
  }
}) {
  return delivery.channel === NotificationChannel.EMAIL
    ? delivery.notification.user.email
    : delivery.notification.user.citizenProfile?.phone ?? delivery.notification.user.officerProfile?.phone ?? undefined
}

function retryAt(attempt: number) {
  return new Date(Date.now() + Math.min(60 * 60 * 1000, 15_000 * 2 ** (attempt - 1)))
}

export async function deliverPendingNotifications() {
  const now = new Date()
  const staleBefore = new Date(now.getTime() - 2 * 60 * 1000)
  const pending = await prisma.notificationDelivery.findMany({
    where: {
      OR: [
        { status: NotificationDeliveryStatus.QUEUED, nextAttemptAt: { lte: now } },
        { status: NotificationDeliveryStatus.PROCESSING, updatedAt: { lte: staleBefore } },
      ],
    },
    orderBy: { createdAt: 'asc' },
    take: 50,
    include: {
      notification: {
        include: {
          user: {
            select: {
              email: true,
              citizenProfile: { select: { phone: true } },
              officerProfile: { select: { phone: true } },
            },
          },
          complaint: { select: { trackingId: true } },
        },
      },
    },
  })

  for (const delivery of pending) {
    const claimed = await prisma.notificationDelivery.updateMany({
      where: {
        id: delivery.id,
        OR: [
          { status: NotificationDeliveryStatus.QUEUED, nextAttemptAt: { lte: now } },
          { status: NotificationDeliveryStatus.PROCESSING, updatedAt: { lte: staleBefore } },
        ],
      },
      data: { status: NotificationDeliveryStatus.PROCESSING, attemptCount: { increment: 1 } },
    })
    if (!claimed.count) continue

    const provider = providerFor(delivery.channel)
    const recipient = recipientFor(delivery)
    if (!provider) {
      await prisma.notificationDelivery.update({
        where: { id: delivery.id },
        data: { status: NotificationDeliveryStatus.NOT_CONFIGURED, error: `${delivery.channel} provider is not configured.` },
      })
      continue
    }
    if (!recipient || (delivery.channel === NotificationChannel.SMS && !/^\+[1-9]\d{7,14}$/.test(recipient))) {
      await prisma.notificationDelivery.update({
        where: { id: delivery.id },
        data: { status: NotificationDeliveryStatus.FAILED, error: delivery.channel === NotificationChannel.SMS ? 'A valid E.164 phone number is not present.' : 'Recipient address is not present.' },
      })
      continue
    }

    try {
      const subject = `Nagrik Setu update${delivery.notification.complaint ? `: ${delivery.notification.complaint.trackingId}` : ''}`
      const result = await provider.send(recipient, subject, delivery.notification.message)
      await prisma.notificationDelivery.update({
        where: { id: delivery.id },
        data: { status: NotificationDeliveryStatus.DELIVERED, providerMessageId: result.messageId, error: null },
      })
    } catch (error) {
      const attempts = delivery.attemptCount + 1
      const message = error instanceof Error ? error.message.slice(0, 1000) : 'Notification provider failed.'
      await prisma.notificationDelivery.update({
        where: { id: delivery.id },
        data: {
          status: attempts >= 4 ? NotificationDeliveryStatus.FAILED : NotificationDeliveryStatus.QUEUED,
          nextAttemptAt: retryAt(attempts),
          error: message,
        },
      })
    }
  }
}
