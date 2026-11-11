'use client'

import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { useEffect, type ReactNode } from 'react'
import { useAuth } from './AuthProvider'

const roleLabels = { CITIZEN: 'Citizen', OFFICER: 'Officer', ADMIN: 'Administrator' } as const

export function PortalShell({ children, roles }: { children: ReactNode; roles?: ('CITIZEN' | 'OFFICER' | 'ADMIN')[] }) {
  const { user, loading, error, reload, logout } = useAuth()
  const router = useRouter()
  const pathname = usePathname()

  useEffect(() => {
    if (loading || error) return
    if (!user) router.replace(`/login?next=${encodeURIComponent(pathname)}`)
    else if (roles && !roles.includes(user.role)) router.replace('/portal')
  }, [loading, user, roles, router, pathname, error])

  if (error) return <main className="center-state"><div><strong>Unable to verify your session</strong><p>{error}</p><button className="button button-primary" onClick={() => void reload()}>Retry</button></div></main>
  if (loading || !user || (roles && !roles.includes(user.role))) {
    return <main className="center-state"><span className="spinner" />Loading your secure session…</main>
  }

  const name = user.citizenProfile?.fullName ?? user.officerProfile?.fullName ?? user.email
  return (
    <div className="portal-layout">
      <header className="topbar">
        <Link className="brand" href="/portal"><span className="brand-mark">NS</span><span>Nagrik Setu<small>Grievance redressal</small></span></Link>
        <nav className="nav-links" aria-label="Main navigation">
          <Link className={pathname === '/portal' ? 'active' : ''} href="/portal">Overview</Link>
          <Link className={pathname.startsWith('/portal/complaints') ? 'active' : ''} href="/portal/complaints">Complaints</Link>
          <Link className={pathname === '/portal/notifications' ? 'active' : ''} href="/portal/notifications">Notifications</Link>
          {user.role === 'ADMIN' && <Link className={pathname === '/portal/admin' ? 'active' : ''} href="/portal/admin">Administration</Link>}
        </nav>
        <div className="account">
          <div className="account-copy"><strong>{name}</strong><span>{roleLabels[user.role]}</span></div>
          <button className="button button-quiet" onClick={() => void logout().then(() => router.replace('/'))}>Sign out</button>
        </div>
      </header>
      <main className="page-content">{children}</main>
      <footer className="footer">Nagrik Setu · Your report, tracked with care.</footer>
    </div>
  )
}
