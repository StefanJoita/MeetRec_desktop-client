import { useEffect, useRef } from 'react'
import type { CaptureStartPayload } from '@/types/electron'

const PCM_PROCESSOR_CODE = `
class PcmProcessor extends AudioWorkletProcessor {
  process(inputs) {
    const input = inputs[0]
    if (!input || !input[0]) return true
    const ch = input.length
    const len = input[0].length
    const mono = new Float32Array(len)
    for (let i = 0; i < len; i++) {
      let s = 0
      for (let c = 0; c < ch; c++) s += input[c][i]
      mono[i] = s / ch
    }
    this.port.postMessage(mono.buffer, [mono.buffer])
    return true
  }
}
registerProcessor('pcm-processor', PcmProcessor)
`

export function useCapture(): void {
  const audioCtxRef = useRef<AudioContext | null>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const workletNodeRef = useRef<AudioWorkletNode | null>(null)

  function stopCapture() {
    if (workletNodeRef.current) {
      workletNodeRef.current.disconnect()
      workletNodeRef.current = null
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(t => t.stop())
      streamRef.current = null
    }
    if (audioCtxRef.current) {
      void audioCtxRef.current.close()
      audioCtxRef.current = null
    }
  }

  async function startCapture(payload: CaptureStartPayload): Promise<void> {
    // Clean up any previous capture
    stopCapture()

    const { deviceId, sampleRate } = payload

    const stream = await navigator.mediaDevices.getUserMedia({
      audio: {
        deviceId: { exact: deviceId },
        sampleRate,
        channelCount: 1,
        echoCancellation: false,
        noiseSuppression: false,
      },
    })
    streamRef.current = stream

    const audioCtx = new AudioContext({ sampleRate })
    audioCtxRef.current = audioCtx

    // Create blob URL for the worklet processor code
    const blob = new Blob([PCM_PROCESSOR_CODE], { type: 'application/javascript' })
    const blobUrl = URL.createObjectURL(blob)

    try {
      await audioCtx.audioWorklet.addModule(blobUrl)
    } finally {
      URL.revokeObjectURL(blobUrl)
    }

    const workletNode = new AudioWorkletNode(audioCtx, 'pcm-processor')
    workletNodeRef.current = workletNode

    workletNode.port.onmessage = (e: MessageEvent<ArrayBuffer>) => {
      window.meetrecDesktop.sendPcmChunk(e.data)
    }

    const micSource = audioCtx.createMediaStreamSource(stream)
    // Connect mic → worklet (fire-and-forget, not connected to destination)
    micSource.connect(workletNode)
  }

  useEffect(() => {
    const cleanupStart = window.meetrecDesktop.onCaptureStart(payload => {
      void startCapture(payload)
    })

    const cleanupStop = window.meetrecDesktop.onCaptureStop(() => {
      stopCapture()
    })

    return () => {
      cleanupStart()
      cleanupStop()
      stopCapture()
    }
  }, [])
}
