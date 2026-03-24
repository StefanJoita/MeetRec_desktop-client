import { useEffect, useRef, useState } from 'react'
import { desktopBridge } from '@/infrastructure/desktop-bridge'

export type RecorderState = 'idle' | 'recording' | 'stopping'

export type RecordingMeta = {
  title: string
  participants: string
  meetingDate: string
  location: string
}

function mixToMono(inputBuffer: AudioBuffer): Float32Array {
  const channelCount = inputBuffer.numberOfChannels
  const frameCount = inputBuffer.length

  if (channelCount === 1) {
    return inputBuffer.getChannelData(0).slice()
  }

  const mono = new Float32Array(frameCount)
  for (let ch = 0; ch < channelCount; ch++) {
    const channelData = inputBuffer.getChannelData(ch)
    for (let i = 0; i < frameCount; i++) {
      mono[i] += channelData[i] / channelCount
    }
  }
  return mono
}

function encodeWav(chunks: Float32Array[], sampleRate: number): ArrayBuffer {
  const totalFrames = chunks.reduce((n, c) => n + c.length, 0)
  const bytesPerSample = 2
  const dataSize = totalFrames * bytesPerSample
  const buffer = new ArrayBuffer(44 + dataSize)
  const view = new DataView(buffer)

  const writeAscii = (offset: number, value: string) => {
    for (let i = 0; i < value.length; i++) view.setUint8(offset + i, value.charCodeAt(i))
  }

  writeAscii(0, 'RIFF')
  view.setUint32(4, 36 + dataSize, true)
  writeAscii(8, 'WAVE')
  writeAscii(12, 'fmt ')
  view.setUint32(16, 16, true)
  view.setUint16(20, 1, true)
  view.setUint16(22, 1, true)
  view.setUint32(24, sampleRate, true)
  view.setUint32(28, sampleRate * 2, true)
  view.setUint16(32, 2, true)
  view.setUint16(34, 16, true)
  writeAscii(36, 'data')
  view.setUint32(40, dataSize, true)

  let offset = 44
  for (const chunk of chunks) {
    for (let i = 0; i < chunk.length; i++) {
      const sample = Math.max(-1, Math.min(1, chunk[i]))
      view.setInt16(offset, sample < 0 ? sample * 0x8000 : sample * 0x7fff, true)
      offset += 2
    }
  }

  return buffer
}

