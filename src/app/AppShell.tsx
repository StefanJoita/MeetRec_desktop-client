import { useState } from 'react'
import { useMainState } from '@/hooks/useMainState'
import { useCapture } from '@/hooks/useCapture'
import { useDevices } from '@/hooks/useDevices'
import { LoginScreen } from '@/screens/LoginScreen'
import { SetupWizard } from '@/screens/SetupWizard'
import { OperatorScreen } from '@/screens/OperatorScreen'
import { AdminScreen } from '@/screens/AdminScreen'
import { ParticipantBlockedScreen } from '@/screens/ParticipantBlockedScreen'
import type { AuthUser } from '@/types/electron'

function getUserRole(user: AuthUser): 'admin' | 'operator' | 'participant' {
  if (user.role === 'admin' || user.role === 'operator' || user.role === 'participant') {
    return user.role
  }
  if (user.is_admin) return 'admin'
  if (user.is_participant) return 'participant'
  return 'operator'
}

export function AppShell() {
  const state = useMainState()
  const {
    authLoading,
    user,
    settingsLoading,
    settings,
    session,
    queue,
    queueItems,
    queueItemsLoading,
    login,
    logout,
    saveSettings,
    startSession,
    stopSession,
    refreshQueueItems,
    deleteSegment,
    retrySegment,
    pingServer,
  } = state

  // useCapture runs as a side-effect only — starts/stops AudioWorklet in response to push events
  useCapture()

  // Device enumeration — pornește doar după login (evită promptul de microfon pe login/setup)
  const { selectedDevice } = useDevices(!!user)

  // Track settingsSaving state locally (SettingsForm manages its own internal saving state,
  // but AdminScreen accepts a prop for external indication if needed)
  const [settingsSaving, setSettingsSaving] = useState(false)

  async function handleSaveSettings(updates: Parameters<typeof saveSettings>[0]) {
    setSettingsSaving(true)
    try {
      await saveSettings(updates)
    } finally {
      setSettingsSaving(false)
    }
  }

  // ─── Loading ────────────────────────────────────────────────────────────────
  if (authLoading || settingsLoading) {
    return null
  }

  // ─── Setup wizard ───────────────────────────────────────────────────────────
  if (!settings.setupComplete) {
    return (
      <SetupWizard
        settings={settings}
        onComplete={saveSettings}
        pingServer={pingServer}
      />
    )
  }

  // ─── Login ──────────────────────────────────────────────────────────────────
  if (!user) {
    return (
      <LoginScreen
        settings={settings}
        onLogin={login}
        error=""
        loading={false}
      />
    )
  }

  const role = getUserRole(user)

  // ─── Participant blocked ────────────────────────────────────────────────────
  if (role === 'participant') {
    return <ParticipantBlockedScreen onLogout={logout} />
  }

  // ─── Operator ───────────────────────────────────────────────────────────────
  if (role === 'operator') {
    return (
      <OperatorScreen
        user={user}
        session={session}
        queue={queue}
        settings={settings}
        selectedDevice={selectedDevice}
        onStartSession={startSession}
        onStopSession={stopSession}
        onLogout={logout}
      />
    )
  }

  // ─── Admin ──────────────────────────────────────────────────────────────────
  return (
    <AdminScreen
      user={user}
      session={session}
      queue={queue}
      queueItems={queueItems}
      queueItemsLoading={queueItemsLoading}
      settings={settings}
      selectedDevice={selectedDevice}
      onStartSession={startSession}
      onStopSession={stopSession}
      onLogout={logout}
      onSaveSettings={handleSaveSettings}
      settingsSaving={settingsSaving}
      onDeleteSegment={deleteSegment}
      onRetrySegment={retrySegment}
      onRefreshQueue={refreshQueueItems}
      pingServer={pingServer}
    />
  )
}
