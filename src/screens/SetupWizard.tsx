import { useState } from 'react'
import {
  CircleAlert,
  CircleCheckBig,
  Mic,
  RefreshCcw,
  Server,
  Settings2,
} from 'lucide-react'
import type { ClientSettings } from '@/types/electron'
import type { MicPermissionState } from '@/hooks/useDevices'

type Step = 'server' | 'room' | 'microphone'

const STEP_LABELS = ['Servidor', 'Sală', 'Microfon']
const STEP_KEYS: Step[] = ['server', 'room', 'microphone']

interface Props {
  settings: ClientSettings
  onComplete: (settings: Partial<ClientSettings>) => Promise<void>
  pingServer: (url: string) => Promise<{ ok: boolean; latencyMs?: number; error?: string }>
}

export function SetupWizard({ settings, onComplete, pingServer }: Props) {
  // Local form state (wizard works on a copy)
  const [serverUrl, setServerUrl] = useState(settings.serverUrl)
  const [roomName, setRoomName] = useState(settings.roomName)
  const [location, setLocation] = useState(settings.location)
  const [segmentDurationSeconds, setSegmentDurationSeconds] = useState(
    settings.segmentDurationSeconds,
  )

  const [step, setStep] = useState<Step>('server')
  const stepIndex = STEP_KEYS.indexOf(step)

  // Connection test state
  const [testingConnection, setTestingConnection] = useState(false)
  const [connectionResult, setConnectionResult] = useState<{
    ok: boolean
    latencyMs?: number
    error?: string
  } | null>(null)

  // Mic state (inline — no external hook dependency)
  const [permissionState, setPermissionState] = useState<MicPermissionState>('unknown')
  const [devices, setDevices] = useState<MediaDeviceInfo[]>([])
  const [selectedDeviceId, setSelectedDeviceId] = useState('')

  async function handleTestConnection() {
    setTestingConnection(true)
    setConnectionResult(null)
    const result = await pingServer(serverUrl)
    setConnectionResult(result)
    setTestingConnection(false)
  }

  async function handleRequestPermission() {
    setPermissionState('checking' as MicPermissionState)
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      stream.getTracks().forEach(t => t.stop())
      const list = await navigator.mediaDevices.enumerateDevices()
      const inputs = list.filter(d => d.kind === 'audioinput')
      setDevices(inputs)
      setPermissionState('granted')
      if (!selectedDeviceId && inputs[0]?.deviceId) {
        setSelectedDeviceId(inputs[0].deviceId)
      }
    } catch (err) {
      const isDenied =
        err instanceof DOMException &&
        (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError')
      setPermissionState(isDenied ? 'denied' : 'prompt')
    }
  }

  async function handleFinish() {
    await onComplete({
      serverUrl,
      roomName,
      location,
      segmentDurationSeconds,
      setupComplete: true,
    })
  }

  const canProceedFromServer = connectionResult?.ok === true
  const canProceedFromRoom = roomName.trim().length > 0
  const canProceedFromMic = permissionState === 'granted'

  return (
    <main className="login-shell">
      <section className="login-card card">
        <p className="eyebrow">MeetRec Room Client</p>
        <h1 style={{ marginBottom: 6 }}>Configurare inițială</h1>

        {/* Progress steps */}
        <div className="setup-steps">
          {STEP_LABELS.map((label, i) => (
            <div
              key={label}
              className={`setup-step ${i <= stepIndex ? 'active' : ''} ${i < stepIndex ? 'done' : ''}`}
            >
              <span className="setup-step-dot">
                {i < stepIndex ? <CircleCheckBig size={14} /> : i + 1}
              </span>
              <span className="setup-step-label">{label}</span>
            </div>
          ))}
        </div>

        {/* Step 1 — Server */}
        {step === 'server' && (
          <div className="stack-form" style={{ marginTop: 20 }}>
            <p style={{ color: '#adc1b4', margin: 0 }}>
              Introdu URL-ul serverului MeetRec și testează conexiunea.
            </p>

            <label>
              <span>URL server</span>
              <input
                value={serverUrl}
                onChange={e => {
                  setServerUrl(e.target.value)
                  setConnectionResult(null)
                }}
                placeholder="http://server:8080"
                autoFocus
              />
            </label>

            <button
              className="secondary-button"
              style={{ justifyContent: 'center' }}
              onClick={() => void handleTestConnection()}
              disabled={testingConnection || !serverUrl.trim()}
            >
              <RefreshCcw size={16} className={testingConnection ? 'spin' : ''} />
              {testingConnection ? 'Se testează...' : 'Testează conexiunea'}
            </button>

            {connectionResult && (
              <div
                className={`message ${connectionResult.ok ? 'message-success' : 'message-error'}`}
              >
                {connectionResult.ok ? (
                  <>
                    <CircleCheckBig size={16} />
                    Server accesibil
                    {connectionResult.latencyMs !== undefined
                      ? ` (${connectionResult.latencyMs}ms)`
                      : ''}
                  </>
                ) : (
                  <>
                    <CircleAlert size={16} /> {connectionResult.error}
                  </>
                )}
              </div>
            )}

            <div className="modal-actions" style={{ marginTop: 8 }}>
              <button
                className="primary-button"
                onClick={() => setStep('room')}
                disabled={!canProceedFromServer}
              >
                <Server size={16} />
                Continuă
              </button>
            </div>
          </div>
        )}

        {/* Step 2 — Room */}
        {step === 'room' && (
          <div className="stack-form" style={{ marginTop: 20 }}>
            <p style={{ color: '#adc1b4', margin: 0 }}>
              Configurează informațiile despre această sală.
            </p>

            <label>
              <span>
                Nume sală <em className="required">*</em>
              </span>
              <input
                value={roomName}
                onChange={e => setRoomName(e.target.value)}
                placeholder="ex: Sala de ședințe A"
                autoFocus
              />
            </label>
            <label>
              <span>Locație</span>
              <input
                value={location}
                onChange={e => setLocation(e.target.value)}
                placeholder="ex: Sediu central, etaj 2"
              />
            </label>
            <label>
              <span>Durată segment (secunde)</span>
              <input
                type="number"
                min={30}
                max={3600}
                value={segmentDurationSeconds}
                onChange={e =>
                  setSegmentDurationSeconds(Number(e.target.value) || 300)
                }
              />
            </label>

            <div className="modal-actions" style={{ marginTop: 8 }}>
              <button className="secondary-button" onClick={() => setStep('server')}>
                Înapoi
              </button>
              <button
                className="primary-button"
                onClick={() => setStep('microphone')}
                disabled={!canProceedFromRoom}
              >
                <Settings2 size={16} />
                Continuă
              </button>
            </div>
          </div>
        )}

        {/* Step 3 — Microphone */}
        {step === 'microphone' && (
          <div className="stack-form" style={{ marginTop: 20 }}>
            <p style={{ color: '#adc1b4', margin: 0 }}>
              Acordă acces la microfon pentru a putea înregistra.
            </p>

            {permissionState === 'denied' && (
              <div className="message message-error">
                <CircleAlert size={16} style={{ flexShrink: 0 }} />
                <div>
                  <strong>Acces refuzat</strong>
                  <p style={{ margin: '4px 0 0', fontSize: '0.88rem' }}>
                    Deschide Setări Windows → Confidențialitate → Microfon și activează accesul
                    pentru aplicații desktop.
                  </p>
                </div>
              </div>
            )}

            {permissionState === 'granted' && (
              <>
                <div className="message message-success">
                  <CircleCheckBig size={16} />
                  Acces la microfon acordat
                </div>

                {devices.length > 0 && (
                  <label>
                    <span>Microfon activ</span>
                    <select
                      value={selectedDeviceId}
                      onChange={e => setSelectedDeviceId(e.target.value)}
                    >
                      {devices.map(d => (
                        <option key={d.deviceId} value={d.deviceId}>
                          {d.label || `Microfon ${d.deviceId.slice(0, 6)}`}
                        </option>
                      ))}
                    </select>
                  </label>
                )}
              </>
            )}

            {(permissionState === 'unknown' ||
              (permissionState as string) === 'checking' ||
              permissionState === 'prompt') && (
              <button
                className="primary-button"
                style={{ justifyContent: 'center', minHeight: 54 }}
                onClick={() => void handleRequestPermission()}
                disabled={(permissionState as string) === 'checking'}
              >
                <Mic size={20} />
                {(permissionState as string) === 'checking'
                  ? 'Se verifică...'
                  : 'Acordă acces la microfon'}
              </button>
            )}

            <div className="modal-actions" style={{ marginTop: 8 }}>
              <button className="secondary-button" onClick={() => setStep('room')}>
                Înapoi
              </button>
              <button
                className="primary-button"
                onClick={() => void handleFinish()}
                disabled={!canProceedFromMic}
              >
                <CircleCheckBig size={16} />
                Finalizează configurarea
              </button>
            </div>
          </div>
        )}
      </section>
    </main>
  )
}