export function useRecorder(roomName: string, location: string, segmentDurationSeconds: number) {
  const [state, setState] = useState<RecorderState>('idle')
  const [elapsedSeconds, setElapsedSeconds] = useState(0)
  const [sessionMeta, setSessionMeta] = useState<RecordingMeta | null>(null)
  const [error, setError] = useState('')

  const mediaStreamRef = useRef<MediaStream | null>(null)
  const audioContextRef = useRef<AudioContext | null>(null)
  const sourceNodeRef = useRef<MediaStreamAudioSourceNode | null>(null)
  const processorNodeRef = useRef<ScriptProcessorNode | null>(null)
  const segmentTimerRef = useRef<number | null>(null)
  const pcmChunksRef = useRef<Float32Array[]>([])
  const sampleRateRef = useRef(48000)
  const flushPromiseRef = useRef<Promise<void>>(Promise.resolve())
  const sessionMetaRef = useRef<RecordingMeta | null>(null)
  const sessionIdRef = useRef('')
  const segmentIndexRef = useRef(0)

  useEffect(() => {
    sessionMetaRef.current = sessionMeta
  }, [sessionMeta])

  // Timer înregistrare
  useEffect(() => {
    if (state !== 'recording') {
      setElapsedSeconds(0)
      return
    }
    const start = Date.now()
    const id = window.setInterval(() => {
      setElapsedSeconds(Math.floor((Date.now() - start) / 1000))
    }, 1000)
    return () => window.clearInterval(id)
  }, [state])

  async function flush(meta: RecordingMeta) {
    const chunks = pcmChunksRef.current
    if (!chunks.length) return

    pcmChunksRef.current = []
    const slug = roomName.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-') || 'room'
    const fileName = `${slug}-${new Date().toISOString().replace(/[:.]/g, '-')}.wav`
    const bytes = encodeWav(chunks, sampleRateRef.current)
    const segmentIndex = segmentIndexRef.current++

    flushPromiseRef.current = flushPromiseRef.current
      .then(async () => { await desktopBridge.queue.enqueue({
        fileName,
        mimeType: 'audio/wav',
        bytes,
        roomName,
        location: meta.location || location,
        meetingDate: meta.meetingDate,
        title: meta.title,
        participants: meta.participants,
        sessionId: sessionIdRef.current,
        segmentIndex,
      }) })
      .catch(err => {
        setError(err instanceof Error ? err.message : 'Nu am putut salva segmentul audio.')
      })

    await flushPromiseRef.current
  }

  async function teardown() {
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
    mediaStreamRef.current?.getTracks().forEach(t => t.stop())
    mediaStreamRef.current = null
    if (audioContextRef.current) {
      const ctx = audioContextRef.current
      audioContextRef.current = null
      await ctx.close().catch(() => undefined)
    }
  }

  async function start(meta: RecordingMeta, deviceId: string) {
    setError('')
    if (typeof AudioContext === 'undefined') {
      setError('Browser engine-ul Electron nu suportă captura audio PCM.')
      return
    }

    try {
      const baseConstraints = {
        channelCount: 1,
        echoCancellation: false,
        noiseSuppression: false,
        autoGainControl: false,
      }

      console.log('[Recorder] start() deviceId:', deviceId || '(none)')
      const allDevices = await navigator.mediaDevices.enumerateDevices()
      const audioInputs = allDevices.filter(d => d.kind === 'audioinput')
      console.log('[Recorder] available audio inputs:', audioInputs.map(d => ({ id: d.deviceId, label: d.label })))

      let stream: MediaStream
      try {
        console.log('[Recorder] getUserMedia with exact deviceId...')
        stream = await navigator.mediaDevices.getUserMedia({
          audio: deviceId ? { ...baseConstraints, deviceId: { exact: deviceId } } : baseConstraints,
        })
        console.log('[Recorder] stream OK:', stream.getAudioTracks().map(t => t.label))
      } catch (err) {
        console.warn('[Recorder] exact deviceId failed:', err instanceof DOMException ? `${err.name}: ${err.message}` : err)
        // Device ID invalid sau inaccesibil — fallback la microfonul implicit
        if (err instanceof DOMException && (err.name === 'NotFoundError' || err.name === 'OverconstrainedError')) {
          console.log('[Recorder] fallback la microfon implicit fără constraints...')
          stream = await navigator.mediaDevices.getUserMedia({ audio: true })
          console.log('[Recorder] fallback stream OK:', stream.getAudioTracks().map(t => t.label))
        } else {
          throw err
        }
      }

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

      sessionIdRef.current = crypto.randomUUID()
      segmentIndexRef.current = 0

      processorNode.onaudioprocess = event => {
        pcmChunksRef.current.push(mixToMono(event.inputBuffer))
      }

      sourceNode.connect(processorNode)
      processorNode.connect(audioContext.destination)

      segmentTimerRef.current = window.setInterval(() => {
        const currentMeta = sessionMetaRef.current ?? meta
        void flush(currentMeta)
      }, segmentDurationSeconds * 1000)

      setSessionMeta(meta)
      setState('recording')
    } catch (err) {
      const msg = err instanceof DOMException
        ? `${err.name}: ${err.message}`
        : err instanceof Error ? err.message : String(err)
      console.error('[Recorder] start failed:', msg)
      setError(msg)
      await teardown()
      setState('idle')
    }
  }

  async function stop() {
    if (state !== 'recording') return
    setState('stopping')
    const currentMeta = sessionMetaRef.current
    await teardown()
    if (currentMeta) {
      await flush(currentMeta)
    }
    setSessionMeta(null)
    setState('idle')
  }

  return {
    state,
    elapsedSeconds,
    sessionMeta,
    error,
    setError,
    start,
    stop,
  }
}
