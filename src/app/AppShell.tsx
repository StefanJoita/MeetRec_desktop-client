import { useEffect } from 'react'
import { useAuth, getUserRole } from '@/features/auth/hooks/useAuth'
import { useSettings } from '@/features/settings/hooks/useSettings'
import { useDevices } from '@/shared/hooks/useDevices'
import { useRecorder } from '@/features/recorder/hooks/useRecorder'
import { useQueueSync } from '@/features/queue/hooks/useQueueSync'
import { SetupWizard } from '@/features/setup/SetupWizard'
import { LoginScreen } from '@/features/auth/LoginScreen'
import { OperatorScreen } from '@/screens/OperatorScreen'
import { AdminScreen } from '@/screens/AdminScreen'
import { ParticipantBlockedScreen } from '@/screens/ParticipantBlockedScreen'

export function AppShell() {
  const {
    settings,
    setSettings,
    saving: savingSettings,
    error: settingsError,
    saved: settingsSaved,
    loadSettings,
    saveSettings,
  } = useSettings()

  const {
    session,
    loading: authLoading,
    error: authError,
    mustChangePassword,
    restoreSession,
    handleLogin,
    logout,
  } = useAuth()

  const {
    devices,
    selectedDeviceId,
    setSelectedDeviceId,
    selectedLabel: selectedDeviceLabel,
    permissionState,
    requestPermission,
  } = useDevices()

  const {
    state: recorderState,
    elapsedSeconds,
    sessionMeta,
    error: recorderError,
    start: startRecording,
    stop: stopRecording,
  } = useRecorder(settings.roomName, settings.location, settings.segmentDurationSeconds)

  const {
    items: queueItems,
    draining: queueDraining,
    error: queueError,
    totalBytes: queueTotalBytes,
    deleteItem: deleteQueueItem,
  } = useQueueSync(session?.token ?? null, settings.serverUrl, () => {
    void (async () => {
      if (recorderState === 'recording') await stopRecording()
      logout()
    })()
  })

  // Init
  useEffect(() => {
    void (async () => {
      const loaded = await loadSettings()
      if (loaded.setupComplete) {
        await restoreSession(loaded)
      }
    })()
  }, [])

  function handleStart(meta: Parameters<typeof startRecording>[0]) {
    return startRecording(meta, selectedDeviceId)
  }

  async function handleLogout() {
    if (recorderState === 'recording') await stopRecording()
    logout()
  }

  // — Loading state (eerste init) —
  if (!settings.setupComplete && authLoading) return null

  // — Setup wizard —
  if (!settings.setupComplete) {
    return (
      <SetupWizard
        settings={settings}
        onSettingsChange={updates => setSettings(s => ({ ...s, ...updates }))}
        onSave={async updates => { await saveSettings(updates) }}
        permissionState={permissionState}
        devices={devices}
        selectedDeviceId={selectedDeviceId}
        onSelectDevice={setSelectedDeviceId}
        onRequestPermission={requestPermission}
        onComplete={async () => { /* setupComplete saved by wizard */ }}
      />
    )
  }

  // — Login —
  if (!session) {
    return (
      <LoginScreen
        serverUrl={settings.serverUrl}
        loading={authLoading}
        error={authError}
        mustChangePassword={mustChangePassword}
        onLogin={(username, password) => handleLogin(settings.serverUrl, username, password)}
      />
    )
  }

  const role = getUserRole(session.user)

  // — Participant blocked —
  if (role === 'participant') {
    return <ParticipantBlockedScreen onLogout={handleLogout} />
  }

  // — Operator —
  if (role === 'operator') {
    return (
      <OperatorScreen
        session={session}
        settings={settings}
        recorderState={recorderState}
        elapsedSeconds={elapsedSeconds}
        sessionMeta={sessionMeta}
        recorderError={recorderError}
        queue={{ count: queueItems.length, draining: queueDraining, error: queueError }}
        onStart={handleStart}
        onStop={stopRecording}
        onLogout={handleLogout}
      />
    )
  }

  // — Admin —
  return (
    <AdminScreen
      session={session}
      settings={settings}
      onSettingsChange={updates => setSettings(s => ({ ...s, ...updates }))}
      onSaveSettings={updates => saveSettings(updates ?? {})}
      savingSettings={savingSettings}
      settingsError={settingsError}
      settingsSaved={settingsSaved}
      recorderState={recorderState}
      elapsedSeconds={elapsedSeconds}
      sessionMeta={sessionMeta}
      recorderError={recorderError}
      queueItems={queueItems}
      queueDraining={queueDraining}
      queueError={queueError}
      queueTotalBytes={queueTotalBytes}
      onDeleteQueueItem={deleteQueueItem}
      devices={devices}
      selectedDeviceId={selectedDeviceId}
      selectedDeviceLabel={selectedDeviceLabel}
      permissionState={permissionState}
      onSelectDevice={setSelectedDeviceId}
      onRequestPermission={requestPermission}
      onStart={handleStart}
      onStop={stopRecording}
      onLogout={handleLogout}
    />
  )
}
