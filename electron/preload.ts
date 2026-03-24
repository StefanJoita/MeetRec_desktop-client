import { contextBridge, ipcRenderer } from 'electron'

contextBridge.exposeInMainWorld('meetrecDesktop', {
  settings: {
    load: () => ipcRenderer.invoke('settings:load'),
    save: (settings: unknown) => ipcRenderer.invoke('settings:save', settings),
  },
  queue: {
    list: () => ipcRenderer.invoke('queue:list'),
    enqueue: (payload: unknown) => ipcRenderer.invoke('queue:enqueue', payload),
    delete: (id: string) => ipcRenderer.invoke('queue:delete', id),
    upload: (payload: unknown) => ipcRenderer.invoke('queue:upload', payload),
    complete: (payload: unknown) => ipcRenderer.invoke('queue:complete', payload),
  },
})