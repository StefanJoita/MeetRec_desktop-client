import { useState } from 'react'
import { desktopBridge } from '@/infrastructure/desktop-bridge'
import { normalizeServerUrl } from '@/infrastructure/api/http-client'
import type { ClientSettings } from '@/types/electron'

export const defaultSettings: ClientSettings = {
  serverUrl: 'http://localhost:8080',
  roomName: 'Sala de sedinte',
  location: 'Sediu principal',
  segmentDurationSeconds: 300,
  setupComplete: false,
}

export function useSettings() {
  const [settings, setSettings] = useState<ClientSettings>(defaultSettings)
  const [initialized, setInitialized] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [saved, setSaved] = useState(false)

  async function loadSettings(): Promise<ClientSettings> {
    const loaded = await desktopBridge.settings.load()
    setSettings(loaded)
    setInitialized(true)
    return loaded
  }

  async function saveSettings(updates: Partial<ClientSettings>): Promise<ClientSettings> {
    setSaving(true)
    setError('')
    setSaved(false)
    try {
      const sanitized: ClientSettings = {
        ...settings,
        ...updates,
        serverUrl: normalizeServerUrl(updates.serverUrl ?? settings.serverUrl),
        segmentDurationSeconds: Math.max(
          30,
          Math.min(3600, updates.segmentDurationSeconds ?? settings.segmentDurationSeconds),
        ),
      }
      const persisted = await desktopBridge.settings.save(sanitized)
      setSettings(persisted)
      setSaved(true)
      setTimeout(() => setSaved(false), 3000)
      return persisted
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Salvarea configurației a eșuat.')
      throw err
    } finally {
      setSaving(false)
    }
  }

  async function completeSetup(): Promise<void> {
    await saveSettings({ setupComplete: true })
  }

  return {
    settings,
    setSettings,
    initialized,
    saving,
    error,
    saved,
    loadSettings,
    saveSettings,
    completeSetup,
  }
}
