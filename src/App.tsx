import { useEffect, useMemo, useRef, useState } from 'react'
import type { FormEvent } from 'react'
import {
  CircleAlert,
  CircleCheckBig,
  Cpu,
  LayoutDashboard,
  ListChecks,
  LogIn,
  Mic,
  MicOff,
  PauseCircle,
  RefreshCcw,
  Server,
  Settings2,
  Upload,
  UserRound,
  Users,
  X,
} from 'lucide-react'
import type { ClientSettings, QueueItem, SessionMeetingMeta } from '@/types/electron'
import { getMe, login, normalizeServerUrl, type AuthUser } from '@/lib/api'

type RecorderState = 'idle' | 'recording' | 'stopping'
type ViewKey = 'overview' | 'settings' | 'account' | 'queue' | 'diagnostics'
type UserRole = 'admin' | 'operator' | 'participant'

type SessionState = {
  token: string
  username: string
  user: AuthUser
}

const defaultSettings: ClientSettings = {
  serverUrl: 'http://localhost:8080',
  roomName: 'Sala de sedinte',
  location: 'Sediu principal',
  segmentDurationSeconds: 300,
}

const sessionStorageKey = 'meetrec-desktop-session'

function formatBytes(value: number) {
  if (value < 1024) return `${value} B`
  if (value < 1024 * 1024) return `${(value / 1024).toFixed(1)} KB`
  return `${(value / (1024 * 1024)).toFixed(1)} MB`
}

function formatLocalDate(isoDate: string) {
  return new Date(isoDate).toLocaleString('ro-RO')
}

