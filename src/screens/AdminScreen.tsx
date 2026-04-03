import { useEffect, useState } from 'react'
import {
  CircleAlert,
  CircleCheckBig,
  Cpu,
  LayoutDashboard,
  ListChecks,
  LogIn,
  Mic,
  PauseCircle,
  RefreshCcw,
  Settings2,
  Upload,
} from 'lucide-react'
import { RecorderStatus } from '@/components/RecorderStatus'
import { QueuePanel } from '@/components/QueuePanel'
import { SettingsForm } from '@/components/SettingsForm'
import { StartMeetingModal } from '@/components/StartMeetingModal'
import type {
  AuthUser,
  ClientSettings,
  QueueStats,
  SegmentRow,
  SessionStatePayload,
  StartSessionPayload,
} from '@/types/electron'

type ViewKey = 'overview' | 'settings' | 'queue' | 'diagnostics'

interface Props {
  user: AuthUser
  session: SessionStatePayload
  queue: QueueStats
  queueItems: SegmentRow[]
  queueItemsLoading: boolean
  settings: ClientSettings
  selectedDevice: string
  onStartSession: (payload: StartSessionPayload) => Promise<string | null>
  onStopSession: () => Promise<void>
  onLogout: () => Promise<void>
  onSaveSettings: (s: Partial<ClientSettings>) => Promise<void>
  settingsSaving: boolean
  onDeleteSegment: (id: string) => Promise<void>
  onRetrySegment: (id: string) => Promise<void>
  onRefreshQueue: () => Promise<void>
  pingServer: (url: string) => Promise<{ ok: boolean; latencyMs?: number; error?: string }>
}

