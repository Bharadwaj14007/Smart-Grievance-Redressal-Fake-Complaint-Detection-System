'use client'

import Link from 'next/link'
import { useEffect, useState } from 'react'
import type { ApiNotification } from '@shared/api-contracts'
import { PortalShell } from '../../../src/components/PortalShell'
import { useAuth } from '../../../src/components/AuthProvider'
import { apiRequest } from '../../../src/lib/api'

type NotificationPage = { items: ApiNotification[]; unreadCount: number; page: number; pageSize: number }

export default function NotificationsPage() {
  const { user } = useAuth()
  const [data, setData] = useState<NotificationPage | null>(null)
  const [error, setError] = useState('')

  async function load() {
    setData(await apiRequest<NotificationPage>('/notifications?page=1&pageSize=100'))
  }

  useEffect(() => {
    if (user) load().catch((reason: unknown) => setError(reason instanceof Error ? reason.message : 'Unable to load notifications.'))
  }, [user])

  async function markRead(id: string) {
    setError('')
    try {
      await apiRequest(`/notifications/${id}/read`, { method: 'PATCH' })
      await load()
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Unable to update notification.')
    }
  }

  async function markAllRead() {
    setError('')
    try {
      await apiRequest('/notifications/read-all', { method: 'PATCH' })
      await load()
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Unable to update notifications.')
    }
  }

  return (
    <PortalShell>
      <section className="page-heading heading-with-action"><div><span className="eyebrow">Your updates</span><h1>Notifications</h1><p>Important progress and account updates, all in one place.</p></div><button className="button button-quiet" onClick={() => void markAllRead()} disabled={!data?.unreadCount}>Mark all as read</button></section>
      {error && <p className="form-error" role="alert">{error}</p>}
      <section className="content-card">
        <div className="section-heading"><div><h2>Recent notifications</h2><p>{data?.unreadCount ?? 0} unread</p></div></div>
        {!data ? <div className="loading-block"><span className="spinner" />Loading notifications…</div> : data.items.length ? <div className="notification-list">{data.items.map((item) => <article className={`notification-item ${item.readAt ? '' : 'unread'}`} key={item.id}><span className="notification-icon">{item.readAt ? '○' : '●'}</span><div className="notification-copy"><strong>{item.message}</strong><small>{item.type.replaceAll('_', ' ')} · {new Date(item.createdAt).toLocaleString()}</small>{item.complaintId && <Link className="text-link" href={`/portal/complaints/${item.complaintId}`}>View grievance →</Link>}</div>{!item.readAt && <button className="text-button" onClick={() => void markRead(item.id)}>Mark read</button>}</article>)}</div> : <div className="empty-state"><span className="empty-icon">○</span><strong>You’re all caught up</strong><p>New updates will appear here.</p></div>}
      </section>
    </PortalShell>
  )
}
