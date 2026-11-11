'use client'

import Link from 'next/link'
import { useEffect, useState } from 'react'
import type { ApiComplaint } from '@shared/api-contracts'
import { useAuth } from '../../src/components/AuthProvider'
import { ComplaintTable } from '../../src/components/ComplaintTable'
import { PortalShell } from '../../src/components/PortalShell'
import { apiRequest } from '../../src/lib/api'

type Summary = { complaints: number; citizens: number; officers: number; departments: number }
type ComplaintPage = { items: ApiComplaint[]; total: number }

export default function PortalHomePage() {
  const { user } = useAuth()
  const [complaints, setComplaints] = useState<ApiComplaint[]>([])
  const [total, setTotal] = useState(0)
  const [summary, setSummary] = useState<Summary | null>(null)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!user) return
    const complaintTask = apiRequest<ComplaintPage>('/complaints?page=1&pageSize=5')
    const adminTask = user.role === 'ADMIN' ? apiRequest<Summary>('/admin/dashboard') : Promise.resolve(null)
    Promise.all([complaintTask, adminTask]).then(([page, admin]) => {
      setComplaints(page.items)
      setTotal(page.total)
      setSummary(admin)
    }).catch((reason: unknown) => setError(reason instanceof Error ? reason.message : 'Unable to load the portal.'))
  }, [user])

  const isCitizen = user?.role === 'CITIZEN'
  const title = isCitizen ? `Good to see you, ${user?.citizenProfile?.fullName ?? 'there'}.` : user?.role === 'OFFICER' ? 'Your response queue' : 'Administration overview'

  return (
    <PortalShell>
      <section className="page-heading heading-with-action">
        <div><span className="eyebrow">{isCitizen ? 'Citizen portal' : user?.role === 'OFFICER' ? 'Officer workspace' : 'Operations'}</span><h1>{title}</h1><p>{isCitizen ? 'Stay informed and keep every grievance moving toward a resolution.' : 'Review active cases, follow updates, and keep public services moving.'}</p></div>
        {isCitizen && <Link className="button button-primary" href="/portal/complaints/new">+ New grievance</Link>}
      </section>
      {error && <p className="form-error" role="alert">{error}</p>}
      <section className="metric-grid">
        <article className="metric-card"><span className="metric-label">{isCitizen ? 'Your grievances' : 'Visible grievances'}</span><strong>{total}</strong><small>Across all statuses</small><span className="metric-icon">▤</span></article>
        <article className="metric-card"><span className="metric-label">In progress</span><strong>{complaints.filter((item) => ['ASSIGNED', 'UNDER_INVESTIGATION', 'IN_PROGRESS'].includes(item.status)).length}</strong><small>Being reviewed by a team</small><span className="metric-icon">◷</span></article>
        <article className="metric-card"><span className="metric-label">Resolved</span><strong>{complaints.filter((item) => ['RESOLVED', 'CLOSED'].includes(item.status)).length}</strong><small>Latest five visible</small><span className="metric-icon">✓</span></article>
        {summary && <article className="metric-card"><span className="metric-label">Active officers</span><strong>{summary.officers}</strong><small>{summary.departments} departments</small><span className="metric-icon">♙</span></article>}
      </section>
      <section className="content-card">
        <div className="section-heading"><div><h2>Recent grievances</h2><p>{isCitizen ? 'Your latest submissions and status updates.' : 'The most recently submitted cases in your queue.'}</p></div><Link className="text-link" href="/portal/complaints">View all →</Link></div>
        {complaints.length ? <ComplaintTable items={complaints} /> : <div className="empty-state"><span className="empty-icon">○</span><strong>Nothing to show yet</strong><p>{isCitizen ? 'Submit your first grievance to start tracking it here.' : 'No cases are currently in your queue.'}</p>{isCitizen && <Link className="button button-primary" href="/portal/complaints/new">Submit a grievance</Link>}</div>}
      </section>
    </PortalShell>
  )
}
