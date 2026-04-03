import { contextBridge, ipcRenderer } from 'electron'
import { IPC } from '../shared/ipc-constants'

contextBridge.exposeInMainWorld('meetrecDesktop', {
  // ── Commands (return Promise via invoke) ────────────────────────────────────

  login: (serverUrl: string, username: string, password: string) =>
    ipcRenderer.invoke(IPC.AUTH_LOGIN, { serverUrl, username, password }),

  logout: () => ipcRenderer.invoke(IPC.AUTH_LOGOUT),

  restoreAuth: () => ipcRenderer.invoke(IPC.AUTH_RESTORE),

  getSettings: () => ipcRenderer.invoke(IPC.SETTINGS_GET),

  saveSettings: (settings: unknown) =>
    ipcRenderer.invoke(IPC.SETTINGS_SAVE, settings),

  startSession: (payload: unknown) =>
    ipcRenderer.invoke(IPC.SESSION_START, payload),

  stopSession: () => ipcRenderer.invoke(IPC.SESSION_STOP),

  listQueue: () => ipcRenderer.invoke(IPC.QUEUE_LIST),

  deleteSegment: (id: string) =>
    ipcRenderer.invoke(IPC.QUEUE_DELETE, { id }),

  retrySegment: (id: string) =>
    ipcRenderer.invoke(IPC.QUEUE_RETRY, { id }),

  pingServer: (serverUrl: string) =>
    ipcRenderer.invoke(IPC.DIAG_PING, { serverUrl }),

  // ── PCM Transfer (Transferable, zero-copy) ───────────────────────────────────

  sendPcmChunk: (buffer: ArrayBuffer) =>
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ipcRenderer.postMessage(IPC.CAPTURE_PCM_CHUNK, null, [buffer] as any),

  // ── Push event subscriptions — each returns an unsubscribe function ──────────

  onSessionStateChanged: (cb: (payload: unknown) => void) => {
    const h = (_: Electron.IpcRendererEvent, p: unknown) => cb(p)
    ipcRenderer.on(IPC.SESSION_STATE_CHANGED, h)
    return () => ipcRenderer.off(IPC.SESSION_STATE_CHANGED, h)
  },

  onQueueUpdated: (cb: (payload: unknown) => void) => {
    const h = (_: Electron.IpcRendererEvent, p: unknown) => cb(p)
    ipcRenderer.on(IPC.QUEUE_UPDATED, h)
    return () => ipcRenderer.off(IPC.QUEUE_UPDATED, h)
  },

  onUploadProgress: (cb: (payload: unknown) => void) => {
    const h = (_: Electron.IpcRendererEvent, p: unknown) => cb(p)
    ipcRenderer.on(IPC.UPLOAD_PROGRESS, h)
    return () => ipcRenderer.off(IPC.UPLOAD_PROGRESS, h)
  },

  onAuthTokenExpired: (cb: () => void) => {
    const h = () => cb()
    ipcRenderer.on(IPC.AUTH_TOKEN_EXPIRED, h)
    return () => ipcRenderer.off(IPC.AUTH_TOKEN_EXPIRED, h)
  },

  onAuthUserChanged: (cb: (payload: unknown) => void) => {
    const h = (_: Electron.IpcRendererEvent, p: unknown) => cb(p)
    ipcRenderer.on(IPC.AUTH_USER_CHANGED, h)
    return () => ipcRenderer.off(IPC.AUTH_USER_CHANGED, h)
  },

  onCaptureStart: (cb: (payload: unknown) => void) => {
    const h = (_: Electron.IpcRendererEvent, p: unknown) => cb(p)
    ipcRenderer.on(IPC.CAPTURE_START, h)
    return () => ipcRenderer.off(IPC.CAPTURE_START, h)
  },

  onCaptureStop: (cb: () => void) => {
    const h = () => cb()
    ipcRenderer.on(IPC.CAPTURE_STOP, h)
    return () => ipcRenderer.off(IPC.CAPTURE_STOP, h)
  },
})
