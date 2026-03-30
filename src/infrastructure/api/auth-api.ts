import axios from 'axios'
import { apiBase } from './http-client'

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

export async function login(serverUrl: string, username: string, password: string): Promise<TokenResponse> {
  const { data } = await axios.post<TokenResponse>(`${apiBase(serverUrl)}/auth/login`, {
    username,
    password,
  }, { timeout: 10000 })
  return data
}

export async function getMe(serverUrl: string, token: string): Promise<AuthUser> {
  const { data } = await axios.get<AuthUser>(`${apiBase(serverUrl)}/auth/me`, {
    headers: { Authorization: `Bearer ${token}` },
    timeout: 10000,
  })
  return data
}

/**
 * Verifică dacă serverul răspunde. Returnează true dacă serverul e accesibil
 * (chiar și 401 înseamnă că serverul rulează și API-ul există).
 */
export async function testConnection(serverUrl: string): Promise<{ ok: boolean; error?: string }> {
  try {
    await axios.get(`${apiBase(serverUrl)}/auth/me`, {
      headers: { Authorization: 'Bearer test' },
      timeout: 5000,
      validateStatus: status => status === 401 || status === 403,
    })
    return { ok: true }
  } catch (err) {
    if (axios.isAxiosError(err)) {
      if (err.code === 'ECONNREFUSED' || err.code === 'ERR_NETWORK') {
        return { ok: false, error: 'Serverul nu răspunde. Verifică URL-ul și că serverul rulează.' }
      }
      if (err.code === 'ECONNABORTED') {
        return { ok: false, error: 'Timeout — serverul nu a răspuns în 5 secunde.' }
      }
      // Un răspuns HTTP cu alt status (ex. 200, 404, 500) înseamnă că URL-ul
      // pointează spre altceva, nu spre un server MeetRec.
      if (err.response) {
        return { ok: false, error: `URL-ul nu pare să fie un server MeetRec (HTTP ${err.response.status}).` }
      }
    }
    return { ok: false, error: 'Eroare de rețea necunoscută.' }
  }
}
