import { useEffect, useState } from 'react'

export type MicPermissionState = 'unknown' | 'checking' | 'granted' | 'prompt' | 'denied'

export function useDevices() {
  const [devices, setDevices] = useState<MediaDeviceInfo[]>([])
  const [selectedDeviceId, setSelectedDeviceId] = useState('')
  const [permissionState, setPermissionState] = useState<MicPermissionState>('unknown')

  async function enumerateDevices() {
    const deviceList = await navigator.mediaDevices.enumerateDevices()
    const audioInputs = deviceList.filter(d => d.kind === 'audioinput')
    setDevices(audioInputs)
    return audioInputs
  }

  async function checkPermission() {
    setPermissionState('checking')
    try {
      const result = await navigator.permissions.query({ name: 'microphone' as PermissionName })
      const state = result.state as MicPermissionState
      setPermissionState(state)

      if (state === 'granted') {
        await enumerateDevices()
      }

      result.onchange = () => {
        const newState = result.state as MicPermissionState
        setPermissionState(newState)
        if (newState === 'granted') {
          void enumerateDevices()
        }
      }
    } catch {
      // Unele browsere nu suportă permissions API — fallback la enumerat direct
      const inputs = await enumerateDevices()
      setPermissionState(inputs.length > 0 ? 'granted' : 'prompt')
    }
  }

  async function requestPermission(): Promise<boolean> {
    setPermissionState('checking')
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      stream.getTracks().forEach(track => track.stop())
      const inputs = await enumerateDevices()
      setPermissionState('granted')
      if (!selectedDeviceId && inputs[0]?.deviceId) {
        setSelectedDeviceId(inputs[0].deviceId)
      }
      return true
    } catch (err) {
      const isDenied = err instanceof DOMException && (
        err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError'
      )
      setPermissionState(isDenied ? 'denied' : 'prompt')
      return false
    }
  }

  async function testDevice(deviceId: string): Promise<{ ok: boolean; error?: string }> {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: { deviceId: { exact: deviceId } },
      })
      stream.getTracks().forEach(track => track.stop())
      return { ok: true }
    } catch (err) {
      return {
        ok: false,
        error: err instanceof DOMException ? err.message : 'Dispozitivul nu este accesibil.',
      }
    }
  }

  // Init: verifică permisiunea și ascultă schimbări de device
  useEffect(() => {
    void checkPermission()

    const onDeviceChange = () => void enumerateDevices()
    navigator.mediaDevices.addEventListener('devicechange', onDeviceChange)
    return () => navigator.mediaDevices.removeEventListener('devicechange', onDeviceChange)
  }, [])

  // Auto-selectează primul device când lista devine disponibilă
  useEffect(() => {
    if (!selectedDeviceId && devices[0]?.deviceId) {
      setSelectedDeviceId(devices[0].deviceId)
    }
  }, [devices])

  const selectedLabel = devices.find(d => d.deviceId === selectedDeviceId)?.label ?? 'Microfon implicit'

  return {
    devices,
    selectedDeviceId,
    setSelectedDeviceId,
    selectedLabel,
    permissionState,
    requestPermission,
    testDevice,
  }
}
