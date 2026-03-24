import { useState } from 'react'
import {
  CircleAlert, CircleCheckBig, Cpu, LayoutDashboard,
  ListChecks, LogIn, Mic, MicOff, PauseCircle,
  RefreshCcw, Server, Settings2, Upload, UserRound, Users, X,
} from 'lucide-react'
import type { RecorderState, RecordingMeta } from '@/features/recorder/hooks/useRecorder'
import type { SessionState } from '@/features/auth/hooks/useAuth'
import type { ClientSettings, QueueItem } from '@/types/electron'
import type { MicPermissionState } from '@/shared/hooks/useDevices'
import { testConnection } from '@/infrastructure/api/auth-api'
import { normalizeServerUrl } from '@/infrastructure/api/http-client'

type ViewKey = 'overview' | 'settings' | 'account' | 'queue' | 'diagnostics'

type Props = {
  session: SessionState
  settings: ClientSettings
  onSettingsChange: (updates: Partial<ClientSettings>) => void
  onSaveSettings: (updates?: Partial<ClientSettings>) => Promise<ClientSettings>
  savingSettings: boolean
  settingsError: string
  settingsSaved: boolean
  recorderState: RecorderState
  elapsedSeconds: number
  sessionMeta: RecordingMeta | null
  recorderError: string
  queueItems: QueueItem[]
  queueDraining: boolean
  queueError: string
  queueTotalBytes: number
  onDeleteQueueItem: (id: string) => Promise<void>
  devices: MediaDeviceInfo[]
  selectedDeviceId: string
  selectedDeviceLabel: string
  permissionState: MicPermissionState
  onSelectDevice: (id: string) => void
  onRequestPermission: () => Promise<boolean>
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

function formatBytes(value: number) {
  if (value < 1024) return `${value} B`
  if (value < 1024 * 1024) return `${(value / 1024).toFixed(1)} KB`
  return `${(value / (1024 * 1024)).toFixed(1)} MB`
}

function formatLocalDate(isoDate: string) {
  return new Date(isoDate).toLocaleString('ro-RO')
}

export function AdminScreen({
  session,
  settings,
  onSettingsChange,
  onSaveSettings,
  savingSettings,
  settingsError,
  settingsSaved,
  recorderState,
  elapsedSeconds,
  sessionMeta,
  recorderError,
  queueItems,
  queueDraining,
  queueError,
  queueTotalBytes,
  onDeleteQueueItem,
  devices,
  selectedDeviceId,
  selectedDeviceLabel,
  permissionState,
  onSelectDevice,
  onRequestPermission,
  onStart,
  onStop,
  onLogout,
}: Props) {
  const [activeView, setActiveView] = useState<ViewKey>('overview')
  const [showStartModal, setShowStartModal] = useState(false)
  const [showStopModal, setShowStopModal] = useState(false)
  const [form, setForm] = useState({
    title: '',
    participants: '',
    meetingDate: new Date().toISOString().slice(0, 10),
    location: settings.location,
  })
  const [testingConn, setTestingConn] = useState(false)
  const [connResult, setConnResult] = useState<{ ok: boolean; error?: string } | null>(null)
  const [deviceTestResult, setDeviceTestResult] = useState<{ ok: boolean; error?: string } | null>(null)

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

  async function handleTestConnection() {
    setTestingConn(true)
    setConnResult(null)
    const result = await testConnection(settings.serverUrl)
    setConnResult(result)
    setTestingConn(false)
  }

  async function handleTestDevice(deviceId: string) {
    setDeviceTestResult(null)
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: { deviceId: { exact: deviceId } } })
      stream.getTracks().forEach(t => t.stop())
      setDeviceTestResult({ ok: true })
    } catch (err) {
      setDeviceTestResult({ ok: false, error: err instanceof DOMException ? err.message : 'Dispozitivul nu este accesibil.' })
    }
  }

  const navItems = [
    { key: 'overview' as ViewKey, label: 'Panou', icon: LayoutDashboard },
    { key: 'settings' as ViewKey, label: 'Configurare', icon: Settings2 },
    { key: 'account' as ViewKey, label: 'Cont', icon: UserRound },
    { key: 'queue' as ViewKey, label: 'Coadă upload', icon: Upload, badge: queueItems.length ? String(queueItems.length) : undefined },
    { key: 'diagnostics' as ViewKey, label: 'Diagnostic', icon: Cpu },
  ]

  const setupChecks = [
    { label: 'Server configurat', done: !!settings.serverUrl && settings.serverUrl !== 'http://localhost:8080' },
    { label: 'Sesiune activă', done: true },
    { label: 'Microfon detectat', done: permissionState === 'granted' && devices.length > 0 },
    { label: 'Sală configurată', done: !!settings.roomName.trim() },
  ]

  return (
    <>
      {/* Start modal */}
      {showStartModal && (
        <div className="modal-overlay">
          <div className="modal card">
            <div className="modal-header">
              <h2>Începe ședința</h2>
              <button className="icon-button" onClick={() => setShowStartModal(false)} aria-label="Închide"><X size={20} /></button>
            </div>
            <div className="stack-form">
              <label>
                <span>Titlu ședință <em className="required">*</em></span>
                <input value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))} placeholder="ex: Ședință de management" autoFocus />
              </label>
              <label>
                <span>Participanți <em className="field-hint">(separați prin virgulă)</em></span>
                <input value={form.participants} onChange={e => setForm(f => ({ ...f, participants: e.target.value }))} placeholder="Alice, Bob, Carol" />
              </label>
              <label>
                <span>Data ședinței</span>
                <input type="date" value={form.meetingDate} onChange={e => setForm(f => ({ ...f, meetingDate: e.target.value }))} />
              </label>
              <label>
                <span>Locație</span>
                <input value={form.location} onChange={e => setForm(f => ({ ...f, location: e.target.value }))} placeholder={settings.location} />
              </label>
            </div>
            <div className="modal-actions">
              <button className="secondary-button" onClick={() => setShowStartModal(false)}>Anulează</button>
              <button className="primary-button" onClick={() => void handleStart()} disabled={!form.title.trim()}>
                <Mic size={18} /> Pornește înregistrarea
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
                <PauseCircle size={18} /> Încheie ședința
              </button>
            </div>
          </div>
        </div>
      )}

      <main className="app-shell">
        {/* Sidebar */}
        <aside className="sidebar card">
          <div>
            <p className="eyebrow">MeetRec Room Client</p>
            <h1 className="side-title">{settings.roomName || 'Admin console'}</h1>
            <p className="side-subtitle">{session.user.full_name || session.user.username} · Admin</p>
          </div>

          {/* Recorder control */}
          <div className="sidebar-recorder">
            <div className={`sidebar-rec-status status-${recorderState}`}>
              {recorderState === 'recording'
                ? <><span className="pulse-dot-sm" />{formatDuration(elapsedSeconds)}</>
                : recorderState === 'stopping' ? 'Oprire...' : 'În așteptare'}
            </div>
            {recorderState === 'idle' && (
              <button className="primary-button sidebar-rec-btn" onClick={openStart}>
                <Mic size={15} /> Start
              </button>
            )}
            {recorderState === 'recording' && (
              <button className="secondary-button sidebar-rec-btn" onClick={() => setShowStopModal(true)}>
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
                  <span><Icon size={16} /> {item.label}</span>
                  {item.badge && <em>{item.badge}</em>}
                </button>
              )
            })}
          </nav>

          <div style={{ marginTop: 'auto' }}>
            <button className="icon-text-button" onClick={onLogout} style={{ width: '100%', justifyContent: 'center' }}>
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

              {(recorderError || queueError) && (
                <div className="message message-error" style={{ marginBottom: 14 }}>
                  <CircleAlert size={18} style={{ flexShrink: 0 }} />
                  <span>{recorderError || queueError}</span>
                </div>
              )}

              {permissionState === 'denied' && (
                <div className="message message-warning" style={{ marginBottom: 14 }}>
                  <CircleAlert size={18} style={{ flexShrink: 0 }} />
                  <div>
                    <strong>Acces microfon refuzat</strong>
                    <p>Deschide Setări Windows → Confidențialitate → Microfon și activează accesul pentru aplicații desktop.</p>
                  </div>
                </div>
              )}

              {permissionState === 'prompt' && (
                <div className="message message-warning" style={{ marginBottom: 14 }}>
                  <CircleAlert size={18} style={{ flexShrink: 0 }} />
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                    <span>Accesul la microfon nu a fost acordat.</span>
                    <button className="secondary-button" style={{ minHeight: 32, padding: '0 10px', fontSize: '0.85rem' }} onClick={() => void onRequestPermission()}>
                      <Mic size={14} /> Acordă acces
                    </button>
                  </div>
                </div>
              )}

              <div className="check-grid">
                {setupChecks.map(check => (
                  <article key={check.label} className={`check-item ${check.done ? 'done' : ''}`}>
                    {check.done ? <CircleCheckBig size={18} /> : <CircleAlert size={18} />}
                    <span>{check.label}</span>
                  </article>
                ))}
              </div>

              <div className="stats-grid">
                <article><span>Server</span><strong>{normalizeServerUrl(settings.serverUrl)}</strong></article>
                <article><span>Coadă locală</span><strong>{queueItems.length} segmente</strong></article>
                <article><span>Spațiu temporar</span><strong>{formatBytes(queueTotalBytes)}</strong></article>
                <article><span>Microfon selectat</span><strong>{selectedDeviceLabel}</strong></article>
              </div>

              {recorderState === 'recording' && sessionMeta && (
                <div className="active-session-banner">
                  <span className="pulse-dot-sm" />
                  <div>
                    <strong>{sessionMeta.title}</strong>
                    <p>{formatDuration(elapsedSeconds)} · {sessionMeta.participants || 'fără participanți specificați'}</p>
                  </div>
                </div>
              )}
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

              <form className="stack-form" onSubmit={e => { e.preventDefault(); void onSaveSettings() }}>
                <label>
                  <span>URL server MeetRec</span>
                  <input value={settings.serverUrl} onChange={e => onSettingsChange({ serverUrl: e.target.value })} placeholder="http://server:8080" />
                </label>

                <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}>
                  <button type="button" className="secondary-button" style={{ minHeight: 36, padding: '0 12px', fontSize: '0.85rem', flexShrink: 0 }} onClick={() => void handleTestConnection()} disabled={testingConn}>
                    <RefreshCcw size={14} className={testingConn ? 'spin' : ''} />
                    {testingConn ? 'Se testează...' : 'Testează'}
                  </button>
                  {connResult && (
                    <div className={`message ${connResult.ok ? 'message-success' : 'message-error'}`} style={{ flex: 1, padding: '8px 12px' }}>
                      {connResult.ok ? <><CircleCheckBig size={14} /> Accesibil</> : <><CircleAlert size={14} /> {connResult.error}</>}
                    </div>
                  )}
                </div>

                <label>
                  <span>Nume sală</span>
                  <input value={settings.roomName} onChange={e => onSettingsChange({ roomName: e.target.value })} placeholder="Sala de ședințe" />
                </label>
                <label>
                  <span>Locație</span>
                  <input value={settings.location} onChange={e => onSettingsChange({ location: e.target.value })} placeholder="Sediu principal" />
                </label>
                <label>
                  <span>Durată segment (secunde)</span>
                  <input type="number" min={30} max={3600} value={settings.segmentDurationSeconds} onChange={e => onSettingsChange({ segmentDurationSeconds: Number(e.target.value) || 300 })} />
                </label>

                {/* Mic selection */}
                <label>
                  <span>Microfon</span>
                  <select value={selectedDeviceId} onChange={e => { onSelectDevice(e.target.value); setDeviceTestResult(null) }}>
                    {devices.map(d => (
                      <option key={d.deviceId} value={d.deviceId}>{d.label || `Microfon ${d.deviceId.slice(0, 6)}`}</option>
                    ))}
                  </select>
                </label>

                {permissionState !== 'granted' && (
                  <button type="button" className="secondary-button" onClick={() => void onRequestPermission()}>
                    <Mic size={15} /> Acordă acces la microfon
                  </button>
                )}

                {permissionState === 'granted' && selectedDeviceId && (
                  <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}>
                    <button type="button" className="secondary-button" style={{ minHeight: 36, padding: '0 12px', fontSize: '0.85rem', flexShrink: 0 }} onClick={() => void handleTestDevice(selectedDeviceId)}>
                      <Mic size={14} /> Testează microfonul
                    </button>
                    {deviceTestResult && (
                      <div className={`message ${deviceTestResult.ok ? 'message-success' : 'message-error'}`} style={{ flex: 1, padding: '8px 12px' }}>
                        {deviceTestResult.ok ? <><CircleCheckBig size={14} /> Funcționează</> : <><CircleAlert size={14} /> {deviceTestResult.error}</>}
                      </div>
                    )}
                  </div>
                )}

                {settingsError && (
                  <div className="message message-error"><CircleAlert size={16} /><span>{settingsError}</span></div>
                )}
                {settingsSaved && (
                  <div className="message message-success"><CircleCheckBig size={16} /><span>Setările au fost salvate.</span></div>
                )}

                <div className="control-row">
                  <button className="primary-button" type="submit" disabled={savingSettings}>
                    {savingSettings ? 'Se salvează...' : 'Salvează setările'}
                  </button>
                </div>
              </form>
            </section>
          )}

          {/* Account */}
          {activeView === 'account' && (
            <section className="view-card card">
              <header className="panel-header compact">
                <div>
                  <p className="panel-kicker">Cont</p>
                  <h3>Informații utilizator</h3>
                </div>
                <UserRound className="panel-icon" />
              </header>

              <div className="session-card">
                <p className="session-user">{session.user.full_name || session.user.username}</p>
                {session.user.email && <p>{session.user.email}</p>}
                <p>@{session.user.username} · Admin</p>
              </div>

              <div className="control-row" style={{ marginTop: 16 }}>
                <button className="secondary-button" onClick={onLogout}>
                  <LogIn size={16} /> Deconectare
                </button>
              </div>
            </section>
          )}

          {/* Queue */}
          {activeView === 'queue' && (
            <section className="view-card card queue-panel">
              <header className="panel-header compact">
                <div>
                  <p className="panel-kicker">Coadă upload</p>
                  <h3>
                    {queueItems.length > 0
                      ? <><strong>{queueItems.length} segmente</strong> în așteptare</>
                      : 'Coadă goală'}
                  </h3>
                </div>
                <Upload className="panel-icon" />
              </header>

              {queueError && (
                <div className="message message-error" style={{ marginBottom: 12 }}>
                  <CircleAlert size={16} /><span>{queueError}</span>
                </div>
              )}

              {queueItems.length === 0
                ? <p className="empty-state">Nu există segmente în coadă.</p>
                : (
                  <div className="queue-list">
                    {queueItems.map(item => (
                      <div key={item.id} className="queue-item">
                        <div className="queue-item-info">
                          <strong>{item.title}</strong>
                          <p>{item.roomName} · {formatLocalDate(item.createdAt)}</p>
                          {item.participants && (
                            <p className="queue-participants">
                              <Users size={12} /> {item.participants}
                            </p>
                          )}
                        </div>
                        <div className="queue-item-meta">
                          <span>{formatBytes(item.sizeBytes)}</span>
                          <span>Seg. {item.segmentIndex}</span>
                          <button
                            className="icon-button"
                            onClick={() => void onDeleteQueueItem(item.id)}
                            title="Șterge segment"
                            aria-label="Șterge"
                          >
                            <X size={15} />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
            </section>
          )}

          {/* Diagnostics */}
          {activeView === 'diagnostics' && (
            <section className="view-card card">
              <header className="panel-header compact">
                <div>
                  <p className="panel-kicker">Diagnostic</p>
                  <h3>Stare tehnică</h3>
                </div>
                <Cpu className="panel-icon" />
              </header>

              <div className="diagnostics-grid">
                {[
                  { key: 'Stare recorder', value: recorderState },
                  { key: 'Upload automat', value: queueDraining ? 'activ' : 'în așteptare' },
                  { key: 'Segmente în coadă', value: String(queueItems.length) },
                  { key: 'Spațiu coadă', value: formatBytes(queueTotalBytes) },
                  { key: 'Server API', value: normalizeServerUrl(settings.serverUrl) },
                  { key: 'Durată segment', value: `${settings.segmentDurationSeconds}s` },
                  { key: 'Microfon', value: selectedDeviceLabel },
                  { key: 'Permisiune microfon', value: permissionState },
                  { key: 'Format audio', value: 'WAV (PCM 16-bit)' },
                  { key: 'Sală', value: settings.roomName },
                ].map(({ key, value }) => (
                  <article key={key}>
                    <span>{key}</span>
                    <strong>{value}</strong>
                  </article>
                ))}
              </div>
            </section>
          )}
        </div>
      </main>
    </>
  )
}
