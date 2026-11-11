'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useEffect, useState, type FormEvent } from 'react'
import type { ApiComplaint } from '@shared/api-contracts'
import { PortalShell } from '../../../../src/components/PortalShell'
import { useAuth } from '../../../../src/components/AuthProvider'
import { apiRequest } from '../../../../src/lib/api'

type Category = { id: string; name: string; defaultPriority: string; slaHours: number }

export default function NewComplaintPage() {
  const { user } = useAuth()
  const router = useRouter()
  const [categories, setCategories] = useState<Category[]>([])
  const [files, setFiles] = useState<FileList | null>(null)
  const [createdId, setCreatedId] = useState('')
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)
  const [form, setForm] = useState({
    title: '', description: '', categoryId: '', severity: 'MEDIUM', address: '', state: '', district: '', city: '', pincode: '', latitude: '', longitude: '',
  })

  useEffect(() => {
    if (user?.role === 'CITIZEN') apiRequest<Category[]>('/metadata/categories').then((items) => setCategories(items)).catch((reason: unknown) => setError(reason instanceof Error ? reason.message : 'Unable to load categories.'))
  }, [user])

  function update(field: keyof typeof form, value: string) {
    setForm((current) => ({ ...current, [field]: value }))
  }

  function useLocation() {
    if (!navigator.geolocation) {
      setError('Location access is not available in this browser.')
      return
    }
    navigator.geolocation.getCurrentPosition(
      ({ coords }) => setForm((current) => ({ ...current, latitude: String(coords.latitude), longitude: String(coords.longitude) })),
      () => setError('Unable to access your location. You can enter the coordinates manually.'),
      { enableHighAccuracy: true, timeout: 10000 },
    )
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setError('')
    setSaving(true)
    try {
      if (files && (files.length > 4 || Array.from(files).some((file) => file.size > 512 * 1024))) {
        throw new Error('Choose no more than four images, each 512 KB or smaller.')
      }
      const complaint = await apiRequest<ApiComplaint>('/complaints', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: form.title,
          description: form.description,
          categoryId: form.categoryId,
          severity: form.severity,
          consent: true,
          location: {
            address: form.address,
            state: form.state,
            district: form.district,
            city: form.city,
            pincode: form.pincode,
            latitude: Number(form.latitude),
            longitude: Number(form.longitude),
          },
        }),
      })
      setCreatedId(complaint.id)
      if (files?.length) {
        const body = new FormData()
        Array.from(files).forEach((file) => body.append('images', file))
        try {
          await apiRequest(`/complaints/${complaint.id}/images`, { method: 'POST', body })
        } catch (reason) {
          setError(`Grievance ${complaint.trackingId} was created, but image upload failed: ${reason instanceof Error ? reason.message : 'upload error'}`)
          return
        }
      }
      router.push(`/portal/complaints/${complaint.id}`)
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Unable to submit your grievance.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <PortalShell roles={['CITIZEN']}>
      <div className="breadcrumb"><Link href="/portal/complaints">Grievances</Link><span>/</span><span>New grievance</span></div>
      <section className="page-heading"><span className="eyebrow">Tell us what happened</span><h1>Raise a grievance</h1><p>Include a clear description and location so the right team can investigate.</p></section>
      <form className="content-card form-card" onSubmit={submit}>
        <div className="form-section"><h2>Issue details</h2><div className="form-grid">
          <label className="span-two">Title<input required minLength={10} maxLength={200} value={form.title} onChange={(event) => update('title', event.target.value)} placeholder="A short summary of the issue" /></label>
          <label>Category<select required value={form.categoryId} onChange={(event) => update('categoryId', event.target.value)}><option value="">Choose a category</option>{categories.map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}</select></label>
          <label>Severity<select value={form.severity} onChange={(event) => update('severity', event.target.value)}><option value="LOW">Low</option><option value="MEDIUM">Medium</option><option value="HIGH">High</option><option value="CRITICAL">Critical</option></select></label>
          <label className="span-two">Description<textarea required minLength={30} maxLength={10000} rows={5} value={form.description} onChange={(event) => update('description', event.target.value)} placeholder="Describe the issue, when it began, and any relevant details." /></label>
        </div></div>
        <div className="form-section"><div className="section-heading"><div><h2>Issue location</h2><p>Use a precise location so the department can respond.</p></div><button className="button button-quiet" type="button" onClick={useLocation}>Use my location</button></div>
          <div className="form-grid">
            <label className="span-two">Street address<input required minLength={5} maxLength={1000} value={form.address} onChange={(event) => update('address', event.target.value)} /></label>
            <label>State<input required minLength={2} maxLength={100} value={form.state} onChange={(event) => update('state', event.target.value)} /></label>
            <label>District<input required minLength={2} maxLength={100} value={form.district} onChange={(event) => update('district', event.target.value)} /></label>
            <label>City<input required minLength={2} maxLength={100} value={form.city} onChange={(event) => update('city', event.target.value)} /></label>
            <label>PIN code<input required pattern="\d{6}" maxLength={6} value={form.pincode} onChange={(event) => update('pincode', event.target.value)} /></label>
            <label>Latitude<input required type="number" step="any" min="-90" max="90" value={form.latitude} onChange={(event) => update('latitude', event.target.value)} /></label>
            <label>Longitude<input required type="number" step="any" min="-180" max="180" value={form.longitude} onChange={(event) => update('longitude', event.target.value)} /></label>
          </div>
        </div>
        <div className="form-section"><h2>Supporting evidence <span className="optional">Optional</span></h2><p className="muted">Add up to four images (512 KB each). Evidence is stored privately and visible only to authorized users.</p><input type="file" accept="image/jpeg,image/png,image/webp" multiple onChange={(event) => setFiles(event.target.files)} /><small>JPEG, PNG, or WebP.</small></div>
        <label className="consent"><input type="checkbox" required />I confirm this information is accurate and consent to the department reviewing it.</label>
        {error && <p className="form-error" role="alert">{error}</p>}
        <div className="form-actions"><Link className="button button-quiet" href="/portal/complaints">Cancel</Link>{createdId && <Link className="button button-quiet" href={`/portal/complaints/${createdId}`}>View created grievance</Link>}<button className="button button-primary" disabled={saving || Boolean(createdId)}>{saving ? 'Submitting…' : createdId ? 'Grievance created' : 'Submit grievance'}</button></div>
      </form>
    </PortalShell>
  )
}
