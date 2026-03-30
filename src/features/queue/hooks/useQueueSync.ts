import { useEffect, useRef, useState } from 'react'
import { desktopBridge } from '@/infrastructure/desktop-bridge'
import type { QueueItem } from '@/types/electron'

export function useQueueSync(token: string | null, serverUrl: string, onUnauthorized?: () => void) {
  const [items, setItems] = useState<QueueItem[]>([])
  const [draining, setDraining] = useState(false)
  const [error, setError] = useState('')
  const drainingRef = useRef(false)
  // Ref actualizat la fiecare render — efectul nu trebuie să se remonteze când
  // onUnauthorized se schimbă, dar apelul trebuie să folosească versiunea curentă.
  const onUnauthorizedRef = useRef(onUnauthorized)
  useEffect(() => { onUnauthorizedRef.current = onUnauthorized })

  async function refreshQueue() {
    const list = await desktopBridge.queue.list()
    setItems(list)
    return list
  }

  async function deleteItem(id: string) {
    await desktopBridge.queue.delete(id)
    await refreshQueue()
  }

  useEffect(() => {
    if (!token || !serverUrl) return
    let cancelled = false

    const tick = async () => {
      if (cancelled || drainingRef.current) return
      drainingRef.current = true
      setDraining(true)
      try {
        while (!cancelled) {
          const list = await desktopBridge.queue.list()
          setItems(list)
          if (!list.length) break

          const item = list[0]
          const result = item.type === 'session_complete'
            ? await desktopBridge.queue.complete({ id: item.id, serverUrl, token })
            : await desktopBridge.queue.upload({ id: item.id, serverUrl, token })

          if (!result.ok) {
            const detail = result.body && typeof result.body === 'object'
              ? JSON.stringify(result.body)
              : result.body ? String(result.body) : ''
            const action = item.type === 'session_complete' ? 'Complete sesiune eșuat' : 'Upload eșuat'
            console.error(`[QueueSync] ${action} HTTP ${result.status}:`, detail)
            if (result.status === 401) {
              setError(`401 Unauthorized${detail ? ` — ${detail}` : ''}. Verifică că serverul rulează.`)
              onUnauthorizedRef.current?.()
            } else {
              setError(`${action} (HTTP ${result.status}${detail ? `: ${detail}` : ''}). Se retrimite automat.`)
            }
            break
          }

          await desktopBridge.queue.delete(item.id)
          setError('')
        }
      } finally {
        drainingRef.current = false
        setDraining(false)
        if (!cancelled) {
          try {
            const list = await desktopBridge.queue.list()
            setItems(list)
          } catch {
            // IPC failure la refresh final — UI păstrează items anterioare
          }
        }
      }
    }

    void tick()
    const timer = window.setInterval(() => void tick(), 5000)
    return () => {
      cancelled = true
      window.clearInterval(timer)
    }
  }, [token, serverUrl])

  const totalBytes = items.reduce((sum, item) => item.type !== 'session_complete' ? sum + item.sizeBytes : sum, 0)

  return { items, draining, error, totalBytes, refreshQueue, deleteItem }
}