function formatDuration(seconds: number): string {
  const h = Math.floor(seconds / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  const s = seconds % 60
  const hh = h > 0 ? `${String(h).padStart(2, '0')}:` : ''
  return `${hh}${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
}

function recorderMimeType() {
  return 'audio/wav'
}

function formatAudioFormatLabel(mimeType: string) {
  if (!mimeType) return 'nedisponibil'
  if (mimeType === 'audio/wav') return 'WAV (PCM 16-bit)'
  return mimeType
}

function mixToMono(inputBuffer: AudioBuffer) {
  const channelCount = inputBuffer.numberOfChannels
  const frameCount = inputBuffer.length

  if (channelCount === 1) {
    return inputBuffer.getChannelData(0).slice()
  }

  const mono = new Float32Array(frameCount)
  for (let channelIndex = 0; channelIndex < channelCount; channelIndex += 1) {
    const channelData = inputBuffer.getChannelData(channelIndex)
    for (let frameIndex = 0; frameIndex < frameCount; frameIndex += 1) {
      mono[frameIndex] += channelData[frameIndex] / channelCount
    }
  }
  return mono
}

function encodeWav(chunks: Float32Array[], sampleRate: number) {
  const totalFrames = chunks.reduce((count, chunk) => count + chunk.length, 0)
  const bytesPerSample = 2
  const channelCount = 1
  const dataSize = totalFrames * bytesPerSample
  const buffer = new ArrayBuffer(44 + dataSize)
  const view = new DataView(buffer)

  const writeAscii = (offset: number, value: string) => {
    for (let index = 0; index < value.length; index += 1) {
      view.setUint8(offset + index, value.charCodeAt(index))
    }
  }

  writeAscii(0, 'RIFF')
  view.setUint32(4, 36 + dataSize, true)
  writeAscii(8, 'WAVE')
  writeAscii(12, 'fmt ')
  view.setUint32(16, 16, true)
  view.setUint16(20, 1, true)
  view.setUint16(22, channelCount, true)
  view.setUint32(24, sampleRate, true)
  view.setUint32(28, sampleRate * channelCount * bytesPerSample, true)
  view.setUint16(32, channelCount * bytesPerSample, true)
  view.setUint16(34, bytesPerSample * 8, true)
  writeAscii(36, 'data')
  view.setUint32(40, dataSize, true)

  let offset = 44
  for (const chunk of chunks) {
    for (let index = 0; index < chunk.length; index += 1) {
      const sample = Math.max(-1, Math.min(1, chunk[index]))
      view.setInt16(offset, sample < 0 ? sample * 0x8000 : sample * 0x7fff, true)
      offset += bytesPerSample
    }
  }

  return buffer
}

function getUserRole(user: AuthUser): UserRole {
  if (user.role === 'admin' || user.role === 'operator' || user.role === 'participant') {
    return user.role
  }
  if (user.is_admin) return 'admin'
  if (user.is_participant) return 'participant'
  return 'operator'
}

export default function App() {
  // Settings & devices
  const [settings, setSettings] = useState<ClientSettings>(defaultSettings)
  const [devices, setDevices] = useState<MediaDeviceInfo[]>([])
  const [selectedDeviceId, setSelectedDeviceId] = useState('')
  const [savingSettings, setSavingSettings] = useState(false)
  const [settingsError, setSettingsError] = useState('')
  const [settingsSaved, setSettingsSaved] = useState(false)

  // Auth
  const [session, setSession] = useState<SessionState | null>(null)
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [loginLoading, setLoginLoading] = useState(false)
  const [loginError, setLoginError] = useState('')
  const [mustChangePassword, setMustChangePassword] = useState(false)

  // Queue
  const [queueItems, setQueueItems] = useState<QueueItem[]>([])
  const [refreshingQueue, setRefreshingQueue] = useState(false)
  const [drainingQueue, setDrainingQueue] = useState(false)
  const [uploadError, setUploadError] = useState('')

  // Recorder
  const [recorderState, setRecorderState] = useState<RecorderState>('idle')
  const [elapsedSeconds, setElapsedSeconds] = useState(0)
  const [sessionMeta, setSessionMeta] = useState<SessionMeetingMeta | null>(null)
  const [recorderError, setRecorderError] = useState('')

  // UI
  const [activeView, setActiveView] = useState<ViewKey>('overview')
  const [showStartModal, setShowStartModal] = useState(false)
  const [showStopModal, setShowStopModal] = useState(false)
  const [startForm, setStartForm] = useState({
    title: '',
    participants: '',
    meetingDate: new Date().toISOString().slice(0, 10),
    location: '',
  })

  const mediaStreamRef = useRef<MediaStream | null>(null)
  const audioContextRef = useRef<AudioContext | null>(null)
  const sourceNodeRef = useRef<MediaStreamAudioSourceNode | null>(null)
  const processorNodeRef = useRef<ScriptProcessorNode | null>(null)
  const segmentTimerRef = useRef<number | null>(null)
  const pcmChunksRef = useRef<Float32Array[]>([])
  const sampleRateRef = useRef(48000)
  const flushPromiseRef = useRef<Promise<void>>(Promise.resolve())
  const drainingRef = useRef(false)
  const sessionMetaRef = useRef<SessionMeetingMeta | null>(null)

  // Keep sessionMetaRef in sync so the dataavailable closure reads fresh values
  useEffect(() => {
    sessionMetaRef.current = sessionMeta
  }, [sessionMeta])

  const queueSizeBytes = useMemo(
    () => queueItems.reduce((total, item) => total + item.sizeBytes, 0),
    [queueItems],
  )

  // Live recording timer
  useEffect(() => {
    if (recorderState !== 'recording') {
      setElapsedSeconds(0)
      return
    }
    const start = Date.now()
    const id = window.setInterval(() => {
      setElapsedSeconds(Math.floor((Date.now() - start) / 1000))
    }, 1000)
    return () => window.clearInterval(id)
  }, [recorderState])

  async function refreshQueue() {
    setRefreshingQueue(true)
    try {
      const items = await window.meetrecDesktop.queue.list()
      setQueueItems(items)
    } finally {
      setRefreshingQueue(false)
    }
  }

  async function refreshDevices(requestPermission = false) {
    try {
      if (requestPermission) {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
        stream.getTracks().forEach(track => track.stop())
      }
      const deviceList = await navigator.mediaDevices.enumerateDevices()
      const audioInputs = deviceList.filter(device => device.kind === 'audioinput')
      setDevices(audioInputs)
      if (!selectedDeviceId && audioInputs[0]?.deviceId) {
        setSelectedDeviceId(audioInputs[0].deviceId)
      }
    } catch {
      // Silently ignore â€” device enumeration may fail before permission is granted
    }
  }

  async function restoreSession(currentSettings: ClientSettings) {
    const raw = window.localStorage.getItem(sessionStorageKey)
    if (!raw) return
    try {
      const parsed = JSON.parse(raw) as { token: string; username: string }
      const user = await getMe(currentSettings.serverUrl, parsed.token)
      if (user.must_change_password) {
        window.localStorage.removeItem(sessionStorageKey)
        return
      }
      setSession({ token: parsed.token, username: parsed.username, user })
    } catch {
      window.localStorage.removeItem(sessionStorageKey)
    }
  }

  // App init
  useEffect(() => {
    void (async () => {
      const loadedSettings = await window.meetrecDesktop.settings.load()
      setSettings(loadedSettings)
      setStartForm(prev => ({ ...prev, location: loadedSettings.location }))
      await Promise.all([refreshQueue(), refreshDevices(), restoreSession(loadedSettings)])
    })()
  }, [])

  // Device change listener
  useEffect(() => {
    const onDeviceChange = () => void refreshDevices()
    navigator.mediaDevices.addEventListener('devicechange', onDeviceChange)
    return () => navigator.mediaDevices.removeEventListener('devicechange', onDeviceChange)
  }, [])

  // Auto-drain upload queue
  useEffect(() => {
    if (!session?.token || !settings.serverUrl) return
    let cancelled = false

    const tick = async () => {
      if (cancelled || drainingRef.current) return
      drainingRef.current = true
      setDrainingQueue(true)
      try {
        while (!cancelled) {
          const items = await window.meetrecDesktop.queue.list()
          setQueueItems(items)
          if (!items.length) break

          const result = await window.meetrecDesktop.queue.upload({
            id: items[0].id,
            serverUrl: settings.serverUrl,
            token: session.token,
          })

          if (!result.ok) {
            if (result.status === 401) {
              setSession(null)
              window.localStorage.removeItem(sessionStorageKey)
              setUploadError('Sesiunea a expirat. Autentifica-te din nou.')
            } else {
              setUploadError(`Upload esuat (HTTP ${result.status}). Se retrimite automat.`)
            }
            break
          }

          await window.meetrecDesktop.queue.delete(items[0].id)
          setUploadError('')
        }
      } finally {
        drainingRef.current = false
        setDrainingQueue(false)
        if (!cancelled) {
          const items = await window.meetrecDesktop.queue.list()
          setQueueItems(items)
        }
      }
    }

    void tick()
    const timer = window.setInterval(() => void tick(), 5000)
    return () => {
      cancelled = true
      window.clearInterval(timer)
    }
  }, [session?.token, settings.serverUrl])

  async function flushCurrentSegment(meta: SessionMeetingMeta) {
    const chunks = pcmChunksRef.current
    if (!chunks.length) return

    pcmChunksRef.current = []
    const slug = settings.roomName.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-') || 'room'
    const fileName = `${slug}-${new Date().toISOString().replace(/[:.]/g, '-')}.wav`
    const bytes = encodeWav(chunks, sampleRateRef.current)

    flushPromiseRef.current = flushPromiseRef.current
      .then(async () => {
        await window.meetrecDesktop.queue.enqueue({
          fileName,
          mimeType: recorderMimeType(),
          bytes,
          roomName: settings.roomName,
          location: meta.location || settings.location,
          meetingDate: meta.meetingDate,
          title: meta.title,
          participants: meta.participants,
        })
        const items = await window.meetrecDesktop.queue.list()
        setQueueItems(items)
      })
      .catch(error => {
        setRecorderError(error instanceof Error ? error.message : 'Nu am putut salva segmentul audio.')
      })

    await flushPromiseRef.current
  }

  async function teardownRecorderResources() {
    if (segmentTimerRef.current !== null) {
      window.clearInterval(segmentTimerRef.current)
      segmentTimerRef.current = null
    }

    if (processorNodeRef.current) {
      processorNodeRef.current.onaudioprocess = null
      processorNodeRef.current.disconnect()
      processorNodeRef.current = null
    }

    sourceNodeRef.current?.disconnect()
    sourceNodeRef.current = null

    mediaStreamRef.current?.getTracks().forEach(track => track.stop())
    mediaStreamRef.current = null

    if (audioContextRef.current) {
      const currentAudioContext = audioContextRef.current
      audioContextRef.current = null
      await currentAudioContext.close().catch(() => undefined)
    }
  }

  async function stopRecording() {
    if (recorderState !== 'recording') return
    setRecorderState('stopping')

    const currentMeta = sessionMetaRef.current
    await teardownRecorderResources()
    if (currentMeta) {
      await flushCurrentSegment(currentMeta)
    }
    setSessionMeta(null)
    setRecorderState('idle')
  }

  async function startRecording(meta: SessionMeetingMeta) {
    setRecorderError('')
    if (!session) {
      setRecorderError('Clientul trebuie autentificat inainte de a porni inregistrarea.')
      return
    }
    if (typeof AudioContext === 'undefined') {
      setRecorderError('Browser engine-ul Electron nu suporta captura audio PCM necesara pentru WAV.')
      return
    }

    try {
      const audioConstraints = {
        ...(selectedDeviceId ? { deviceId: { exact: selectedDeviceId } } : {}),
        channelCount: 1,
        echoCancellation: false,
        noiseSuppression: false,
        autoGainControl: false,
      }
      const stream = await navigator.mediaDevices.getUserMedia({ audio: audioConstraints })
      mediaStreamRef.current = stream

      const audioContext = new AudioContext()
      await audioContext.resume()

      const sourceNode = audioContext.createMediaStreamSource(stream)
      const processorNode = audioContext.createScriptProcessor(4096, Math.max(1, sourceNode.channelCount || 1), 1)

      pcmChunksRef.current = []
      sampleRateRef.current = audioContext.sampleRate
      audioContextRef.current = audioContext
      sourceNodeRef.current = sourceNode
      processorNodeRef.current = processorNode

      processorNode.onaudioprocess = event => {
        pcmChunksRef.current.push(mixToMono(event.inputBuffer))
      }

      sourceNode.connect(processorNode)
      processorNode.connect(audioContext.destination)

      segmentTimerRef.current = window.setInterval(() => {
        const currentMeta = sessionMetaRef.current ?? meta
        void flushCurrentSegment(currentMeta)
      }, settings.segmentDurationSeconds * 1000)

      setSessionMeta(meta)
      setRecorderState('recording')
    } catch (err) {
      setRecorderError(err instanceof Error ? err.message : 'Nu am putut porni captura audio.')
      await teardownRecorderResources()
      setRecorderState('idle')
    }
  }

  async function handleConfirmStart() {
    if (!startForm.title.trim()) return
    setShowStartModal(false)
    await startRecording({
      title: startForm.title.trim(),
      participants: startForm.participants.trim(),
      meetingDate: startForm.meetingDate,
      location: startForm.location.trim() || settings.location,
    })
  }

  async function handleConfirmStop() {
    setShowStopModal(false)
    await stopRecording()
  }

  async function handleLogout() {
    if (recorderState === 'recording') await stopRecording()
    setSession(null)
    setMustChangePassword(false)
    setActiveView('overview')
    window.localStorage.removeItem(sessionStorageKey)
  }

  async function handleLogin(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setLoginLoading(true)
    setLoginError('')
    setMustChangePassword(false)
    try {
      const tokenResp = await login(settings.serverUrl, username, password)
      const user = await getMe(settings.serverUrl, tokenResp.access_token)
      if (user.must_change_password) {
        setMustChangePassword(true)
        setPassword('')
        return
      }
      const role = getUserRole(user)
      if (role === 'participant') {
        setLoginError('Contul cu rol participant nu are acces la clientul de sala.')
        setPassword('')
        return
      }
      setSession({ token: tokenResp.access_token, username, user })
      window.localStorage.setItem(sessionStorageKey, JSON.stringify({ token: tokenResp.access_token, username }))
      setPassword('')
    } catch (err) {
      setLoginError(err instanceof Error ? err.message : 'Autentificarea a esuat. Verifica credentialele si URL-ul.')
    } finally {
      setLoginLoading(false)
    }
  }

  async function handleSaveSettings(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setSavingSettings(true)
    setSettingsError('')
    setSettingsSaved(false)
    try {
      const sanitized: ClientSettings = {
        ...settings,
        serverUrl: normalizeServerUrl(settings.serverUrl),
        segmentDurationSeconds: Math.max(30, Math.min(3600, settings.segmentDurationSeconds)),
      }
      const persisted = await window.meetrecDesktop.settings.save(sanitized)
      setSettings(persisted)
      setSettingsSaved(true)
      setTimeout(() => setSettingsSaved(false), 3000)
    } catch (err) {
      setSettingsError(err instanceof Error ? err.message : 'Salvarea configuratiei a esuat.')
    } finally {
      setSavingSettings(false)
    }
  }

  function openStartModal() {
    setStartForm({
      title: '',
      participants: '',
      meetingDate: new Date().toISOString().slice(0, 10),
      location: settings.location,
    })
    setShowStartModal(true)
  }

  const selectedMicLabel = devices.find(d => d.deviceId === selectedDeviceId)?.label ?? 'Microfon implicit'

  // â”€â”€ Login screen â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  if (!session) {
    return (
      <main className="login-shell">
        <section className="login-card card">
          <p className="eyebrow">MeetRec Room Client</p>
          <h1>Conectare</h1>

          {mustChangePassword ? (
            <div className="message message-warning">
              <CircleAlert size={18} style={{ flexShrink: 0, marginTop: 2 }} />
              <div>
                <strong>Schimbare parola necesara</strong>
                <p>Contul tau necesita o noua parola la prima utilizare. Deschide aplicatia web MeetRec, logheaza-te acolo si seteaza o parola noua, apoi revino aici.</p>
              </div>
            </div>
          ) : loginError ? (
            <div className="message message-error">
              <CircleAlert size={18} style={{ flexShrink: 0 }} />
              <span>{loginError}</span>
            </div>
          ) : null}

          <form className="stack-form" onSubmit={handleLogin}>
            <label>
              <span>URL server MeetRec</span>
              <input
                value={settings.serverUrl}
                onChange={e => setSettings(c => ({ ...c, serverUrl: e.target.value }))}
                placeholder="http://server:8080"
                disabled={loginLoading}
              />
            </label>
            <label>
              <span>Username</span>
              <input
                value={username}
                onChange={e => setUsername(e.target.value)}
                placeholder="operator.sala"
                disabled={loginLoading}
                autoComplete="username"
              />
            </label>
            <label>
              <span>Parola</span>
              <input
                type="password"
                value={password}
                onChange={e => setPassword(e.target.value)}
                placeholder="â€¢â€¢â€¢â€¢â€¢â€¢â€¢â€¢"
                disabled={loginLoading}
                autoComplete="current-password"
              />
            </label>
            <button
              className="primary-button"
              type="submit"
              disabled={loginLoading || !username.trim() || !password}
            >
              <LogIn size={18} />
              {loginLoading ? 'Se conecteaza...' : 'Conectare'}
            </button>
          </form>
        </section>
      </main>
    )
  }

  const currentRole = getUserRole(session.user)

  // Participant blocked
  if (currentRole === 'participant') {
    return (
      <main className="login-shell">
        <section className="login-card card">
          <p className="eyebrow">MeetRec Room Client</p>
          <h1>Acces restrictionat</h1>
          <p className="login-subtitle">Contul cu rol participant nu are acces la clientul de captare audio din sala.</p>
          <button className="secondary-button" onClick={() => void handleLogout()}>Deconecteaza</button>
        </section>
      </main>
    )
  }

  // â”€â”€ Shared modals (operator + admin) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  const startModal = showStartModal ? (
    <div className="modal-overlay">
      <div className="modal card">
        <div className="modal-header">
          <h2>Incepe sedinta</h2>
          <button className="icon-button" onClick={() => setShowStartModal(false)} aria-label="Inchide">
            <X size={20} />
          </button>
        </div>
        <div className="stack-form">
          <label>
            <span>Titlu sedinta <em className="required">*</em></span>
            <input
              value={startForm.title}
              onChange={e => setStartForm(f => ({ ...f, title: e.target.value }))}
              placeholder="ex: Sedinta de management Martie 2026"
              autoFocus
            />
          </label>
          <label>
            <span>Participanti <em className="field-hint">(separati prin virgula)</em></span>
            <input
              value={startForm.participants}
              onChange={e => setStartForm(f => ({ ...f, participants: e.target.value }))}
              placeholder="Alice, Bob, Carol"
            />
          </label>
          <label>
            <span>Data sedintei</span>
            <input
              type="date"
              value={startForm.meetingDate}
              onChange={e => setStartForm(f => ({ ...f, meetingDate: e.target.value }))}
            />
          </label>
          <label>
            <span>Locatie</span>
            <input
              value={startForm.location}
              onChange={e => setStartForm(f => ({ ...f, location: e.target.value }))}
              placeholder={settings.location}
            />
          </label>
        </div>
        <div className="modal-actions">
          <button className="secondary-button" onClick={() => setShowStartModal(false)}>Anuleaza</button>
          <button
            className="primary-button"
            onClick={() => void handleConfirmStart()}
            disabled={!startForm.title.trim()}
          >
            <Mic size={18} />
            Porneste inregistrarea
          </button>
        </div>
      </div>
    </div>
  ) : null

  const stopModal = showStopModal ? (
    <div className="modal-overlay">
      <div className="modal modal-sm card">
        <h2>Incheie sedinta?</h2>
        <p>Inregistrarea va fi oprita. Segmentele deja salvate vor fi trimise automat catre server.</p>
        <div className="modal-actions">
          <button className="secondary-button" onClick={() => setShowStopModal(false)}>Continua inregistrarea</button>
          <button className="primary-button danger" onClick={() => void handleConfirmStop()}>
            <PauseCircle size={18} />
            Incheie sedinta
          </button>
        </div>
      </div>
    </div>
  ) : null

  // â”€â”€ Operator view â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  if (currentRole === 'operator') {
    return (
      <>
        {startModal}
        {stopModal}
        <main className="operator-shell">
          <section className="operator-panel card">
            <div className="operator-header">
              <div>
                <p className="eyebrow">MeetRec Â· {settings.roomName}</p>
                <p className="operator-user">{session.user.full_name || session.user.username}</p>
              </div>
              <button className="icon-text-button" onClick={() => void handleLogout()}>
                <LogIn size={15} />
                Logout
              </button>
            </div>

            {recorderState === 'idle' ? (
              <div className="operator-body">
                <div className="operator-idle-icon"><MicOff size={44} /></div>
                <h1 className="operator-state-label">In asteptare</h1>
                <p className="operator-state-sub">Nu exista o inregistrare activa.</p>
                {recorderError ? (
                  <div className="message message-error operator-message">
                    <CircleAlert size={18} style={{ flexShrink: 0 }} />
                    <span>{recorderError}</span>
                  </div>
                ) : null}
                <button className="primary-button operator-main-btn" onClick={openStartModal}>
                  <Mic size={22} />
                  Incepe sedinta
                </button>
              </div>
            ) : recorderState === 'stopping' ? (
              <div className="operator-body">
                <h1 className="operator-state-label">Oprire in curs...</h1>
                <p className="operator-state-sub">Ultimul segment este salvat si pus in coada.</p>
              </div>
            ) : (
              <div className="operator-body">
                <div className="recording-indicator">
                  <span className="pulse-dot" />
                  <span className="pulse-ring" />
                </div>
                <p className="operator-rec-badge">INREGISTREAZA</p>
                <div className="operator-timer">{formatDuration(elapsedSeconds)}</div>
                {sessionMeta ? (
                  <div className="operator-session-info">
                    <strong>{sessionMeta.title}</strong>
                    {sessionMeta.participants ? (
                      <p><Users size={13} style={{ flexShrink: 0 }} /> {sessionMeta.participants}</p>
                    ) : null}
                  </div>
                ) : null}
                {recorderError ? (
                  <div className="message message-error operator-message">
                    <CircleAlert size={18} style={{ flexShrink: 0 }} />
                    <span>{recorderError}</span>
                  </div>
                ) : null}
                <button className="primary-button danger operator-main-btn" onClick={() => setShowStopModal(true)}>
                  <PauseCircle size={22} />
                  Incheie sedinta
                </button>
              </div>
            )}

            <div className={`upload-status-bar ${drainingQueue ? 'syncing' : uploadError ? 'error' : 'ok'}`}>
              <span className="upload-dot" />
              <span>
                {drainingQueue
                  ? `Sincronizare in curs (${queueItems.length} segmente)...`
                  : uploadError
                    ? uploadError
                    : queueItems.length
                      ? `${queueItems.length} ${queueItems.length === 1 ? 'segment' : 'segmente'} in coada`
                      : 'Toate segmentele au fost trimise'}
              </span>
            </div>
          </section>
        </main>
      </>
    )
  }

  // â”€â”€ Admin view â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  const navItems: Array<{ key: ViewKey; label: string; icon: typeof LayoutDashboard; badge?: string }> = [
    { key: 'overview', label: 'Panou', icon: LayoutDashboard },
    { key: 'settings', label: 'Configurare', icon: Settings2 },
    { key: 'account', label: 'Cont', icon: UserRound },
    { key: 'queue', label: 'Coada upload', icon: Upload, badge: queueItems.length ? String(queueItems.length) : undefined },
    { key: 'diagnostics', label: 'Diagnostic', icon: Cpu },
  ]

  const setupChecks = [
    { label: 'Server configurat', done: !!settings.serverUrl && settings.serverUrl !== 'http://localhost:8080' },
    { label: 'Sesiune activa', done: true },
    { label: 'Microfon detectat', done: devices.length > 0 },
    { label: 'Sala configurata', done: !!settings.roomName.trim() },
  ]

  const diagnostics = [
    { key: 'Stare recorder', value: recorderState },
    { key: 'Upload automat', value: drainingQueue ? 'activ' : 'in asteptare' },
    { key: 'Segmente in coada', value: `${queueItems.length}` },
    { key: 'Spatiu coada', value: formatBytes(queueSizeBytes) },
    { key: 'Server API', value: normalizeServerUrl(settings.serverUrl) },
    { key: 'Durata segment', value: `${settings.segmentDurationSeconds}s` },
    { key: 'Microfon', value: selectedMicLabel },
    { key: 'Format audio', value: formatAudioFormatLabel(recorderMimeType()) },
  ]

  return (
    <>
      {startModal}
      {stopModal}
      <main className="app-shell">
        <aside className="sidebar card">
          <div>
            <p className="eyebrow">MeetRec Room Client</p>
            <h1 className="side-title">{settings.roomName || 'Admin console'}</h1>
            <p className="side-subtitle">{session.user.full_name || session.user.username} Â· Admin</p>
          </div>

          <div className="sidebar-recorder">
            <div className={`sidebar-rec-status status-${recorderState}`}>
              {recorderState === 'recording' ? (
                <><span className="pulse-dot-sm" />{formatDuration(elapsedSeconds)}</>
              ) : recorderState === 'stopping' ? 'Oprire...' : 'In asteptare'}
            </div>
            {recorderState === 'idle' ? (
              <button className="primary-button sidebar-rec-btn" onClick={openStartModal}>
                <Mic size={15} />
                Start
              </button>
            ) : recorderState === 'recording' ? (
              <button className="secondary-button sidebar-rec-btn" onClick={() => setShowStopModal(true)}>
                <PauseCircle size={15} />
                Stop
              </button>
            ) : null}
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
                  <span><Icon size={16} />{item.label}</span>
                  {item.badge ? <em>{item.badge}</em> : null}
                </button>
              )
            })}
          </nav>

          <div className="side-footer">
            <button className="secondary-button" onClick={() => void handleLogout()}>Logout</button>
          </div>
        </aside>

        <section className="content-column">
          {activeView === 'overview' ? (
            <section className="view-card card">
              <header className="panel-header compact">
                <div>
                  <p className="panel-kicker">Checklist pornire</p>
                  <h3>Stare sistem</h3>
                </div>
                <ListChecks className="panel-icon" />
              </header>

              {(recorderError || uploadError) ? (
                <div className="message message-error" style={{ marginBottom: 14 }}>
                  <CircleAlert size={18} style={{ flexShrink: 0 }} />
                  <span>{recorderError || uploadError}</span>
                </div>
              ) : null}

              <div className="check-grid">
                {setupChecks.map(check => (
                  <article key={check.label} className={`check-item ${check.done ? 'done' : ''}`}>
                    {check.done ? <CircleCheckBig size={18} /> : <CircleAlert size={18} />}
                    <span>{check.label}</span>
                  </article>
                ))}
              </div>

              <div className="stats-grid">
                <article>
                  <span>Server</span>
                  <strong>{normalizeServerUrl(settings.serverUrl)}</strong>
                </article>
                <article>
                  <span>Coada locala</span>
                  <strong>{queueItems.length} segmente</strong>
                </article>
                <article>
                  <span>Spatiu temporar</span>
                  <strong>{formatBytes(queueSizeBytes)}</strong>
                </article>
                <article>
                  <span>Microfon selectat</span>
                  <strong>{selectedMicLabel}</strong>
                </article>
              </div>

              {recorderState === 'recording' && sessionMeta ? (
                <div className="active-session-banner">
                  <span className="pulse-dot-sm" />
                  <div>
                    <strong>{sessionMeta.title}</strong>
                    <p>{formatDuration(elapsedSeconds)} Â· {sessionMeta.participants || 'fara participanti specificati'}</p>
                  </div>
                </div>
              ) : null}
            </section>
          ) : null}

          {activeView === 'settings' ? (
            <section className="view-card card">
              <header className="panel-header compact">
                <div>
                  <p className="panel-kicker">Configurare locala</p>
                  <h3>Server, sala si microfon</h3>
                </div>
                <Settings2 className="panel-icon" />
              </header>

              {settingsError ? (
                <div className="message message-error" style={{ marginBottom: 12 }}>
                  <CircleAlert size={18} />
                  <span>{settingsError}</span>
                </div>
              ) : settingsSaved ? (
                <div className="message message-success" style={{ marginBottom: 12 }}>
                  <CircleCheckBig size={18} />
                  <span>Configuratia a fost salvata.</span>
                </div>
              ) : null}

              <form className="stack-form" onSubmit={handleSaveSettings}>
                <label>
                  <span>URL server MeetRec</span>
                  <input
                    value={settings.serverUrl}
                    onChange={e => setSettings(c => ({ ...c, serverUrl: e.target.value }))}
                    placeholder="http://server:8080"
                  />
                </label>
                <label>
                  <span>Nume sala</span>
                  <input
                    value={settings.roomName}
                    onChange={e => setSettings(c => ({ ...c, roomName: e.target.value }))}
                    placeholder="Sala Consiliu"
                  />
                </label>
                <label>
                  <span>Locatie implicita</span>
                  <input
                    value={settings.location}
                    onChange={e => setSettings(c => ({ ...c, location: e.target.value }))}
                    placeholder="Etaj 2, cladirea A"
                  />
                </label>
                <label>
                  <span>Durata segment (secunde)</span>
                  <input
                    type="number"
                    min={30}
                    max={3600}
                    value={settings.segmentDurationSeconds}
                    onChange={e => setSettings(c => ({ ...c, segmentDurationSeconds: Number(e.target.value) || 300 }))}
                  />
                </label>
                <label>
                  <span>Microfon</span>
                  <select value={selectedDeviceId} onChange={e => setSelectedDeviceId(e.target.value)}>
                    <option value="">Microfon implicit</option>
                    {devices.map(d => (
                      <option key={d.deviceId} value={d.deviceId}>
                        {d.label || `Microfon ${d.deviceId.slice(0, 6)}`}
                      </option>
                    ))}
                  </select>
                </label>
                <div className="control-row">
                  <button className="primary-button" type="submit">
                    <Server size={16} />
                    {savingSettings ? 'Salvez...' : 'Salveaza configuratia'}
                  </button>
                  <button className="secondary-button" type="button" onClick={() => void refreshDevices(true)}>
                    <Mic size={15} />
                    Reincarca microfoanele
                  </button>
                </div>
              </form>
            </section>
          ) : null}

          {activeView === 'account' ? (
            <section className="view-card card">
              <header className="panel-header compact">
                <div>
                  <p className="panel-kicker">Autentificare</p>
                  <h3>Cont server</h3>
                </div>
                <UserRound className="panel-icon" />
              </header>
              <div className="session-card">
                <p className="session-user">{session.user.full_name || session.user.username}</p>
                <p>Username: {session.user.username}</p>
                <p>Email: {session.user.email ?? 'â€”'}</p>
                <p>Rol: {session.user.role ?? (session.user.is_admin ? 'admin' : 'operator')}</p>
                <div className="control-row">
                  <button className="secondary-button" onClick={() => void handleLogout()}>Deconecteaza</button>
                </div>
              </div>
            </section>
          ) : null}

          {activeView === 'queue' ? (
            <section className="view-card card">
              <header className="panel-header compact">
                <div>
                  <p className="panel-kicker">Buffer local</p>
                  <h3>Segmente in asteptare</h3>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <button
                    className="secondary-button"
                    style={{ minHeight: 34, padding: '0 10px', fontSize: '0.85rem' }}
                    onClick={() => void refreshQueue()}
                  >
                    <RefreshCcw size={14} />
                    {refreshingQueue ? 'Se actualizeaza...' : 'Refresh'}
                  </button>
                  <Upload className="panel-icon" />
                </div>
              </header>

              {drainingQueue ? (
                <div className="message message-success" style={{ marginBottom: 12 }}>
                  <RefreshCcw size={16} className="spin" />
                  <span>Upload in curs...</span>
                </div>
              ) : uploadError ? (
                <div className="message message-error" style={{ marginBottom: 12 }}>
                  <CircleAlert size={16} />
                  <span>{uploadError}</span>
                </div>
              ) : null}

              {queueItems.length === 0 ? (
                <p className="empty-state">Coada este goala. Segmentele apar aici cat timp asteapta trimiterea.</p>
              ) : (
                <div className="queue-list">
                  {queueItems.map(item => (
                    <article key={item.id} className="queue-item">
                      <div className="queue-item-info">
                        <strong>{item.title}</strong>
                        <p>{item.fileName}</p>
                        {item.participants ? (
                          <p className="queue-participants"><Users size={12} /> {item.participants}</p>
                        ) : null}
                      </div>
                      <div className="queue-item-meta">
                        <span>{formatLocalDate(item.createdAt)}</span>
                        <span>{formatBytes(item.sizeBytes)}</span>
                      </div>
                    </article>
                  ))}
                </div>
              )}
            </section>
          ) : null}

          {activeView === 'diagnostics' ? (
            <section className="view-card card">
              <header className="panel-header compact">
                <div>
                  <p className="panel-kicker">Diagnostic runtime</p>
                  <h3>Stare tehnica client</h3>
                </div>
                <Cpu className="panel-icon" />
              </header>
              <div className="diagnostics-grid">
                {diagnostics.map(item => (
                  <article key={item.key}>
                    <span>{item.key}</span>
                    <strong>{item.value}</strong>
                  </article>
                ))}
              </div>
              <div className="control-row" style={{ marginTop: 16 }}>
                <button className="secondary-button" onClick={() => void refreshQueue()}>
                  <RefreshCcw size={14} />
                  Refresh coada
                </button>
                <button className="secondary-button" onClick={() => void refreshDevices(true)}>
                  <Mic size={14} />
                  Redetecteaza microfoane
                </button>
              </div>
            </section>
          ) : null}
        </section>
      </main>
    </>
  )
}
