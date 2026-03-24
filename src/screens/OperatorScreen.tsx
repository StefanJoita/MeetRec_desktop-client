import { useState } from 'react'
import { CircleAlert, LogIn, Mic, MicOff, PauseCircle, Users, X } from 'lucide-react'
import type { RecorderState, RecordingMeta } from '@/features/recorder/hooks/useRecorder'
import type { SessionState } from '@/features/auth/hooks/useAuth'

type QueueStatus = {
  count: number
  draining: boolean
  error: string
}

type Props = {
  session: SessionState
  settings: { roomName: string; location: string }
  recorderState: RecorderState
  elapsedSeconds: number
  sessionMeta: RecordingMeta | null
  recorderError: string
  queue: QueueStatus
  onStart: (meta: RecordingMeta) => Promise<void>
  onStop: () => Promise<void>
  onLogout: () => void
}

function formatDuration(seconds: number) {
  const h = Math.floor(seconds / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  const s = seconds % 60
  const hh = h > 0 ? `${String(h).padStart(2, '0')}:` : ''
  return `${hh}${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
}

export function OperatorScreen({
  session,
  settings,
  recorderState,
  elapsedSeconds,
  sessionMeta,
  recorderError,
  queue,
  onStart,
  onStop,
  onLogout,
}: Props) {
  const [showStartModal, setShowStartModal] = useState(false)
  const [showStopModal, setShowStopModal] = useState(false)
  const [form, setForm] = useState({
    title: '',
    participants: '',
    meetingDate: new Date().toISOString().slice(0, 10),
    location: settings.location,
  })

  function openStart() {
    setForm({ title: '', participants: '', meetingDate: new Date().toISOString().slice(0, 10), location: settings.location })
    setShowStartModal(true)
  }

  async function handleStart() {
    setShowStartModal(false)
    await onStart({
      title: form.title.trim(),
      participants: form.participants.trim(),
      meetingDate: form.meetingDate,
      location: form.location.trim() || settings.location,
    })
  }

  async function handleStop() {
    setShowStopModal(false)
    await onStop()
  }

  return (
    <>
      {/* Start modal */}
      {showStartModal && (
        <div className="modal-overlay">
          <div className="modal card">
            <div className="modal-header">
              <h2>Începe ședința</h2>
              <button className="icon-button" onClick={() => setShowStartModal(false)} aria-label="Închide">
                <X size={20} />
              </button>
            </div>
            <div className="stack-form">
              <label>
                <span>Titlu ședință <em className="required">*</em></span>
                <input
                  value={form.title}
                  onChange={e => setForm(f => ({ ...f, title: e.target.value }))}
                  placeholder="ex: Ședință de management"
                  autoFocus
                />
              </label>
              <label>
                <span>Participanți <em className="field-hint">(separați prin virgulă)</em></span>
                <input
                  value={form.participants}
                  onChange={e => setForm(f => ({ ...f, participants: e.target.value }))}
                  placeholder="Alice, Bob, Carol"
                />
              </label>
              <label>
                <span>Data ședinței</span>
                <input
                  type="date"
                  value={form.meetingDate}
                  onChange={e => setForm(f => ({ ...f, meetingDate: e.target.value }))}
                />
              </label>
              <label>
                <span>Locație</span>
                <input
                  value={form.location}
                  onChange={e => setForm(f => ({ ...f, location: e.target.value }))}
                  placeholder={settings.location}
                />
              </label>
            </div>
            <div className="modal-actions">
              <button className="secondary-button" onClick={() => setShowStartModal(false)}>Anulează</button>
              <button
                className="primary-button"
                onClick={() => void handleStart()}
                disabled={!form.title.trim()}
              >
                <Mic size={18} />
                Pornește înregistrarea
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Stop modal */}
      {showStopModal && (
        <div className="modal-overlay">
          <div className="modal modal-sm card">
            <h2>Încheie ședința?</h2>
            <p>Înregistrarea va fi oprită. Segmentele salvate vor fi trimise automat la server.</p>
            <div className="modal-actions">
              <button className="secondary-button" onClick={() => setShowStopModal(false)}>Continuă înregistrarea</button>
              <button className="primary-button danger" onClick={() => void handleStop()}>
                <PauseCircle size={18} />
                Încheie ședința
              </button>
            </div>
          </div>
        </div>
      )}

      <main className="operator-shell">
        <section className="operator-panel card">
          <div className="operator-header">
            <div>
              <p className="eyebrow">MeetRec · {settings.roomName}</p>
              <p className="operator-user">{session.user.full_name || session.user.username}</p>
            </div>
            <button className="icon-text-button" onClick={onLogout}>
              <LogIn size={15} />
              Logout
            </button>
          </div>

          {recorderState === 'idle' && (
            <div className="operator-body">
              <div className="operator-idle-icon"><MicOff size={44} /></div>
              <h1 className="operator-state-label">În așteptare</h1>
              <p className="operator-state-sub">Nu există o înregistrare activă.</p>
              {recorderError && (
                <div className="message message-error operator-message" style={{ textAlign: 'left' }}>
                  <CircleAlert size={18} style={{ flexShrink: 0, marginTop: 2 }} />
                  <div>
                    <strong style={{ display: 'block', marginBottom: 4 }}>{recorderError}</strong>
                    <span style={{ fontSize: '0.82rem', opacity: 0.8 }}>
                      Verifică: Setări Windows → Confidențialitate și securitate → Microfon → activează pentru aplicații desktop
                    </span>
                  </div>
                </div>
              )}
              <button className="primary-button operator-main-btn" onClick={openStart}>
                <Mic size={22} />
                Începe ședința
              </button>
            </div>
          )}

          {recorderState === 'stopping' && (
            <div className="operator-body">
              <h1 className="operator-state-label">Oprire în curs...</h1>
              <p className="operator-state-sub">Ultimul segment este salvat și pus în coadă.</p>
            </div>
          )}

          {recorderState === 'recording' && (
            <div className="operator-body">
              <div className="recording-indicator">
                <span className="pulse-dot" />
                <span className="pulse-ring" />
              </div>
              <p className="operator-rec-badge">ÎNREGISTREAZĂ</p>
              <div className="operator-timer">{formatDuration(elapsedSeconds)}</div>
              {sessionMeta && (
                <div className="operator-session-info">
                  <strong>{sessionMeta.title}</strong>
                  {sessionMeta.participants && (
                    <p><Users size={13} style={{ flexShrink: 0 }} /> {sessionMeta.participants}</p>
                  )}
                </div>
              )}
              {recorderError && (
                <div className="message message-error operator-message">
                  <CircleAlert size={18} style={{ flexShrink: 0 }} />
                  <span>{recorderError}</span>
                </div>
              )}
              <button className="primary-button danger operator-main-btn" onClick={() => setShowStopModal(true)}>
                <PauseCircle size={22} />
                Încheie ședința
              </button>
            </div>
          )}

          <div className={`upload-status-bar ${queue.draining ? 'syncing' : queue.error ? 'error' : 'ok'}`}>
            <span className="upload-dot" />
            <span>
              {queue.draining
                ? `Sincronizare în curs (${queue.count} segmente)...`
                : queue.error
                  ? queue.error
                  : queue.count
                    ? `${queue.count} ${queue.count === 1 ? 'segment' : 'segmente'} în coadă`
                    : 'Toate segmentele au fost trimise'}
            </span>
          </div>
        </section>
      </main>
    </>
  )
}
