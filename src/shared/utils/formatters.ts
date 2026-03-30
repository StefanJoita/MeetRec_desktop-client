export function formatDuration(seconds: number): string {
  const h = Math.floor(seconds / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  const s = seconds % 60
  const hh = h > 0 ? `${String(h).padStart(2, '0')}:` : ''
  return `${hh}${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
}

export function formatBytes(value: number): string {
  if (value < 1024) return `${value} B`
  if (value < 1024 * 1024) return `${(value / 1024).toFixed(1)} KB`
  return `${(value / (1024 * 1024)).toFixed(1)} MB`
}

export function formatLocalDate(isoDate: string): string {
  return new Date(isoDate).toLocaleString('ro-RO')
}
