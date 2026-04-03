// ─── Domain Types ────────────────────────────────────────────────────────────

export interface AuthUser {
  id: string
  username: string
  email: string | null
  full_name: string | null
  is_active: boolean
  is_admin: boolean
  is_participant?: boolean
  role?: 'admin' | 'operator' | 'participant'
  must_change_password: boolean
}

export interface ClientSettings {
  serverUrl: string
  roomName: string
  location: string
  segmentDurationSeconds: number
  setupComplete: boolean
}

export interface SessionMeta {
  title: string
  participants: string
  meetingDate: string
  location: string
  roomName: string
}

export interface SegmentRow {
  id: string
  session_id: string
  segment_index: number
  status: 'pending' | 'uploading' | 'uploaded' | 'complete_pending' | 'completed' | 'error' | 'dead'
  is_final: number
  total_segments: number | null
  audio_path: string
  audio_bytes: number
  title: string
  room_name: string
  location: string
  participants: string
  meeting_date: string
  error_count: number
  last_error: string | null
  created_at: string
  updated_at: string
}

// ─── Push Event Payloads ──────────────────────────────────────────────────────

export interface SessionStatePayload {
  state: 'idle' | 'recording' | 'stopping'
  sessionId?: string
  elapsedSeconds?: number
  meta?: SessionMeta
}

export interface QueueStats {
  total: number
  pending: number
  uploading: number
  completed: number
  errorCount: number
  isUploading: boolean
}

export interface UploadProgressPayload {
  segmentId: string
  segmentIndex: number
  sessionId: string
  status: string
  bytesUploaded?: number
  totalBytes?: number
}

export interface CaptureStartPayload {
  deviceId: string
  sampleRate: number
  segmentMs: number
}

export interface StartSessionPayload {
  title: string
  participants: string
  meetingDate: string
  location: string
  deviceId: string
}

// ─── API Result Types ─────────────────────────────────────────────────────────

export type LoginResult =
  | { ok: true; user: AuthUser; token: string }
  | { ok: false; error: string }

// ─── Bridge Interface ─────────────────────────────────────────────────────────

export interface MeetrecDesktop {
  // Commands
  login(serverUrl: string, username: string, password: string): Promise<LoginResult>
  logout(): Promise<void>
  restoreAuth(): Promise<{ user: AuthUser; token: string } | null>
  getSettings(): Promise<ClientSettings>
  saveSettings(settings: Partial<ClientSettings>): Promise<ClientSettings>
  startSession(payload: StartSessionPayload): Promise<{ sessionId: string } | { error: string }>
  stopSession(): Promise<void>
  listQueue(): Promise<SegmentRow[]>
  deleteSegment(id: string): Promise<void>
  retrySegment(id: string): Promise<void>
  pingServer(serverUrl: string): Promise<{ ok: boolean; latencyMs?: number; error?: string }>
  sendPcmChunk(buffer: ArrayBuffer): void

  // Push subscriptions — each returns a cleanup function
  onSessionStateChanged(cb: (payload: SessionStatePayload) => void): () => void
  onQueueUpdated(cb: (payload: QueueStats) => void): () => void
  onUploadProgress(cb: (payload: UploadProgressPayload) => void): () => void
  onAuthTokenExpired(cb: () => void): () => void
  onAuthUserChanged(cb: (payload: { user: AuthUser } | null) => void): () => void
  onCaptureStart(cb: (payload: CaptureStartPayload) => void): () => void
  onCaptureStop(cb: () => void): () => void
}

// ─── Legacy Types (kept for backward compatibility with old infrastructure) ───

export type QueueItem = {
  id: string
  type?: 'upload' | 'session_complete'
  fileName: string
  mimeType: string
  createdAt: string
  sizeBytes: number
  title: string
  roomName: string
  location: string
  participants: string
  meetingDate: string
  sessionId: string
  segmentIndex: number
  totalSegments?: number
  existingRecordingId?: string
}

export type QueueUploadResult = {
  ok: boolean
  status: number
  body: unknown
}

export type QueueEnqueuePayload = {
  fileName: string
  mimeType: string
  bytes: ArrayBuffer
  roomName: string
  location: string
  meetingDate: string
  title: string
  participants: string
  sessionId: string
  segmentIndex: number
  isFinalSegment?: boolean
}

// ─── Legacy IPC bridge shape (old main process API) ──────────────────────────

interface LegacyMeetrecDesktop {
  settings: {
    load: () => Promise<ClientSettings>
    save: (settings: ClientSettings) => Promise<ClientSettings>
  }
  queue: {
    list: () => Promise<QueueItem[]>
    enqueue: (payload: QueueEnqueuePayload) => Promise<{ id: string }>
    delete: (id: string) => Promise<void>
    upload: (payload: { id: string; serverUrl: string; token: string }) => Promise<QueueUploadResult>
    complete: (payload: { id: string; serverUrl: string; token: string }) => Promise<QueueUploadResult>
  }
}

// ─── Global Declaration ───────────────────────────────────────────────────────

declare global {
  interface Window {
    meetrecDesktop: MeetrecDesktop & LegacyMeetrecDesktop
  }
}

export {}
