'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useEffect, useState, type FormEvent } from 'react'
import { useAuth } from '../../src/components/AuthProvider'

export default function LoginPage() {
  const { login, user, loading } = useAuth()
  const router = useRouter()
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
      await login(email, password)
      router.replace('/portal')
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Unable to sign in.')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <main className="auth-page">
      <Link className="brand auth-brand" href="/"><span className="brand-mark">NS</span><span>Nagrik Setu<small>Grievance redressal</small></span></Link>
      <section className="auth-card">
        <span className="eyebrow">Welcome back</span>
        <h1>Sign in to your account</h1>
        <p className="muted">Continue following your grievance or manage your response queue.</p>
        <form className="form-stack" onSubmit={submit}>
          <label>Email address<input required type="email" autoComplete="email" value={email} onChange={(event) => setEmail(event.target.value)} /></label>
          <label>Password<input required type="password" autoComplete="current-password" value={password} onChange={(event) => setPassword(event.target.value)} /></label>
          {error && <p className="form-error" role="alert">{error}</p>}
          <button className="button button-primary button-full" disabled={submitting}>{submitting ? 'Signing in…' : 'Sign in'}</button>
        </form>
        <p className="auth-foot">New to Nagrik Setu? <Link href="/register">Create a citizen account</Link></p>
        <p className="security-note">Your session is protected with secure, HttpOnly cookies.</p>
      </section>
    </main>
  )
}
