import { useEffect, useState } from 'react'

export type MicPermissionState = 'unknown' | 'checking' | 'granted' | 'prompt' | 'denied'

export function useDevices(enabled = true): {
  devices: MediaDeviceInfo[]
  selectedDevice: string
  setSelectedDevice: (id: string) => void
  permState: MicPermissionState
  requestPermission: () => Promise<void>
  error: string
} {
  const [devices, setDevices] = useState<MediaDeviceInfo[]>([])
  const [selectedDevice, setSelectedDevice] = useState('')
  const [permState, setPermState] = useState<MicPermissionState>('unknown')
  const [error, setError] = useState('')

  async function enumerateDevices(): Promise<MediaDeviceInfo[]> {
    const list = await navigator.mediaDevices.enumerateDevices()
    const audioInputs = list.filter(d => d.kind === 'audioinput')
    setDevices(audioInputs)
    return audioInputs
  }

  async function checkPermission(): Promise<void> {
    setPermState('checking')
    try {
      const result = await navigator.permissions.query({ name: 'microphone' as PermissionName })
      const state = result.state as MicPermissionState
      setPermState(state)

      if (state === 'granted') {
        await enumerateDevices()
      }

      result.onchange = () => {
        const newState = result.state as MicPermissionState
        setPermState(newState)
        if (newState === 'granted') {
          void enumerateDevices()
        }
      }
    } catch {
      // Permissions API not supported — fall back to enumeration
      const inputs = await enumerateDevices()
      setPermState(inputs.length > 0 ? 'granted' : 'prompt')
    }
  }

  async function requestPermission(): Promise<void> {
    setPermState('checking')
    setError('')
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      stream.getTracks().forEach(t => t.stop())
      const inputs = await enumerateDevices()
      setPermState('granted')
      if (!selectedDevice && inputs[0]?.deviceId) {
        setSelectedDevice(inputs[0].deviceId)
      }
    } catch (err) {
      const isDenied =
        err instanceof DOMException &&
        (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError')
      setPermState(isDenied ? 'denied' : 'prompt')
      setError(isDenied ? 'Accesul la microfon a fost refuzat.' : 'Nu s-a putut accesa microfonul.')
    }
  }

  // Init: check permission and watch for device changes — only when enabled
  useEffect(() => {
    if (!enabled) return

    void checkPermission()

    const onDeviceChange = () => void enumerateDevices()
    navigator.mediaDevices.addEventListener('devicechange', onDeviceChange)
    return () => navigator.mediaDevices.removeEventListener('devicechange', onDeviceChange)
  }, [enabled])

  // Auto-select first device when list becomes available
  useEffect(() => {
    if (!selectedDevice && devices[0]?.deviceId) {
      setSelectedDevice(devices[0].deviceId)
    }
  }, [devices])

  return {
    devices,
    selectedDevice,
    setSelectedDevice,
    permState,
    requestPermission,
    error,
  }
}
