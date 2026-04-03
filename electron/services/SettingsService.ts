import { getDb } from '../store/Database'

export interface ClientSettings {
  serverUrl: string
  roomName: string
  location: string
  segmentDurationSeconds: number
  setupComplete: boolean
}

export const DEFAULT_SETTINGS: ClientSettings = {
  serverUrl: 'http://localhost:8080',
  roomName: 'Sala de sedinte',
  location: 'Sediu principal',
  segmentDurationSeconds: 300,
  setupComplete: false,
}

type SettingsKey = keyof ClientSettings

export class SettingsService {
  get(): ClientSettings {
    const db = getDb()
    const rows = db.prepare('SELECT key, value FROM settings').all() as Array<{
      key: string
      value: string
    }>

    const stored: Partial<ClientSettings> = {}
    for (const row of rows) {
      const key = row.key as SettingsKey
      try {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        ;(stored as Record<string, any>)[key] = JSON.parse(row.value) as unknown
      } catch {
        // malformed value — skip, will fall back to default
      }
    }

    return { ...DEFAULT_SETTINGS, ...stored }
  }

  save(updates: Partial<ClientSettings>): ClientSettings {
    const db = getDb()
    const current = this.get()
    const merged: ClientSettings = { ...current, ...updates }

    const stmt = db.prepare(`
      INSERT INTO settings (key, value)
      VALUES (?, ?)
      ON CONFLICT(key) DO UPDATE SET value = excluded.value
    `)

    for (const key of Object.keys(merged) as SettingsKey[]) {
      stmt.run(key, JSON.stringify(merged[key]))
    }

    return merged
  }
}
