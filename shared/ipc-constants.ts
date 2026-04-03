export const IPC = {
  // Commands (Renderer → Main, ipcRenderer.invoke)
  AUTH_LOGIN: 'auth:login',
  AUTH_LOGOUT: 'auth:logout',
  AUTH_RESTORE: 'auth:restore',
  SETTINGS_GET: 'settings:get',
  SETTINGS_SAVE: 'settings:save',
  SESSION_START: 'session:start',
  SESSION_STOP: 'session:stop',
  QUEUE_LIST: 'queue:list',
  QUEUE_DELETE: 'queue:delete',
  QUEUE_RETRY: 'queue:retry',
  DIAG_PING: 'diag:ping-server',
  CAPTURE_PCM_CHUNK: 'capture:pcm-chunk',

  // Push Events (Main → Renderer, webContents.send)
  SESSION_STATE_CHANGED: 'session:state-changed',
  QUEUE_UPDATED: 'queue:updated',
  UPLOAD_PROGRESS: 'upload:progress',
  AUTH_TOKEN_EXPIRED: 'auth:token-expired',
  AUTH_USER_CHANGED: 'auth:user-changed',
  CAPTURE_START: 'capture:start',
  CAPTURE_STOP: 'capture:stop',
} as const
