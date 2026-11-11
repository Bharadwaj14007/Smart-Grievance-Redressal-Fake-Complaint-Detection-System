'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useEffect, useState, type FormEvent } from 'react'
import { useAuth } from '../../src/components/AuthProvider'

export default function RegisterPage() {
  const { register, user, loading } = useAuth()
  const router = useRouter()
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    if (!loading && user) router.replace('/portal')
  }, [loading, user, router])

  if (!loading && user) {
    return <main className="center-state"><span className="spinner" />Opening your portal…</main>
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setError('')
    setSubmitting(true)
    try {
      await register(name, email, password)
      router.replace('/portal')
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Unable to create your account.')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <main className="auth-page">
      <Link className="brand auth-brand" href="/"><span className="brand-mark">NS</span><span>Nagrik Setu<small>Grievance redressal</small></span></Link>
      <section className="auth-card">
        <span className="eyebrow">A better way to be heard</span>
        <h1>Create your account</h1>
        <p className="muted">Register to submit grievances and follow their progress.</p>
        <form className="form-stack" onSubmit={submit}>
          <label>Full name<input required minLength={2} maxLength={160} autoComplete="name" value={name} onChange={(event) => setName(event.target.value)} /></label>
          <label>Email address<input required type="email" autoComplete="email" value={email} onChange={(event) => setEmail(event.target.value)} /></label>
          <label>Password<input required type="password" minLength={12} maxLength={128} autoComplete="new-password" value={password} onChange={(event) => setPassword(event.target.value)} /><small>Use at least 12 characters.</small></label>
          {error && <p className="form-error" role="alert">{error}</p>}
          <button className="button button-primary button-full" disabled={submitting}>{submitting ? 'Creating account…' : 'Create citizen account'}</button>
        </form>
        <p className="auth-foot">Already registered? <Link href="/login">Sign in</Link></p>
        <p className="security-note">Your personal information is handled securely.</p>
      </section>
    </main>
  )
}
