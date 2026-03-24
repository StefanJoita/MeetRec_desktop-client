export function normalizeServerUrl(rawUrl: string): string {
  const trimmed = rawUrl.trim().replace(/\/$/, '')
  if (trimmed.endsWith('/api/v1')) {
    return trimmed.slice(0, -7)
  }
  return trimmed
}

export function apiBase(serverUrl: string): string {
  return `${normalizeServerUrl(serverUrl)}/api/v1`
}
