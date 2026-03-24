import { useState } from 'react'
import { login, getMe } from '@/infrastructure/api/auth-api'
import { sessionStorage } from '@/infrastructure/session-storage'
import type { AuthUser } from '@/infrastructure/api/auth-api'
import type { ClientSettings } from '@/types/electron'

export type SessionState = {
  token: string
  username: string
  user: AuthUser
}

export type UserRole = 'admin' | 'operator' | 'participant'

export function getUserRole(user: AuthUser): UserRole {
  if (user.role === 'admin' || user.role === 'operator' || user.role === 'participant') {
    return user.role
  }
  if (user.is_admin) return 'admin'
  if (user.is_participant) return 'participant'
  return 'operator'
}

export function useAuth() {
  const [session, setSession] = useState<SessionState | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [mustChangePassword, setMustChangePassword] = useState(false)

  async function restoreSession(settings: ClientSettings): Promise<boolean> {
    const stored = sessionStorage.load()
    if (!stored) return false
    try {
      const user = await getMe(settings.serverUrl, stored.token)
      if (user.must_change_password) {
        sessionStorage.clear()
        setMustChangePassword(true)
        return false
      }
      setSession({ token: stored.token, username: stored.username, user })
      return true
    } catch {
      sessionStorage.clear()
      return false
    }
  }

  async function handleLogin(serverUrl: string, username: string, password: string): Promise<boolean> {
    setLoading(true)
    setError('')
    setMustChangePassword(false)
    try {
      const { access_token } = await login(serverUrl, username, password)
      const user = await getMe(serverUrl, access_token)
      if (user.must_change_password) {
        setMustChangePassword(true)
        return false
      }
      sessionStorage.save({ token: access_token, username })
      setSession({ token: access_token, username, user })
      return true
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Autentificarea a eșuat. Verifică credențialele și URL-ul.')
      return false
    } finally {
      setLoading(false)
    }
  }

  function logout() {
    sessionStorage.clear()
    setSession(null)
    setMustChangePassword(false)
    setError('')
  }

  return {
    session,
    loading,
    error,
    mustChangePassword,
    restoreSession,
    handleLogin,
    logout,
  }
}
