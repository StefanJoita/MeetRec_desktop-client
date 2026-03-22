import axios from 'axios'

export type TokenResponse = {
  access_token: string
  token_type: string
  expires_in: number
}

export type AuthUser = {
  id: string
  username: string
  email: string | null
  full_name: string | null
  is_active: boolean
  is_admin: boolean
  is_participant?: boolean
  role?: 'admin' | 'operator' | 'participant'
  must_change_password: boolean
}

export function normalizeServerUrl(rawUrl: string) {
  const trimmed = rawUrl.trim().replace(/\/$/, '')
  if (trimmed.endsWith('/api/v1')) {
    return trimmed.slice(0, -7)
  }
  return trimmed
}

function apiBase(serverUrl: string) {
  return `${normalizeServerUrl(serverUrl)}/api/v1`
}

export async function login(serverUrl: string, username: string, password: string) {
  const { data } = await axios.post<TokenResponse>(`${apiBase(serverUrl)}/auth/login`, {
    username,
    password,
  }, { timeout: 10000 })
  return data
}

export async function getMe(serverUrl: string, token: string) {
  const { data } = await axios.get<AuthUser>(`${apiBase(serverUrl)}/auth/me`, {
    headers: {
      Authorization: `Bearer ${token}`,
    },
    timeout: 10000,
  })
  return data
}