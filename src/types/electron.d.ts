export type ClientSettings = {
  serverUrl: string
  roomName: string
  location: string
  segmentDurationSeconds: number
}

export type SessionMeetingMeta = {
  title: string
  participants: string // comma-separated names
  meetingDate: string  // YYYY-MM-DD
  location: string
}

export type QueueItem = {
  id: string
  fileName: string
  mimeType: string
  createdAt: string
  sizeBytes: number
  title: string
  roomName: string
  location: string
  participants: string
  meetingDate: string
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
}

declare global {
  interface Window {
    meetrecDesktop: {
      settings: {
        load: () => Promise<ClientSettings>
        save: (settings: ClientSettings) => Promise<ClientSettings>
      }
      queue: {
        list: () => Promise<QueueItem[]>
        enqueue: (payload: QueueEnqueuePayload) => Promise<{ id: string }>
        delete: (id: string) => Promise<void>
        upload: (payload: { id: string; serverUrl: string; token: string }) => Promise<QueueUploadResult>
      }
    }
  }
}

export {}