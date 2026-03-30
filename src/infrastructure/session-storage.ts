const SESSION_KEY = 'meetrec-desktop-session'

export type StoredSession = {
  token: string
  username: string
}

type PersistedSession = StoredSession & {
  expiresAt: number // epoch ms
}

export const sessionStorage = {
  load(): StoredSession | null {
    const raw = window.localStorage.getItem(SESSION_KEY)
    if (!raw) return null
    try {
      const parsed = JSON.parse(raw) as Partial<PersistedSession>
      // Sesiuni fără expiresAt (format vechi) sau expirate sunt șterse imediat
      if (!parsed.expiresAt || Date.now() >= parsed.expiresAt) {
        window.localStorage.removeItem(SESSION_KEY)
        return null
      }
      return { token: parsed.token!, username: parsed.username! }
    } catch {
      window.localStorage.removeItem(SESSION_KEY)
      return null
    }
  },

  save(session: StoredSession, expiresInSeconds: number): void {
    const persisted: PersistedSession = {
      ...session,
      expiresAt: Date.now() + expiresInSeconds * 1000,
    }
    window.localStorage.setItem(SESSION_KEY, JSON.stringify(persisted))
  },

  clear(): void {
    window.localStorage.removeItem(SESSION_KEY)
  },
}
