import { useState } from 'react'
import type { FormEvent } from 'react'
import { CircleAlert, CircleCheckBig } from 'lucide-react'
import type { ClientSettings } from '@/types/electron'

const SEGMENT_OPTIONS = [
  { value: 30, label: '30 secunde' },
  { value: 60, label: '1 minut' },
  { value: 300, label: '5 minute' },
  { value: 600, label: '10 minute' },
  { value: 1800, label: '30 minute' },
  { value: 3600, label: '60 minute' },
]

interface Props {
  settings: ClientSettings
  onSave: (updates: Partial<ClientSettings>) => Promise<void>
}

export function SettingsForm({ settings, onSave }: Props) {
  const [serverUrl, setServerUrl] = useState(settings.serverUrl)
  const [roomName, setRoomName] = useState(settings.roomName)
  const [location, setLocation] = useState(settings.location)
  const [segmentDurationSeconds, setSegmentDurationSeconds] = useState(settings.segmentDurationSeconds)

  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState('')

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    if (!serverUrl.trim()) {
      setError('URL-ul serverului este obligatoriu.')
      return
    }
    setError('')
    setSaved(false)
    setSaving(true)
    try {
      await onSave({ serverUrl: serverUrl.trim(), roomName, location, segmentDurationSeconds })
      setSaved(true)
      setTimeout(() => setSaved(false), 3000)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Eroare la salvare.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <form className="stack-form" onSubmit={e => void handleSubmit(e)}>
      <label>
        <span>URL server MeetRec</span>
        <input
          value={serverUrl}
          onChange={e => setServerUrl(e.target.value)}
          placeholder="http://server:8080"
          disabled={saving}
        />
      </label>

      <label>
        <span>Durată segment</span>
        <select
          value={segmentDurationSeconds}
          onChange={e => setSegmentDurationSeconds(Number(e.target.value))}
          disabled={saving}
        >
          {SEGMENT_OPTIONS.map(opt => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
      </label>

      <label>
        <span>Nume sală</span>
        <input
          value={roomName}
          onChange={e => setRoomName(e.target.value)}
          placeholder="Sala de ședințe"
          disabled={saving}
        />
      </label>

      <label>
        <span>Locație</span>
        <input
          value={location}
          onChange={e => setLocation(e.target.value)}
          placeholder="Sediu principal"
          disabled={saving}
        />
      </label>

      {error && (
        <div className="message message-error">
          <CircleAlert size={16} />
          <span>{error}</span>
        </div>
      )}

      {saved && (
        <div className="message message-success">
          <CircleCheckBig size={16} />
          <span>Setările au fost salvate.</span>
        </div>
      )}

      <div className="control-row">
        <button className="primary-button" type="submit" disabled={saving}>
          {saving ? 'Se salvează...' : 'Salvează setările'}
        </button>
      </div>
    </form>
  )
}
