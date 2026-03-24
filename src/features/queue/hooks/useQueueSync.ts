import { useEffect, useRef, useState } from 'react'
import { desktopBridge } from '@/infrastructure/desktop-bridge'
import type { QueueItem } from '@/types/electron'

export function useQueueSync(token: string | null, serverUrl: string, onUnauthorized?: () => void) {
  const [items, setItems] = useState<QueueItem[]>([])
  const [draining, setDraining] = useState(false)
  const [error, setError] = useState('')
  const drainingRef = useRef(false)

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

          const result = await desktopBridge.queue.upload({
            id: list[0].id,
            serverUrl,
            token,
          })

          if (!result.ok) {
            if (result.status === 401) {
              setError('Sesiunea a expirat. Autentifică-te din nou.')
              onUnauthorized?.()
            } else {
              setError(`Upload eșuat (HTTP ${result.status}). Se retrimite automat.`)
            }
            break
          }

          await desktopBridge.queue.delete(list[0].id)
          setError('')
        }
      } finally {
        drainingRef.current = false
        setDraining(false)
        if (!cancelled) {
          const list = await desktopBridge.queue.list()
          setItems(list)
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

  const totalBytes = items.reduce((sum, item) => sum + item.sizeBytes, 0)

  return { items, draining, error, totalBytes, refreshQueue, deleteItem }
}
