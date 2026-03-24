export type ClientSettings = {
  serverUrl: string
  roomName: string
  location: string
  segmentDurationSeconds: number
  setupComplete: boolean
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
  sessionId: string
  segmentIndex: number
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
