'use client'

import Link from 'next/link'
import { useEffect, useState } from 'react'
import type { ApiComplaint } from '@shared/api-contracts'
import { ComplaintTable } from '../../../src/components/ComplaintTable'
import { PortalShell } from '../../../src/components/PortalShell'
import { useAuth } from '../../../src/components/AuthProvider'
import { apiRequest } from '../../../src/lib/api'

type ComplaintPage = { items: ApiComplaint[]; total: number; page: number; pageSize: number }

export default function ComplaintsPage() {
  const { user } = useAuth()
  const [data, setData] = useState<ComplaintPage | null>(null)
  const [query, setQuery] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!user) return
    setLoading(true)
    apiRequest<ComplaintPage>(`/complaints?page=1&pageSize=100${query ? `&q=${encodeURIComponent(query)}` : ''}`)
      .then(setData)
      .catch((reason: unknown) => setError(reason instanceof Error ? reason.message : 'Unable to load grievances.'))
      .finally(() => setLoading(false))
  }, [user, query])

  return (
    <PortalShell>
      <section className="page-heading heading-with-action"><div><span className="eyebrow">Case management</span><h1>Grievances</h1><p>Review your reports and the latest progress on every case.</p></div>{user?.role === 'CITIZEN' && <Link className="button button-primary" href="/portal/complaints/new">+ New grievance</Link>}</section>
      <section className="content-card">
        <div className="section-heading"><div><h2>All grievances</h2><p>{data?.total ?? 0} records visible to your account</p></div><label className="search-field"><span className="sr-only">Search complaints</span><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search title or tracking ID" /></label></div>
        {error && <p className="form-error" role="alert">{error}</p>}
        {loading ? <div className="loading-block"><span className="spinner" />Loading grievances…</div> : <ComplaintTable items={data?.items ?? []} />}
      </section>
    </PortalShell>
  )
}
