import { useState } from 'react'
import type { FormEvent } from 'react'
import { CircleAlert, Mic, X } from 'lucide-react'
import type { ClientSettings, StartSessionPayload } from '@/types/electron'

function todayIso(): string {
  return new Date().toISOString().slice(0, 10)
}

interface Props {
  settings: ClientSettings
  selectedDevice: string
  onStart: (payload: StartSessionPayload) => Promise<string | null>
  onClose: () => void
}

export function StartMeetingModal({ settings, selectedDevice, onStart, onClose }: Props) {
  const [title, setTitle] = useState('')
  const [participants, setParticipants] = useState('')
  const [meetingDate, setMeetingDate] = useState(todayIso)
  const [location, setLocation] = useState(settings.location)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    if (!title.trim()) {
      setError('Titlul ședinței este obligatoriu.')
      return
    }
    setError('')
    setSubmitting(true)
    try {
      const result = await onStart({
        title: title.trim(),
        participants,
        meetingDate,
        location,
        deviceId: selectedDevice,
      })
      if (result !== null) {
        setError(result)
      } else {
        onClose()
      }
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="modal-overlay">
      <div className="modal card">
        <div className="modal-header">
          <h2>Începe ședința</h2>
          <button className="icon-button" onClick={onClose} aria-label="Închide" disabled={submitting}>
            <X size={20} />
          </button>
        </div>

        <form className="stack-form" onSubmit={e => void handleSubmit(e)}>
          <label>
            <span>Titlu ședință <em className="required">*</em></span>
            <input
              value={title}
              onChange={e => setTitle(e.target.value)}
              placeholder="ex: Ședință de management"
              autoFocus
              disabled={submitting}
            />
          </label>

          <label>
            <span>Participanți <em className="field-hint">(separați prin virgulă)</em></span>
            <input
              value={participants}
              onChange={e => setParticipants(e.target.value)}
              placeholder="Alice, Bob, Carol"
              disabled={submitting}
            />
          </label>

          <label>
            <span>Data ședinței</span>
            <input
              type="date"
              value={meetingDate}
              onChange={e => setMeetingDate(e.target.value)}
              disabled={submitting}
            />
          </label>

          <label>
            <span>Locație</span>
            <input
              value={location}
              onChange={e => setLocation(e.target.value)}
              placeholder={settings.location}
              disabled={submitting}
            />
          </label>

          {error && (
            <div className="message message-error">
              <CircleAlert size={16} style={{ flexShrink: 0 }} />
              <span>{error}</span>
            </div>
          )}

          <div className="modal-actions">
            <button
              type="button"
              className="secondary-button"
              onClick={onClose}
              disabled={submitting}
            >
              Anulează
            </button>
            <button
              type="submit"
              className="primary-button"
              disabled={submitting || !title.trim()}
            >
              <Mic size={18} />
              {submitting ? 'Se pornește...' : 'Pornește înregistrarea'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
