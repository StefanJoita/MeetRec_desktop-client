import { CircleAlert, CircleCheckBig, Mic, RefreshCcw, Server, Settings2 } from 'lucide-react'
import { useSetupFlow } from './hooks/useSetupFlow'
import type { ClientSettings } from '@/types/electron'
import type { MicPermissionState } from '@/shared/hooks/useDevices'

type Props = {
  settings: ClientSettings
  onSettingsChange: (updates: Partial<ClientSettings>) => void
  onSave: (updates: Partial<ClientSettings>) => Promise<void>
  permissionState: MicPermissionState
  devices: MediaDeviceInfo[]
  selectedDeviceId: string
  onSelectDevice: (id: string) => void
  onRequestPermission: () => Promise<boolean>
  onComplete: () => Promise<void>
}

const stepLabels = ['Servidor', 'Sală', 'Microfon']

export function SetupWizard({
  settings,
  onSettingsChange,
  onSave,
  permissionState,
  devices,
  selectedDeviceId,
  onSelectDevice,
  onRequestPermission,
  onComplete,
}: Props) {
  const {
    step,
    setStep,
    testingConnection,
    connectionResult,
    handleTestConnection,
    canProceedFromServer,
    canProceedFromRoom,
    canProceedFromMic,
  } = useSetupFlow()

  const stepIndex = ['server', 'room', 'microphone'].indexOf(step)

  async function handleFinish() {
    await onSave({ setupComplete: true })
    await onComplete()
  }

  return (
    <main className="login-shell">
      <section className="login-card card">
        <p className="eyebrow">MeetRec Room Client</p>
        <h1 style={{ marginBottom: 6 }}>Configurare inițială</h1>

        {/* Progress */}
        <div className="setup-steps">
          {stepLabels.map((label, i) => (
            <div key={label} className={`setup-step ${i <= stepIndex ? 'active' : ''} ${i < stepIndex ? 'done' : ''}`}>
              <span className="setup-step-dot">{i < stepIndex ? <CircleCheckBig size={14} /> : i + 1}</span>
              <span className="setup-step-label">{label}</span>
            </div>
          ))}
        </div>

        {/* Step 1 — Server */}
        {step === 'server' && (
          <div className="stack-form" style={{ marginTop: 20 }}>
            <p style={{ color: '#adc1b4', margin: 0 }}>Introdu URL-ul serverului MeetRec și testează conexiunea.</p>

            <label>
              <span>URL server</span>
              <input
                value={settings.serverUrl}
                onChange={e => onSettingsChange({ serverUrl: e.target.value })}
                placeholder="http://server:8080"
              />
            </label>

            <button
              className="secondary-button"
              style={{ justifyContent: 'center' }}
              onClick={() => void handleTestConnection(settings.serverUrl)}
              disabled={testingConnection || !settings.serverUrl.trim()}
            >
              <RefreshCcw size={16} className={testingConnection ? 'spin' : ''} />
              {testingConnection ? 'Se testează...' : 'Testează conexiunea'}
            </button>

            {connectionResult && (
              <div className={`message ${connectionResult.ok ? 'message-success' : 'message-error'}`}>
                {connectionResult.ok
                  ? <><CircleCheckBig size={16} /> Server accesibil</>
                  : <><CircleAlert size={16} /> {connectionResult.error}</>
                }
              </div>
            )}

            <div className="modal-actions" style={{ marginTop: 8 }}>
              <button
                className="primary-button"
                onClick={() => void onSave({ serverUrl: settings.serverUrl }).then(() => setStep('room'))}
                disabled={!canProceedFromServer(connectionResult)}
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
            <p style={{ color: '#adc1b4', margin: 0 }}>Configurează informațiile despre această sală.</p>

            <label>
              <span>Nume sală <em className="required">*</em></span>
              <input
                value={settings.roomName}
                onChange={e => onSettingsChange({ roomName: e.target.value })}
                placeholder="ex: Sala de ședințe A"
                autoFocus
              />
            </label>
            <label>
              <span>Locație</span>
              <input
                value={settings.location}
                onChange={e => onSettingsChange({ location: e.target.value })}
                placeholder="ex: Sediu central, etaj 2"
              />
            </label>
            <label>
              <span>Durată segment (secunde)</span>
              <input
                type="number"
                min={30}
                max={3600}
                value={settings.segmentDurationSeconds}
                onChange={e => onSettingsChange({ segmentDurationSeconds: Number(e.target.value) || 300 })}
              />
            </label>

            <div className="modal-actions" style={{ marginTop: 8 }}>
              <button className="secondary-button" onClick={() => setStep('server')}>Înapoi</button>
              <button
                className="primary-button"
                onClick={() => void onSave({ roomName: settings.roomName, location: settings.location, segmentDurationSeconds: settings.segmentDurationSeconds }).then(() => setStep('microphone'))}
                disabled={!canProceedFromRoom(settings.roomName)}
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
            <p style={{ color: '#adc1b4', margin: 0 }}>Acordă acces la microfon pentru a putea înregistra.</p>

            {permissionState === 'denied' && (
              <div className="message message-error">
                <CircleAlert size={16} style={{ flexShrink: 0 }} />
                <div>
                  <strong>Acces refuzat</strong>
                  <p style={{ margin: '4px 0 0', fontSize: '0.88rem' }}>
                    Deschide Setări Windows → Confidențialitate → Microfon și activează accesul pentru aplicații desktop.
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
                    <select value={selectedDeviceId} onChange={e => onSelectDevice(e.target.value)}>
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

            {(permissionState === 'unknown' || permissionState === 'checking' || permissionState === 'prompt') && (
              <button
                className="primary-button"
                style={{ justifyContent: 'center', minHeight: 54 }}
                onClick={() => void onRequestPermission()}
                disabled={permissionState === 'checking'}
              >
                <Mic size={20} />
                {permissionState === 'checking' ? 'Se verifică...' : 'Acordă acces la microfon'}
              </button>
            )}

            <div className="modal-actions" style={{ marginTop: 8 }}>
              <button className="secondary-button" onClick={() => setStep('room')}>Înapoi</button>
              <button
                className="primary-button"
                onClick={() => void handleFinish()}
                disabled={!canProceedFromMic(permissionState)}
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
