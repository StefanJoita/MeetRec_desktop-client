import { ipcMain } from 'electron'
import fs from 'node:fs'
import type { AuthService } from '../services/AuthService'
import type { SettingsService } from '../services/SettingsService'
import type { SessionController } from '../services/SessionController'
import type { UploadWorker } from '../services/UploadWorker'
import type { QueueStore } from '../store/QueueStore'
import { IPC } from '../../shared/ipc-constants'

export function registerIpcHandlers(opts: {
  authService: AuthService
  settingsService: SettingsService
  sessionController: SessionController
  uploadWorker: UploadWorker
  queueStore: typeof QueueStore
  segmentsDir: string
}): void {
  const {
    authService,
    settingsService,
    sessionController,
    uploadWorker,
    queueStore,
    segmentsDir,
  } = opts

  // ── Auth ────────────────────────────────────────────────────────────────────

  ipcMain.handle(
    IPC.AUTH_LOGIN,
    async (
      _event,
      payload: { serverUrl: string; username: string; password: string },
    ) => {
      const result = await authService.login(
        payload.serverUrl,
        payload.username,
        payload.password,
      )
      if (result.ok) {
        uploadWorker.nudge()
        // Push auth:user-changed is done via pushFn — but ipc-handlers doesn't
        // hold a reference to pushFn directly, so we import it inline.
        const { pushToRenderer } = await import('./ipc-push')
        pushToRenderer(IPC.AUTH_USER_CHANGED, { user: result.user })
      }
      return result
    },
  )

  ipcMain.handle(IPC.AUTH_LOGOUT, async () => {
    authService.logout()
    const { pushToRenderer } = await import('./ipc-push')
    pushToRenderer(IPC.AUTH_USER_CHANGED, null)
    return { ok: true }
  })

  ipcMain.handle(IPC.AUTH_RESTORE, async () => {
    return authService.restoreSession()
  })

  // ── Settings ─────────────────────────────────────────────────────────────────

  ipcMain.handle(IPC.SETTINGS_GET, () => {
    return settingsService.get()
  })

  ipcMain.handle(IPC.SETTINGS_SAVE, (_event, payload: unknown) => {
    return settingsService.save(payload as Parameters<SettingsService['save']>[0])
  })

  // ── Session ───────────────────────────────────────────────────────────────────

  ipcMain.handle(IPC.SESSION_START, async (_event, payload: unknown) => {
    const token = authService.getToken()
    if (!token) {
      return { error: 'Not authenticated' }
    }

    const p = payload as {
      title: string
      participants: string
      meetingDate: string
      location: string
      deviceId: string
    }

    return sessionController.start({
      title: p.title,
      participants: p.participants,
      meetingDate: p.meetingDate,
      location: p.location,
      deviceId: p.deviceId,
      segmentsDir,
    })
  })

  ipcMain.handle(IPC.SESSION_STOP, () => {
    sessionController.stop()
    return { ok: true }
  })

  // ── Queue ─────────────────────────────────────────────────────────────────────

  ipcMain.handle(IPC.QUEUE_LIST, () => {
    return queueStore.list()
  })

  ipcMain.handle(IPC.QUEUE_DELETE, async (_event, payload: { id: string }) => {
    const segment = queueStore.getById(payload.id)
    if (segment?.audio_path) {
      try {
        fs.unlinkSync(segment.audio_path)
      } catch {
        // Already gone — not an error
      }
    }
    queueStore.delete(payload.id)

    const { pushToRenderer } = await import('./ipc-push')
    pushToRenderer(IPC.QUEUE_UPDATED, { ...queueStore.getQueueStats(), isUploading: false })
    return { ok: true }
  })

  ipcMain.handle(IPC.QUEUE_RETRY, async (_event, payload: { id: string }) => {
    const segment = queueStore.getById(payload.id)
    if (!segment) return { ok: false, error: 'Segment not found' }

    if (segment.status === 'error' || segment.status === 'dead') {
      // Reset to pending so the upload worker picks it up
      const db = (await import('../store/Database')).getDb()
      const ts = new Date().toISOString()
      db.prepare(`
        UPDATE segments
        SET status = 'pending', error_count = 0, last_error = NULL, updated_at = ?
        WHERE id = ?
      `).run(ts, payload.id)

      uploadWorker.nudge()

      const { pushToRenderer } = await import('./ipc-push')
      pushToRenderer(IPC.QUEUE_UPDATED, { ...queueStore.getQueueStats(), isUploading: false })
    }

    return { ok: true }
  })

  // ── Diagnostics ───────────────────────────────────────────────────────────────

  ipcMain.handle(IPC.DIAG_PING, async (_event, payload: { serverUrl: string }) => {
    const base = payload.serverUrl.trim().replace(/\/$/, '').replace(/\/api\/v1$/, '')
    const start = Date.now()

    try {
      const response = await fetch(`${base}/api/v1/auth/me`, {
        headers: { Authorization: 'Bearer probe' },
        signal: AbortSignal.timeout(5000),
      })

      const latencyMs = Date.now() - start
      // 401/403 means the server is up (we just don't have a valid token for this probe)
      const reachable = response.status === 401 || response.status === 403 || response.ok
      return { ok: reachable, latencyMs, error: reachable ? null : `HTTP ${response.status}` }
    } catch (err: unknown) {
      const latencyMs = Date.now() - start
      return {
        ok: false,
        latencyMs,
        error: err instanceof Error ? err.message : String(err),
      }
    }
  })

  // ── PCM Chunk (fire-and-forget, zero-copy Transferable) ──────────────────────

  ipcMain.on(IPC.CAPTURE_PCM_CHUNK, (_event, buffer: ArrayBuffer) => {
    sessionController.addPcmChunk(buffer)
  })
}
