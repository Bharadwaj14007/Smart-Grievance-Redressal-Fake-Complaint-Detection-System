'use client'

import type { ApiUser } from '@shared/api-contracts'
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import { ApiError, apiRequest } from '../lib/api'

type AuthContextValue = {
  user: ApiUser | null
  loading: boolean
  error: string
  login: (email: string, password: string) => Promise<ApiUser>
  register: (fullName: string, email: string, password: string) => Promise<void>
  logout: () => Promise<void>
  reload: () => Promise<void>
}

const AuthContext = createContext<AuthContextValue | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<ApiUser | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const reload = useCallback(async () => {
    try {
      setUser(await apiRequest<ApiUser>('/auth/me'))
      setError('')
    } catch (reason) {
      if (reason instanceof ApiError && reason.status === 401) {
        setUser(null)
        setError('')
      } else {
        setError(reason instanceof Error ? reason.message : 'Unable to reach the authentication service.')
      }
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void reload()
  }, [reload])

  const login = useCallback(async (email: string, password: string) => {
    const signedIn = await apiRequest<ApiUser>('/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password }),
    })
    setUser(signedIn)
    setError('')
    return signedIn
  }, [])

  const register = useCallback(async (fullName: string, email: string, password: string) => {
    await apiRequest('/auth/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ fullName, email, password }),
    })
    await login(email, password)
  }, [login])

  const logout = useCallback(async () => {
    try {
      await apiRequest('/auth/logout', { method: 'POST' })
    } finally {
      setUser(null)
      setError('')
    }
  }, [])

  const value = useMemo(() => ({ user, loading, error, login, register, logout, reload }), [user, loading, error, login, register, logout, reload])
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth() {
  const context = useContext(AuthContext)
  if (!context) throw new Error('useAuth must be used inside AuthProvider.')
  return context
}
