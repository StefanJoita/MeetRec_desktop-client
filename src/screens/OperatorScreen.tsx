import { useState } from 'react'
import { LogIn, Mic, MicOff, PauseCircle } from 'lucide-react'
import { RecorderStatus } from '@/components/RecorderStatus'
import { StartMeetingModal } from '@/components/StartMeetingModal'
import type {
  AuthUser,
  ClientSettings,
  QueueStats,
  SessionStatePayload,
  StartSessionPayload,
} from '@/types/electron'

interface Props {
  user: AuthUser
  session: SessionStatePayload
  queue: QueueStats
  settings: ClientSettings
  selectedDevice: string
  onStartSession: (payload: StartSessionPayload) => Promise<string | null>
  onStopSession: () => Promise<void>
  onLogout: () => Promise<void>
}

export function OperatorScreen({
  user,
  session,
  queue,
  settings,
  selectedDevice,
  onStartSession,
  onStopSession,
  onLogout,
}: Props) {
  const [showStartModal, setShowStartModal] = useState(false)

  const isIdle = session.state === 'idle'
  const isRecording = session.state === 'recording'
  const isStopping = session.state === 'stopping'

  return (
    <>
      {showStartModal && (
        <StartMeetingModal
          settings={settings}
          selectedDevice={selectedDevice}
          onStart={onStartSession}
          onClose={() => setShowStartModal(false)}
        />
      )}

      <main className="operator-shell">
        <section className="operator-panel card">
          <div className="operator-header">
            <div>
              <p className="eyebrow">MeetRec · {settings.roomName}</p>
              <p className="operator-user">
                {user.full_name || user.username}
              </p>
            </div>
            <button className="icon-text-button" onClick={() => void onLogout()}>
              <LogIn size={15} />
              Logout
            </button>
          </div>

          {isIdle && (
            <div className="operator-body">
              <div className="operator-idle-icon">
                <MicOff size={44} />
              </div>
              <h1 className="operator-state-label">În așteptare</h1>
              <p className="operator-state-sub">Nu există o înregistrare activă.</p>
              <button
                className="primary-button operator-main-btn"
                onClick={() => setShowStartModal(true)}
              >
                <Mic size={22} />
                Începe ședința
              </button>
            </div>
          )}

          {isStopping && (
            <div className="operator-body">
              <h1 className="operator-state-label">Oprire în curs...</h1>
              <p className="operator-state-sub">
                Ultimul segment este salvat și pus în coadă.
              </p>
              <RecorderStatus session={session} />
            </div>
          )}

          {isRecording && (
            <div className="operator-body">
              <div className="recording-indicator">
                <span className="pulse-dot" />
                <span className="pulse-ring" />
              </div>
              <p className="operator-rec-badge">ÎNREGISTREAZĂ</p>
              <RecorderStatus session={session} />
              {session.meta && (
                <div className="operator-session-info">
                  <strong>{session.meta.title}</strong>
                  {session.meta.participants && (
                    <p>{session.meta.participants}</p>
                  )}
                </div>
              )}
              <button
                className="primary-button danger operator-main-btn"
                onClick={() => void onStopSession()}
                disabled={isStopping}
              >
                <PauseCircle size={22} />
                Încheie ședința
              </button>
            </div>
          )}

          <div
            className={`upload-status-bar ${
              queue.isUploading ? 'syncing' : queue.errorCount > 0 ? 'error' : 'ok'
            }`}
          >
            <span className="upload-dot" />
            <span>
              {queue.isUploading
                ? `Sincronizare în curs (${queue.pending} segmente)...`
                : queue.errorCount > 0
                  ? `${queue.errorCount} erori upload`
                  : queue.pending > 0
                    ? `${queue.pending} ${queue.pending === 1 ? 'segment' : 'segmente'} în coadă`
                    : 'Toate segmentele au fost trimise'}
            </span>
          </div>
        </section>
      </main>
    </>
  )
}
