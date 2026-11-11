import type { ReactNode } from 'react'
import { Navigate } from 'react-router-dom'
import { useAppStore, type Role } from '../store/useAppStore'

export function ProtectedRoute({ role, children }: { role: Role; children: ReactNode }) {
  const session = useAppStore((state) => state.session)
  if (!session) return <Navigate to="/login" replace />
  if (session.role !== role) return <Navigate to="/unauthorized" replace />
  return children
}
