import fs from 'node:fs'
import { getDb } from '../store/Database'
import type { PcmAccumulator } from '../capture/PcmAccumulator'
import type { QueueStore } from '../store/QueueStore'
import type { SettingsService } from './SettingsService'
import type { AuthService } from './AuthService'
import { IPC } from '../../shared/ipc-constants'

export type SessionState = 'idle' | 'recording' | 'stopping'

interface SessionMeta {
  title: string
  participants: string
  meetingDate: string
  location: string
  roomName: string
}

export class SessionController {
  private state: SessionState = 'idle'
  private currentSessionId: string | null = null
  private elapsedTimer: ReturnType<typeof setInterval> | null = null
  private elapsedSeconds = 0
  private currentMeta: SessionMeta | null = null

  constructor(
    private accumulator: PcmAccumulator,
    private queueStore: typeof QueueStore,
    private pushFn: (channel: string, payload?: unknown) => void,
    private settingsService: SettingsService,
    private authService: AuthService,
    private nudgeUploadWorker: () => void,
  ) {}

  getState(): SessionState {
    return this.state
  }

  getCurrentSessionId(): string | null {
    return this.currentSessionId
  }

  async start(opts: {
    title: string
    participants: string
    meetingDate: string
    location: string
    deviceId: string
    segmentsDir: string
  }): Promise<{ sessionId: string } | { error: string }> {
    if (this.state !== 'idle') {
      return { error: `Cannot start — current state is '${this.state}'` }
    }

    const settings = this.settingsService.get()

    // Pre-înregistrează sesiunea pe server — obținem session_id și Recording creat în DB.
    // Eliminăm astfel retry-urile pentru 404 la /complete și metadata duplicată per segment.
    const sessionResult = await this.authService.createSession({
      title: opts.title,
      participants: opts.participants,
      meetingDate: opts.meetingDate,
      location: opts.location,
      roomName: settings.roomName,
    })

    if (!sessionResult.ok) {
      return { error: `Nu s-a putut înregistra sesiunea pe server: ${sessionResult.error}` }
    }

    const sessionId = sessionResult.sessionId
    this.currentSessionId = sessionId

    const meta: SessionMeta = {
      title: opts.title,
      participants: opts.participants,
      meetingDate: opts.meetingDate,
      location: opts.location,
      roomName: settings.roomName,
    }
    this.currentMeta = meta

    // Ensure segments directory exists
    if (!fs.existsSync(opts.segmentsDir)) {
      fs.mkdirSync(opts.segmentsDir, { recursive: true })
    }

    const segmentMs = settings.segmentDurationSeconds * 1000
    const sampleRate = 48000

    // Track total enqueued segments for backfilling total_segments
    let enqueuedCount = 0

    this.accumulator.start({
      sessionId,
      meta,
      sampleRate,
      segmentMs,
      segmentsDir: opts.segmentsDir,
      onFlush: ({ audioPath, audioBytes, segmentIndex, isFinal }) => {
        if (audioBytes === 0) {
          // Empty final segment — session complete with no trailing audio
          if (isFinal && enqueuedCount > 0) {
            this._backfillTotalSegments(sessionId, enqueuedCount)
          }
          this.pushFn(IPC.QUEUE_UPDATED, {
            ...this.queueStore.getQueueStats(),
            isUploading: false,
          })
          return
        }

        const totalSegments = isFinal ? segmentIndex + 1 : undefined

        const row = this.queueStore.enqueue({
          sessionId,
          segmentIndex,
          isFinal,
          totalSegments,
          audioPath,
          audioBytes,
          title: meta.title,
          roomName: meta.roomName,
          location: meta.location,
          participants: meta.participants,
          meetingDate: meta.meetingDate,
        })

        enqueuedCount++

        if (isFinal) {
          const total = totalSegments ?? enqueuedCount
          // Ensure all sibling segments know total_segments
          this._backfillTotalSegments(sessionId, total)
          // Ensure the final row is properly flagged
          this._markFinalSegment(row.id, total)
        }

        this.pushFn(IPC.QUEUE_UPDATED, {
          ...this.queueStore.getQueueStats(),
          isUploading: false,
        })

        this.nudgeUploadWorker()
      },
    })

    this.state = 'recording'
    this.elapsedSeconds = 0

    this.pushFn(IPC.SESSION_STATE_CHANGED, {
      state: 'recording',
      sessionId,
      elapsedSeconds: 0,
      meta,
    })

    this.pushFn(IPC.CAPTURE_START, {
      deviceId: opts.deviceId,
      sampleRate,
      segmentMs,
    })

    // Elapsed timer — fires every second
    this.elapsedTimer = setInterval(() => {
      this.elapsedSeconds++
      this.pushFn(IPC.SESSION_STATE_CHANGED, {
        state: 'recording',
        sessionId: this.currentSessionId,
        elapsedSeconds: this.elapsedSeconds,
        meta: this.currentMeta,
      })
    }, 1000)

    return { sessionId }
  }

  stop(): void {
    if (this.state !== 'recording') return

    this.state = 'stopping'

    this.pushFn(IPC.CAPTURE_STOP)
    this._stopElapsedTimer()

    // Notifică renderer-ul că sesiunea e în curs de oprire (înainte de flush)
    this.pushFn(IPC.SESSION_STATE_CHANGED, { state: 'stopping' })

    // accumulator.stop() calls flush(true) internally
    this.accumulator.stop()

    this.state = 'idle'
    this.currentSessionId = null
    this.currentMeta = null
    this.elapsedSeconds = 0

    this.pushFn(IPC.SESSION_STATE_CHANGED, { state: 'idle' })
  }

  addPcmChunk(buffer: ArrayBuffer): void {
    if (this.state === 'recording') {
      this.accumulator.addChunk(buffer)
    }
  }

  private _stopElapsedTimer(): void {
    if (this.elapsedTimer !== null) {
      clearInterval(this.elapsedTimer)
      this.elapsedTimer = null
    }
  }

  private _backfillTotalSegments(sessionId: string, totalSegments: number): void {
    try {
      const db = getDb()
      const ts = new Date().toISOString()
      db.prepare(`
        UPDATE segments
        SET total_segments = ?, updated_at = ?
        WHERE session_id = ? AND total_segments IS NULL
      `).run(totalSegments, ts, sessionId)
    } catch (err) {
      console.error('[SessionController] _backfillTotalSegments error:', err)
    }
  }

  private _markFinalSegment(id: string, totalSegments: number): void {
    try {
      const db = getDb()
      const ts = new Date().toISOString()
      db.prepare(`
        UPDATE segments
        SET is_final = 1, total_segments = ?, updated_at = ?
        WHERE id = ?
      `).run(totalSegments, ts, id)
    } catch (err) {
      console.error('[SessionController] _markFinalSegment error:', err)
    }
  }
}
