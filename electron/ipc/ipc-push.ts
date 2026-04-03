import { BrowserWindow } from 'electron'

export function pushToRenderer(channel: string, payload?: unknown): void {
  const wins = BrowserWindow.getAllWindows()
  if (!wins.length) return
  const win = wins[0]
  if (win.isDestroyed()) return
  win.webContents.send(channel, payload)
}
