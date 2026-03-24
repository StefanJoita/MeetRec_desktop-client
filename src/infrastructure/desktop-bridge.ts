import type { ClientSettings, QueueEnqueuePayload, QueueItem, QueueUploadResult } from '@/types/electron'

export const desktopBridge = {
  settings: {
    load(): Promise<ClientSettings> {
      return window.meetrecDesktop.settings.load()
    },
    save(settings: ClientSettings): Promise<ClientSettings> {
      return window.meetrecDesktop.settings.save(settings)
    },
  },

  queue: {
    list(): Promise<QueueItem[]> {
      return window.meetrecDesktop.queue.list()
    },
    enqueue(payload: QueueEnqueuePayload): Promise<{ id: string }> {
      return window.meetrecDesktop.queue.enqueue(payload)
    },
    delete(id: string): Promise<void> {
      return window.meetrecDesktop.queue.delete(id)
    },
    upload(payload: { id: string; serverUrl: string; token: string }): Promise<QueueUploadResult> {
      return window.meetrecDesktop.queue.upload(payload)
    },
    complete(payload: { id: string; serverUrl: string; token: string }): Promise<QueueUploadResult> {
      return window.meetrecDesktop.queue.complete(payload)
    },
  },
}