export function AdminScreen({
  user,
  session,
  queue,
  queueItems,
  queueItemsLoading,
  settings,
  selectedDevice,
  onStartSession,
  onStopSession,
  onLogout,
  onSaveSettings,
  onDeleteSegment,
  onRetrySegment,
  onRefreshQueue,
  pingServer,
}: Props) {
  const [activeView, setActiveView] = useState<ViewKey>('overview')
  const [showStartModal, setShowStartModal] = useState(false)

  // Diagnostics tab state — sync with settings.serverUrl when tab becomes active
  const [diagUrl, setDiagUrl] = useState(settings.serverUrl)
  useEffect(() => {
    if (activeView === 'diagnostics') {
      setDiagUrl(settings.serverUrl)
    }
  }, [activeView, settings.serverUrl])
  const [testingConn, setTestingConn] = useState(false)
  const [connResult, setConnResult] = useState<{
    ok: boolean
    latencyMs?: number
    error?: string
  } | null>(null)

  // Refresh queue items when queue tab becomes active
  useEffect(() => {
    if (activeView === 'queue') {
      void onRefreshQueue()
    }
  }, [activeView, onRefreshQueue])

  async function handleTestConnection() {
    setTestingConn(true)
    setConnResult(null)
    const result = await pingServer(diagUrl)
    setConnResult(result)
    setTestingConn(false)
  }

  const isIdle = session.state === 'idle'
  const isRecording = session.state === 'recording'
  const isStopping = session.state === 'stopping'

  const navItems: { key: ViewKey; label: string; icon: React.ElementType; badge?: string }[] = [
    { key: 'overview', label: 'Panou', icon: LayoutDashboard },
    { key: 'settings', label: 'Configurare', icon: Settings2 },
    {
      key: 'queue',
      label: 'Coadă upload',
      icon: Upload,
      badge: queue.total > 0 ? String(queue.total) : undefined,
    },
    { key: 'diagnostics', label: 'Diagnostic', icon: Cpu },
  ]

  const setupChecks = [
    {
      label: 'Server configurat',
      done: !!settings.serverUrl && settings.serverUrl !== 'http://localhost:8080',
    },
    { label: 'Sesiune activă', done: true },
    { label: 'Sală configurată', done: !!settings.roomName.trim() },
  ]

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

      <main className="app-shell">
        {/* Sidebar */}
        <aside className="sidebar card">
          <div>
            <p className="eyebrow">MeetRec Room Client</p>
            <h1 className="side-title">{settings.roomName || 'Admin console'}</h1>
            <p className="side-subtitle">
              {user.full_name || user.username} · Admin
            </p>
          </div>

          {/* Recorder controls in sidebar */}
          <div className="sidebar-recorder">
            <div className={`sidebar-rec-status status-${session.state}`}>
              {isRecording ? (
                <>
                  <span className="pulse-dot-sm" />
                  <RecorderStatus session={session} />
                </>
              ) : isStopping ? (
                'Oprire...'
              ) : (
                'În așteptare'
              )}
            </div>
            {isIdle && (
              <button
                className="primary-button sidebar-rec-btn"
                onClick={() => setShowStartModal(true)}
              >
                <Mic size={15} /> Start
              </button>
            )}
            {isRecording && (
              <button
                className="secondary-button sidebar-rec-btn"
                onClick={() => void onStopSession()}
              >
                <PauseCircle size={15} /> Stop
              </button>
            )}
          </div>

          <nav className="side-nav">
            {navItems.map(item => {
              const Icon = item.icon
              return (
                <button
                  key={item.key}
                  className={`side-nav-item ${activeView === item.key ? 'active' : ''}`}
                  onClick={() => setActiveView(item.key)}
                >
                  <span>
                    <Icon size={16} /> {item.label}
                  </span>
                  {item.badge && <em>{item.badge}</em>}
                </button>
              )
            })}
          </nav>

          <div style={{ marginTop: 'auto' }}>
            <button
              className="icon-text-button"
              onClick={() => void onLogout()}
              style={{ width: '100%', justifyContent: 'center' }}
            >
              <LogIn size={15} /> Logout
            </button>
          </div>
        </aside>

        {/* Content */}
        <div className="content-column">

          {/* Overview */}
          {activeView === 'overview' && (
            <section className="view-card card">
              <header className="panel-header compact">
                <div>
                  <p className="panel-kicker">Checklist pornire</p>
                  <h3>Stare sistem</h3>
                </div>
                <ListChecks className="panel-icon" />
              </header>

              <div style={{ marginBottom: 16 }}>
                <RecorderStatus session={session} />
              </div>

              <div className="check-grid">
                {setupChecks.map(check => (
                  <article key={check.label} className={`check-item ${check.done ? 'done' : ''}`}>
                    {check.done ? <CircleCheckBig size={18} /> : <CircleAlert size={18} />}
                    <span>{check.label}</span>
                  </article>
                ))}
              </div>

              <div className="stats-grid" style={{ marginTop: 16 }}>
                <article>
                  <span>Server</span>
                  <strong>{settings.serverUrl}</strong>
                </article>
                <article>
                  <span>Total coadă</span>
                  <strong>{queue.total} segmente</strong>
                </article>
                <article>
                  <span>Erori</span>
                  <strong>{queue.errorCount}</strong>
                </article>
                <article>
                  <span>Sală</span>
                  <strong>{settings.roomName}</strong>
                </article>
              </div>

              {isRecording && session.meta && (
                <div className="active-session-banner" style={{ marginTop: 16 }}>
                  <span className="pulse-dot-sm" />
                  <div>
                    <strong>{session.meta.title}</strong>
                    <p>
                      {session.elapsedSeconds !== undefined
                        ? `${Math.floor(session.elapsedSeconds / 60)}min · `
                        : ''}
                      {session.meta.participants || 'fără participanți specificați'}
                    </p>
                  </div>
                </div>
              )}

              <div style={{ display: 'flex', gap: 10, marginTop: 16, flexWrap: 'wrap' }}>
                {isIdle && (
                  <button
                    className="primary-button"
                    onClick={() => setShowStartModal(true)}
                  >
                    <Mic size={16} /> Începe ședința
                  </button>
                )}
                {isRecording && (
                  <button
                    className="secondary-button"
                    onClick={() => void onStopSession()}
                  >
                    <PauseCircle size={16} /> Stop înregistrare
                  </button>
                )}
                {isStopping && (
                  <button className="secondary-button" disabled>
                    <PauseCircle size={16} /> Se finalizează...
                  </button>
                )}
              </div>
            </section>
          )}

          {/* Settings */}
          {activeView === 'settings' && (
            <section className="view-card card">
              <header className="panel-header compact">
                <div>
                  <p className="panel-kicker">Configurare</p>
                  <h3>Setări client</h3>
                </div>
                <Settings2 className="panel-icon" />
              </header>
              <SettingsForm settings={settings} onSave={onSaveSettings} />
            </section>
          )}

          {/* Queue */}
          {activeView === 'queue' && (
            <section className="view-card card queue-panel">
              <header className="panel-header compact">
                <div>
                  <p className="panel-kicker">Coadă upload</p>
                  <h3>
                    {queueItems.length > 0 ? (
                      <>
                        <strong>{queueItems.length} segmente</strong> în așteptare
                      </>
                    ) : (
                      'Coadă goală'
                    )}
                  </h3>
                </div>
                <Upload className="panel-icon" />
              </header>
              <QueuePanel
                items={queueItems}
                loading={queueItemsLoading}
                onDelete={id => void onDeleteSegment(id)}
                onRetry={id => void onRetrySegment(id)}
                onRefresh={() => void onRefreshQueue()}
              />
            </section>
          )}

          {/* Diagnostics */}
          {activeView === 'diagnostics' && (
            <section className="view-card card">
              <header className="panel-header compact">
                <div>
                  <p className="panel-kicker">Diagnostic</p>
                  <h3>Test conexiune server</h3>
                </div>
                <Cpu className="panel-icon" />
              </header>

              <div className="stack-form">
                <label>
                  <span>URL server</span>
                  <input
                    value={diagUrl}
                    onChange={e => {
                      setDiagUrl(e.target.value)
                      setConnResult(null)
                    }}
                    placeholder="http://server:8080"
                  />
                </label>

                <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}>
                  <button
                    type="button"
                    className="secondary-button"
                    style={{ minHeight: 36, padding: '0 12px', fontSize: '0.85rem', flexShrink: 0 }}
                    onClick={() => void handleTestConnection()}
                    disabled={testingConn || !diagUrl.trim()}
                  >
                    <RefreshCcw size={14} className={testingConn ? 'spin' : ''} />
                    {testingConn ? 'Se testează...' : 'Testează conexiunea'}
                  </button>

                  {connResult && (
                    <div
                      className={`message ${connResult.ok ? 'message-success' : 'message-error'}`}
                      style={{ flex: 1, padding: '8px 12px' }}
                    >
                      {connResult.ok ? (
                        <>
                          <CircleCheckBig size={14} /> Accesibil
                          {connResult.latencyMs !== undefined
                            ? ` · ${connResult.latencyMs}ms latență`
                            : ''}
                        </>
                      ) : (
                        <>
                          <CircleAlert size={14} /> {connResult.error}
                        </>
                      )}
                    </div>
                  )}
                </div>

                <div className="diagnostics-grid" style={{ marginTop: 16 }}>
                  {[
                    { key: 'Stare sesiune', value: session.state },
                    { key: 'Server API', value: settings.serverUrl },
                    { key: 'Durată segment', value: `${settings.segmentDurationSeconds}s` },
                    { key: 'Sală', value: settings.roomName },
                    { key: 'Locație', value: settings.location },
                    { key: 'Total coadă', value: String(queue.total) },
                    { key: 'Erori upload', value: String(queue.errorCount) },
                  ].map(({ key, value }) => (
                    <article key={key}>
                      <span>{key}</span>
                      <strong>{value}</strong>
                    </article>
                  ))}
                </div>
              </div>
            </section>
          )}
        </div>
      </main>
    </>
  )
}
