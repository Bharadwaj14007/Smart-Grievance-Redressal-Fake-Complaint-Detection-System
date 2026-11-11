'use client'

import Link from 'next/link'
import { useEffect, useState, type FormEvent } from 'react'
import { PortalShell } from '../../../src/components/PortalShell'
import { apiRequest } from '../../../src/lib/api'

type Dashboard = { complaints: number; citizens: number; officers: number; departments: number }
type AIStatus = { counts: Record<string, number>; modelAvailability: { status: string; models?: Record<string, { status?: string; name?: string; revision?: string }> }; recentAnalyses: { id: string; createdAt: string; complaint: { id: string; trackingId: string; title: string }; predictedCategory?: string | null; recommendedPriority?: string | null; duplicateCandidates: unknown[]; imageIndicators: { imageId: string; indicator: string }[] }[] }
type Delivery = { id: string; channel: string; status: string; attemptCount: number; error?: string | null; updatedAt: string; notification: { type: string; message: string; user: { email: string } } }
type DeliveryPage = { items: Delivery[]; total: number }
type SLA = { id: string; categoryId?: string | null; category?: { name: string } | null; priority?: string | null; responseHours: number; resolutionHours: number; active: boolean }
type Category = { id: string; name: string }

export default function AdministrationPage() {
  const [dashboard, setDashboard] = useState<Dashboard | null>(null)
  const [ai, setAI] = useState<AIStatus | null>(null)
  const [deliveries, setDeliveries] = useState<DeliveryPage | null>(null)
  const [slas, setSLAs] = useState<SLA[]>([])
  const [categories, setCategories] = useState<Category[]>([])
  const [form, setForm] = useState({ categoryId: '', priority: '', responseHours: 24, resolutionHours: 72 })
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const [busy, setBusy] = useState(false)

  async function load() {
    const [stats, aiStatus, deliveryPage, slaRows, categoryRows] = await Promise.all([
      apiRequest<Dashboard>('/admin/dashboard'),
      apiRequest<AIStatus>('/admin/ai/monitoring'),
      apiRequest<DeliveryPage>('/admin/notification-deliveries?page=1&pageSize=50'),
      apiRequest<SLA[]>('/admin/sla'),
      apiRequest<Category[]>('/metadata/categories'),
    ])
    setDashboard(stats)
    setAI(aiStatus)
    setDeliveries(deliveryPage)
    setSLAs(slaRows)
    setCategories(categoryRows)
  }

  useEffect(() => {
    void load().catch((reason: unknown) => setError(reason instanceof Error ? reason.message : 'Unable to load administration data.'))
  }, [])

  async function updateSLA(id: string, value: Partial<SLA>) {
    const row = slas.find((item) => item.id === id)
    if (!row) return
    setBusy(true)
    setError('')
    setMessage('')
    try {
      await apiRequest(`/admin/sla/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ categoryId: row.categoryId ?? null, priority: row.priority ?? null, responseHours: value.responseHours ?? row.responseHours, resolutionHours: value.resolutionHours ?? row.resolutionHours, active: value.active ?? row.active }),
      })
      await load()
      setMessage('SLA configuration updated.')
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Unable to update SLA configuration.')
    } finally {
      setBusy(false)
    }
  }

  async function createSLA(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setBusy(true)
    setError('')
    setMessage('')
    try {
      await apiRequest('/admin/sla', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ categoryId: form.categoryId || null, priority: form.priority || null, responseHours: form.responseHours, resolutionHours: form.resolutionHours, active: true }),
      })
      await load()
      setMessage('SLA configuration created.')
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Unable to create SLA configuration.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <PortalShell roles={['ADMIN']}>
      <section className="page-heading"><span className="eyebrow">Operations</span><h1>Administration</h1><p>Monitor grievance activity, model availability, delivery outcomes, and response targets.</p></section>
      {error && <p className="form-error" role="alert">{error}</p>}{message && <p className="form-success" role="status">{message}</p>}
      <section className="metric-grid admin-metrics">
        <article className="metric-card"><span className="metric-label">Total grievances</span><strong>{dashboard?.complaints ?? '—'}</strong></article>
        <article className="metric-card"><span className="metric-label">Citizens</span><strong>{dashboard?.citizens ?? '—'}</strong></article>
        <article className="metric-card"><span className="metric-label">Active officers</span><strong>{dashboard?.officers ?? '—'}</strong></article>
        <article className="metric-card"><span className="metric-label">Departments</span><strong>{dashboard?.departments ?? '—'}</strong></article>
      </section>
      <section className="content-card">
        <div className="section-heading"><div><span className="eyebrow">AI service</span><h2>Analysis monitoring</h2><p>Model inference status and persisted analysis activity.</p></div><span className={`status-pill status-${(ai?.modelAvailability.status ?? 'unknown').toLowerCase()}`}>{ai?.modelAvailability.status ?? 'Loading'}</span></div>
        <div className="status-counts">{Object.entries(ai?.counts ?? {}).map(([status, count]) => <div key={status}><strong>{count}</strong><span>{status.replaceAll('_', ' ')}</span></div>)}</div>
        {ai?.modelAvailability.models && <div className="model-list">{Object.entries(ai.modelAvailability.models).map(([name, model]) => <span key={name}><strong>{name.replaceAll('_', ' ')}</strong> · {model.status ?? 'unknown'} {model.name ? `· ${model.name}` : ''}</span>)}</div>}
        <h3 className="subheading">Recent completed analyses</h3>
        {ai?.recentAnalyses.length ? <div className="analysis-list">{ai.recentAnalyses.map((item) => <article key={item.id}><div><Link className="table-link" href={`/portal/complaints/${item.complaint.id}`}>{item.complaint.title}<small>{item.complaint.trackingId} · {new Date(item.createdAt).toLocaleString()}</small></Link></div><span>Category: {String(item.predictedCategory ?? '—')}</span><span>Priority: {String(item.recommendedPriority ?? '—')}</span><span>{item.duplicateCandidates.length} candidate(s)</span><span>{item.imageIndicators.length} image signal(s)</span></article>)}</div> : <p className="muted">No completed AI analysis records are available.</p>}
      </section>
      <section className="content-card">
        <div className="section-heading"><div><span className="eyebrow">Communications</span><h2>Email and SMS delivery</h2><p>Provider delivery is tracked separately from in-app notifications.</p></div><span className="count-pill">{deliveries?.total ?? 0}</span></div>
        {deliveries?.items.length ? <div className="table-scroll"><table><thead><tr><th>Channel</th><th>Status</th><th>Recipient</th><th>Notification</th><th>Attempts</th><th>Last updated</th></tr></thead><tbody>{deliveries.items.map((item) => <tr key={item.id}><td>{item.channel}</td><td><span className={`status-pill status-${item.status.toLowerCase()}`}>{item.status.replaceAll('_', ' ')}</span>{item.error && <small className="error-detail">{item.error}</small>}</td><td>{item.notification.user.email}</td><td>{item.notification.message}</td><td>{item.attemptCount}</td><td>{new Date(item.updatedAt).toLocaleString()}</td></tr>)}</tbody></table></div> : <p className="muted">No external delivery attempts have been recorded. Unconfigured providers remain explicitly marked as not configured.</p>}
      </section>
      <section className="content-card">
        <div className="section-heading"><div><span className="eyebrow">Service targets</span><h2>SLA configurations</h2><p>Response and resolution targets currently applied to complaints.</p></div></div>
        {slas.length ? <div className="sla-list">{slas.map((sla) => <article className="sla-row" key={sla.id}><div><strong>{sla.category?.name ?? `${sla.priority ?? 'General'} priority`}</strong><small>{sla.active ? 'Active' : 'Inactive'} · ID {sla.id}</small></div><label>Response hours<input type="number" min="1" max="8760" value={sla.responseHours} onChange={(event) => setSLAs((items) => items.map((item) => item.id === sla.id ? { ...item, responseHours: Number(event.target.value) } : item))} /></label><label>Resolution hours<input type="number" min="1" max="8760" value={sla.resolutionHours} onChange={(event) => setSLAs((items) => items.map((item) => item.id === sla.id ? { ...item, resolutionHours: Number(event.target.value) } : item))} /></label><button className="button button-quiet" disabled={busy} onClick={() => void updateSLA(sla.id, {})}>Save</button></article>)}</div> : <p className="muted">No SLA configurations have been created.</p>}
        <form className="sla-create" onSubmit={createSLA}><h3>Add an SLA target</h3><div className="form-grid"><label>Category<select value={form.categoryId} onChange={(event) => setForm((current) => ({ ...current, categoryId: event.target.value, priority: '' }))}><option value="">All categories</option>{categories.map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}</select></label><label>Priority<select value={form.priority} onChange={(event) => setForm((current) => ({ ...current, priority: event.target.value, categoryId: '' }))}><option value="">All priorities</option>{['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'].map((priority) => <option key={priority} value={priority}>{priority}</option>)}</select></label><label>Response hours<input type="number" min="1" max="8760" required value={form.responseHours} onChange={(event) => setForm((current) => ({ ...current, responseHours: Number(event.target.value) }))} /></label><label>Resolution hours<input type="number" min="1" max="8760" required value={form.resolutionHours} onChange={(event) => setForm((current) => ({ ...current, resolutionHours: Number(event.target.value) }))} /></label></div><button className="button button-primary" disabled={busy}>Add SLA</button></form>
      </section>
    </PortalShell>
  )
}
