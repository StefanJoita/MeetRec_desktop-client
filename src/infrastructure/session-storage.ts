const SESSION_KEY = 'meetrec-desktop-session'

export type StoredSession = {
  token: string
  username: string
}

export const sessionStorage = {
  load(): StoredSession | null {
    const raw = window.localStorage.getItem(SESSION_KEY)
    if (!raw) return null
    try {
      return JSON.parse(raw) as StoredSession
    } catch {
      return null
    }
  },

  save(session: StoredSession): void {
    window.localStorage.setItem(SESSION_KEY, JSON.stringify(session))
  },

  clear(): void {
    window.localStorage.removeItem(SESSION_KEY)
  },
}
