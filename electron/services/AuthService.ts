import axios from 'axios'
import { getDb } from '../store/Database'
import type { SettingsService } from './SettingsService'

export interface AuthUser {
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

interface LoginResponse {
  access_token: string
  expires_in?: number
}

interface AuthRow {
  id: number
  token: string
  username: string
  expires_at: number
}

function normalizeServerUrl(rawUrl: string): string {
  const trimmed = rawUrl.trim().replace(/\/$/, '')
  if (trimmed.endsWith('/api/v1')) {
    return trimmed.slice(0, -7)
  }
  return trimmed
}

export class AuthService {
  constructor(private settingsService: SettingsService) {}

  async login(
    serverUrl: string,
    username: string,
    password: string,
  ): Promise<{ ok: true; user: AuthUser; token: string } | { ok: false; error: string }> {
    const base = normalizeServerUrl(serverUrl)

    try {
      const loginRes = await axios.post<LoginResponse>(
        `${base}/api/v1/auth/login`,
        { username, password },
        { timeout: 10000 },
      )

      const token = loginRes.data.access_token
      const expiresIn = loginRes.data.expires_in ?? 28800 // default 8h
      const expiresAt = Math.floor(Date.now() / 1000) + expiresIn

      const meRes = await axios.get<AuthUser>(`${base}/api/v1/auth/me`, {
        headers: { Authorization: `Bearer ${token}` },
        timeout: 10000,
      })

      const user = meRes.data

      // Persist to SQLite (UPSERT into single-row auth table)
      const db = getDb()
      db.prepare(`
        INSERT INTO auth (id, token, username, expires_at)
        VALUES (1, ?, ?, ?)
        ON CONFLICT(id) DO UPDATE SET
          token = excluded.token,
          username = excluded.username,
          expires_at = excluded.expires_at
      `).run(token, user.username, expiresAt)

      return { ok: true, user, token }
    } catch (err: unknown) {
      if (axios.isAxiosError(err)) {
        const status = err.response?.status
        if (status === 401 || status === 403) {
          return { ok: false, error: 'Credențiale incorecte' }
        }
        if (err.code === 'ECONNREFUSED' || err.code === 'ENOTFOUND') {
          return { ok: false, error: 'Serverul nu este accesibil' }
        }
        const msg = (err.response?.data as { detail?: string } | undefined)?.detail
        return { ok: false, error: msg ?? err.message }
      }
      return { ok: false, error: String(err) }
    }
  }

  async restoreSession(): Promise<{ user: AuthUser; token: string } | null> {
    const row = this._getStoredRow()
    if (!row) return null

    const nowSec = Math.floor(Date.now() / 1000)
    if (row.expires_at <= nowSec) {
      this.logout()
      return null
    }

    const base = normalizeServerUrl(this.settingsService.get().serverUrl)

    try {
      const meRes = await axios.get<AuthUser>(`${base}/api/v1/auth/me`, {
        headers: { Authorization: `Bearer ${row.token}` },
        timeout: 10000,
      })
      return { user: meRes.data, token: row.token }
    } catch {
      this.logout()
      return null
    }
  }

  logout(): void {
    try {
      const db = getDb()
      db.prepare('DELETE FROM auth WHERE id = 1').run()
    } catch {
      // DB may not be available; ignore
    }
  }

  getToken(): string | null {
    const row = this._getStoredRow()
    if (!row) return null

    const nowSec = Math.floor(Date.now() / 1000)
    if (row.expires_at <= nowSec) {
      this.logout()
      return null
    }

    return row.token
  }

  async createSession(opts: {
    title: string
    participants: string
    meetingDate: string
    location: string
    roomName: string
  }): Promise<{ ok: true; sessionId: string; recordingId: string } | { ok: false; error: string }> {
    const token = this.getToken()
    if (!token) return { ok: false, error: 'Not authenticated' }

    const base = normalizeServerUrl(this.settingsService.get().serverUrl)

    try {
      const res = await axios.post<{ session_id: string; recording_id: string }>(
        `${base}/api/v1/inbox/session/create`,
        {
          title: opts.title,
          meeting_date: opts.meetingDate,
          participants: opts.participants || undefined,
          location: opts.location || undefined,
          room_name: opts.roomName || undefined,
        },
        {
          headers: { Authorization: `Bearer ${token}` },
          timeout: 10000,
        },
      )
      return { ok: true, sessionId: res.data.session_id, recordingId: res.data.recording_id }
    } catch (err: unknown) {
      if (axios.isAxiosError(err)) {
        const msg = (err.response?.data as { detail?: string } | undefined)?.detail
        return { ok: false, error: msg ?? err.message }
      }
      return { ok: false, error: String(err) }
    }
  }

  getServerUrl(): string {
    return normalizeServerUrl(this.settingsService.get().serverUrl)
  }

  private _getStoredRow(): AuthRow | null {
    try {
      const db = getDb()
      const row = db.prepare('SELECT * FROM auth WHERE id = 1').get()
      return (row as AuthRow | undefined) ?? null
    } catch {
      return null
    }
  }
}
