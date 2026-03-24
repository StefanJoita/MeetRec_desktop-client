import { useState } from 'react'
import { testConnection } from '@/infrastructure/api/auth-api'
import type { MicPermissionState } from '@/shared/hooks/useDevices'

export type SetupStep = 'server' | 'room' | 'microphone'

export function useSetupFlow() {
  const [step, setStep] = useState<SetupStep>('server')
  const [testingConnection, setTestingConnection] = useState(false)
  const [connectionResult, setConnectionResult] = useState<{ ok: boolean; error?: string } | null>(null)

  async function handleTestConnection(serverUrl: string) {
    setTestingConnection(true)
    setConnectionResult(null)
    const result = await testConnection(serverUrl)
    setConnectionResult(result)
    setTestingConnection(false)
    return result
  }

  function canProceedFromServer(connectionResult: { ok: boolean } | null) {
    return connectionResult?.ok === true
  }

  function canProceedFromRoom(roomName: string) {
    return roomName.trim().length > 0
  }

  function canProceedFromMic(permState: MicPermissionState) {
    return permState === 'granted'
  }

  return {
    step,
    setStep,
    testingConnection,
    connectionResult,
    handleTestConnection,
    canProceedFromServer,
    canProceedFromRoom,
    canProceedFromMic,
  }
}
