import fs from 'node:fs'
import type { SegmentRow } from '../store/QueueStore'
import type { QueueStore } from '../store/QueueStore'
import type { AuthService } from './AuthService'
import type { SettingsService } from './SettingsService'
import { IPC } from '../../shared/ipc-constants'

const MAX_ERROR_COUNT = 5
const MAX_COMPLETE_RETRIES = 5
const COMPLETE_RETRY_DELAY_MS = 3000
const MAX_CONCURRENT_UPLOADS = 3

export class UploadWorker {
  private running = false
  private nudgeResolve: (() => void) | null = null
  private isUploading = false

  constructor(
    private queueStore: typeof QueueStore,
    private authService: AuthService,
    private settingsService: SettingsService,
    private pushFn: (channel: string, payload?: unknown) => void,
  ) {}

  start(): void {
    if (this.running) return
    this.running = true
    this._drainLoop().catch(err => {
      console.error('[UploadWorker] drain loop crashed:', err)
    })
  }

  nudge(): void {
    if (this.nudgeResolve) {
      const resolve = this.nudgeResolve
      this.nudgeResolve = null
      resolve()
    }
  }

  stop(): void {
    this.running = false
    this.nudge()
  }

  private _setIsUploading(next: boolean): void {
    if (this.isUploading === next) return
    this.isUploading = next
    this._emitQueueUpdated()
  }

  private _emitQueueUpdated(): void {
    this.pushFn(IPC.QUEUE_UPDATED, {
      ...this.queueStore.getQueueStats(),
      isUploading: this.isUploading,
    })
  }

  private _waitForNudge(): Promise<void> {
    this._setIsUploading(false)
    return new Promise(resolve => {
      this.nudgeResolve = resolve
    })
  }

  private async _drainLoop(): Promise<void> {
    while (this.running) {
      try {
        await this._drainBatch()
      } catch (err) {
        console.error('[UploadWorker] unexpected error in drain cycle:', err)
        await this._sleep(2000)
      }
    }
  }

  private async _drainBatch(): Promise<void> {
    // Reia sesiunile care așteptau /complete când app-ul s-a oprit
    const completePending = this.queueStore.getNextCompletePending()
    if (completePending) {
      const token = this.authService.getToken()
      if (!token) {
        this.pushFn(IPC.AUTH_TOKEN_EXPIRED)
        await this._waitForNudge()
        return
      }
      await this._sendComplete(completePending.session_id, token, this.authService.getServerUrl())
      return
    }

    const segments = this.queueStore.getPendingBatch(MAX_CONCURRENT_UPLOADS)
    if (segments.length === 0) {
      await this._waitForNudge()
      return
    }

    const token = this.authService.getToken()
    if (!token) {
      // Revenim la 'pending' înainte să așteptăm re-autentificarea
      for (const seg of segments) {
        this.queueStore.setStatus(seg.id, 'pending')
      }
      this.pushFn(IPC.AUTH_TOKEN_EXPIRED)
      await this._waitForNudge()
      return
    }

    const serverUrl = this.authService.getServerUrl()
    this._setIsUploading(true)
    this._emitQueueUpdated()

    // Uploadăm toate segmentele din batch în paralel
    await Promise.all(segments.map(seg => this._uploadOne(seg, token, serverUrl)))

    // Verificăm dacă vreuna din sesiunile din batch e gata de /complete
    const sessionIds = new Set(segments.map(s => s.session_id))
    for (const sessionId of sessionIds) {
      await this._maybeComplete(sessionId, token, serverUrl)
    }

    this._setIsUploading(false)
    this._emitQueueUpdated()
  }

