import fs from 'node:fs'
import path from 'node:path'
import { randomUUID } from 'node:crypto'
import { encodeWav } from '../audio/wav-encoder'

export interface SessionMeta {
  title: string
  participants: string
  meetingDate: string
  location: string
  roomName: string
}

export type OnFlushCallback = (opts: {
  audioPath: string
  audioBytes: number
  segmentIndex: number
  isFinal: boolean
}) => void

interface ActiveSession {
  sessionId: string
  meta: SessionMeta
  sampleRate: number
  segmentMs: number
  segmentsDir: string
  onFlush: OnFlushCallback
}

export class PcmAccumulator {
  private session: ActiveSession | null = null
  private chunks: Float32Array[] = []
  private segmentIndex = 0
  private timer: ReturnType<typeof setTimeout> | null = null

  start(opts: {
    sessionId: string
    meta: SessionMeta
    sampleRate: number
    segmentMs: number
    segmentsDir: string
    onFlush: OnFlushCallback
  }): void {
    this.session = {
      sessionId: opts.sessionId,
      meta: opts.meta,
      sampleRate: opts.sampleRate,
      segmentMs: opts.segmentMs,
      segmentsDir: opts.segmentsDir,
      onFlush: opts.onFlush,
    }
    this.chunks = []
    this.segmentIndex = 0
    this._scheduleTimer()
  }

  addChunk(buffer: ArrayBuffer): void {
    if (!this.session) return
    this.chunks.push(new Float32Array(buffer))
  }

  flush(isFinal: boolean): void {
    if (!this.session) return

    this._clearTimer()

    if (this.chunks.length === 0) {
      if (!isFinal) {
        // Nothing to write; just reschedule
        this._scheduleTimer()
      }
      // For isFinal with no audio, signal caller with empty bytes so they can
      // handle the "session completed with no final audio" case
      if (isFinal) {
        this.session.onFlush({
          audioPath: '',
          audioBytes: 0,
          segmentIndex: this.segmentIndex,
          isFinal: true,
        })
      }
      return
    }

    const { sampleRate, segmentsDir, onFlush } = this.session
    const wavBuffer = encodeWav(this.chunks, sampleRate)
    const fileName = `${randomUUID()}.wav`
    const audioPath = path.join(segmentsDir, fileName)

    fs.writeFileSync(audioPath, wavBuffer)

    const segmentIndex = this.segmentIndex
    this.segmentIndex++
    this.chunks = []

    onFlush({
      audioPath,
      audioBytes: wavBuffer.length,
      segmentIndex,
      isFinal,
    })

    if (!isFinal) {
      this._scheduleTimer()
    }
  }

  stop(): void {
    this.flush(true)
    this._clearTimer()
    this.session = null
    this.chunks = []
    this.segmentIndex = 0
  }

  reset(): void {
    this._clearTimer()
    this.session = null
    this.chunks = []
    this.segmentIndex = 0
  }

  private _scheduleTimer(): void {
    if (!this.session) return
    const ms = this.session.segmentMs
    this.timer = setTimeout(() => {
      this.flush(false)
    }, ms)
  }

  private _clearTimer(): void {
    if (this.timer !== null) {
      clearTimeout(this.timer)
      this.timer = null
    }
  }
}