  private async _uploadOne(
    segment: SegmentRow,
    token: string,
    serverUrl: string,
  ): Promise<void> {
    this.pushFn(IPC.UPLOAD_PROGRESS, {
      segmentId: segment.id,
      segmentIndex: segment.segment_index,
      sessionId: segment.session_id,
      status: 'uploading',
    })

    try {
      const audioBuffer = fs.readFileSync(segment.audio_path)
      const form = new FormData()

      form.append(
        'file',
        new Blob([audioBuffer], { type: 'audio/wav' }),
        `segment_${segment.segment_index}.wav`,
      )
      form.append('session_id', segment.session_id)
      form.append('segment_index', String(segment.segment_index))
      form.append('is_final', segment.is_final ? 'true' : 'false')
      if (segment.total_segments != null) {
        form.append('total_segments', String(segment.total_segments))
      }

      // Timeout dinamic: minim 60s, mai lung pentru segmente mari (~5KB/s minim)
      const timeoutMs = Math.max(60_000, Math.ceil(segment.audio_bytes / 5_000))

      const response = await fetch(`${serverUrl}/api/v1/inbox/upload`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
        body: form,
        signal: AbortSignal.timeout(timeoutMs),
      })

      if (response.status === 401) {
        this.queueStore.setStatus(segment.id, 'pending')
        this.pushFn(IPC.AUTH_TOKEN_EXPIRED)
        return
      }

      if (!response.ok) {
        const errorText = await response.text().catch(() => `HTTP ${response.status}`)
        this.queueStore.setStatus(segment.id, 'error', errorText)
        const updated = this.queueStore.getById(segment.id)
        if (updated && updated.error_count >= MAX_ERROR_COUNT) {
          this.queueStore.setStatus(segment.id, 'dead')
        }
        return
      }

      this.queueStore.setStatus(segment.id, 'uploaded')
      this._deleteWav(segment.audio_path)
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err)
      this.queueStore.setStatus(segment.id, 'error', msg)
      const updated = this.queueStore.getById(segment.id)
      if (updated && updated.error_count >= MAX_ERROR_COUNT) {
        this.queueStore.setStatus(segment.id, 'dead')
      }
    }
  }

  private async _maybeComplete(
    sessionId: string,
    token: string,
    serverUrl: string,
  ): Promise<void> {
    const rows = this.queueStore.getAllBySessionId(sessionId)

    // Trebuie să existe segmentul final înainte de /complete
    const hasFinal = rows.some(r => r.is_final)
    if (!hasFinal) return

    // Toate segmentele trebuie să fie uploadate (niciun pending sau uploading)
    const allDone = rows.every(
      r => r.status === 'uploaded' || r.status === 'completed' || r.status === 'complete_pending',
    )
    if (!allDone) return

    const hasFailed = rows.some(r => r.status === 'dead' || r.status === 'error')
    if (hasFailed) {
      console.warn(`[UploadWorker] Session ${sessionId} has failed segments — skipping /complete`)
      const finalRow = rows.find(r => r.is_final)
      if (finalRow) this.queueStore.setStatus(finalRow.id, 'completed')
      return
    }

    // Marcăm segmentul final ca complete_pending și trimitem /complete
    const finalRow = rows.find(r => r.is_final && r.status === 'uploaded')
    if (!finalRow) return  // deja în complete_pending sau completed

    this.queueStore.setStatus(finalRow.id, 'complete_pending')
    await this._sendComplete(sessionId, token, serverUrl)
  }

  private async _sendComplete(
    sessionId: string,
    token: string,
    serverUrl: string,
  ): Promise<void> {
    const rows = this.queueStore.getAllBySessionId(sessionId)
    const totalSegments =
      rows.find(r => r.total_segments != null)?.total_segments ?? rows.length

    for (let attempt = 0; attempt < MAX_COMPLETE_RETRIES; attempt++) {
      try {
        const response = await fetch(
          `${serverUrl}/api/v1/inbox/session/${sessionId}/complete`,
          {
            method: 'POST',
            headers: {
              Authorization: `Bearer ${token}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({ total_segments: totalSegments }),
          },
        )

        if (response.ok || response.status === 201 || response.status === 409) {
          this._finalizeSession(sessionId)
          return
        }

        const body = await response.text().catch(() => '')
        console.error(`[UploadWorker] /complete failed (${response.status}): ${body}`)

        if (attempt < MAX_COMPLETE_RETRIES - 1) {
          await this._sleep(COMPLETE_RETRY_DELAY_MS)
        }
      } catch (err) {
        console.error('[UploadWorker] /complete network error:', err)
        if (attempt < MAX_COMPLETE_RETRIES - 1) {
          await this._sleep(COMPLETE_RETRY_DELAY_MS)
        }
      }
    }

    console.warn('[UploadWorker] /complete max retries reached for session:', sessionId)
    this._finalizeSession(sessionId)
  }

  private _finalizeSession(sessionId: string): void {
    const rows = this.queueStore.getAllBySessionId(sessionId)
    for (const row of rows) {
      this.queueStore.setStatus(row.id, 'completed')
    }
    this.queueStore.deleteSessionWavs(sessionId)
    this._emitQueueUpdated()
  }

  private _deleteWav(audioPath: string): void {
    if (!audioPath) return
    try {
      fs.unlinkSync(audioPath)
    } catch {
      // Deja șters — nu e eroare
    }
  }

  private _sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms))
  }
}
