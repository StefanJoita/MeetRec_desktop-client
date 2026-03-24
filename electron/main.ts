import { app, BrowserWindow, ipcMain } from 'electron'
import path from 'node:path'
import { mkdir, readFile, readdir, rm, stat, writeFile } from 'node:fs/promises'
import { randomUUID } from 'node:crypto'

type ClientSettings = {
  serverUrl: string
  roomName: string
  location: string
  segmentDurationSeconds: number
  setupComplete: boolean
}

type StoredSegmentMeta = {
  id: string
  fileName: string
  mimeType: string
  createdAt: string
  roomName: string
  location: string
  meetingDate: string
  title: string
  participants: string
  sessionId: string
  segmentIndex: number
  totalSegments?: number
  existingRecordingId?: string
}

type SessionCompleteJob = {
  id: string
  type: 'session_complete'
  sessionId: string
  totalSegments: number
  createdAt: string
}

type QueueItem = {
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
  totalSegments?: number
  existingRecordingId?: string
  type?: 'upload' | 'session_complete'
}

const defaultSettings: ClientSettings = {
  serverUrl: 'http://localhost:8080',
  roomName: 'Sala de sedinte',
  location: 'Sediu principal',
  segmentDurationSeconds: 300,
  setupComplete: false,
}

let mainWindow: BrowserWindow | null = null

function getSettingsPath() {
  return path.join(app.getPath('userData'), 'client-settings.json')
}

function getQueueDir() {
  return path.join(app.getPath('userData'), 'upload-queue')
}

function normalizeServerUrl(rawUrl: string) {
  const trimmed = rawUrl.trim().replace(/\/$/, '')
  if (trimmed.endsWith('/api/v1')) {
    return trimmed.slice(0, -7)
  }
  return trimmed
}

async function ensureAppStorage() {
  await mkdir(getQueueDir(), { recursive: true })
}

async function loadSettings(): Promise<ClientSettings> {
  try {
    const file = await readFile(getSettingsPath(), 'utf-8')
    return { ...defaultSettings, ...(JSON.parse(file) as Partial<ClientSettings>) }
  } catch {
    return defaultSettings
  }
}

async function saveSettings(settings: ClientSettings) {
  await writeFile(getSettingsPath(), JSON.stringify(settings, null, 2), 'utf-8')
  return settings
}

async function listQueueItems(): Promise<QueueItem[]> {
  await ensureAppStorage()
  const files = await readdir(getQueueDir())

  const uploadFiles = files.filter(f => f.endsWith('.json') && !f.startsWith('scomplete-'))
  const completeFiles = files.filter(f => f.startsWith('scomplete-') && f.endsWith('.json'))

  const uploadItems = await Promise.all(
    uploadFiles.map(async file => {
      const metaPath = path.join(getQueueDir(), file)
      const meta = JSON.parse(await readFile(metaPath, 'utf-8')) as StoredSegmentMeta
      const audioPath = path.join(getQueueDir(), `${meta.id}.audio`)
      try {
        const info = await stat(audioPath)
        return {
          id: meta.id,
          fileName: meta.fileName,
          mimeType: meta.mimeType,
          createdAt: meta.createdAt,
          sizeBytes: info.size,
          title: meta.title,
          roomName: meta.roomName,
          location: meta.location,
          participants: meta.participants ?? '',
          meetingDate: meta.meetingDate,
          sessionId: meta.sessionId,
          segmentIndex: meta.segmentIndex,
          totalSegments: meta.totalSegments,
          existingRecordingId: meta.existingRecordingId,
        } as QueueItem
      } catch {
        return null
      }
    }),
  )

  const completeItems = await Promise.all(
    completeFiles.map(async file => {
      const job = JSON.parse(await readFile(path.join(getQueueDir(), file), 'utf-8')) as SessionCompleteJob
      return {
        id: job.id,
        type: 'session_complete' as const,
        sessionId: job.sessionId,
        createdAt: job.createdAt,
        // câmpuri obligatorii în tip, neutilizate pentru complete jobs
        fileName: '', mimeType: '', sizeBytes: 0, title: '', roomName: '',
        location: '', participants: '', meetingDate: '', segmentIndex: 0,
      } as QueueItem
    }),
  )

  return [...uploadItems.filter((item): item is QueueItem => item !== null), ...completeItems]
    .sort((left, right) => left.createdAt.localeCompare(right.createdAt))
}

async function enqueueSegment(payload: {
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
}) {
  await ensureAppStorage()
  const id = `${Date.now()}-${randomUUID()}`
  const totalSegments = payload.isFinalSegment ? payload.segmentIndex + 1 : undefined
  const meta: StoredSegmentMeta = {
    id,
    fileName: payload.fileName,
    mimeType: payload.mimeType,
    createdAt: new Date().toISOString(),
    roomName: payload.roomName,
    location: payload.location,
    meetingDate: payload.meetingDate,
    title: payload.title,
    participants: payload.participants,
    sessionId: payload.sessionId,
    segmentIndex: payload.segmentIndex,
    totalSegments,
  }

  await writeFile(path.join(getQueueDir(), `${id}.audio`), Buffer.from(payload.bytes))
  await writeFile(path.join(getQueueDir(), `${id}.json`), JSON.stringify(meta, null, 2), 'utf-8')

  if (payload.isFinalSegment && totalSegments !== undefined) {
    const files = await readdir(getQueueDir())
    for (const file of files.filter(f => f.endsWith('.json') && !f.startsWith('scomplete-'))) {
      const p = path.join(getQueueDir(), file)
      const m = JSON.parse(await readFile(p, 'utf-8')) as StoredSegmentMeta
      if (m.sessionId === payload.sessionId && m.id !== id && m.totalSegments === undefined) {
        m.totalSegments = totalSegments
        await writeFile(p, JSON.stringify(m, null, 2), 'utf-8')
      }
    }
  }

  return { id }
}

async function writeSessionCompleteJob(sessionId: string, totalSegments: number) {
  const job: SessionCompleteJob = {
    id: `scomplete-${sessionId}`,
    type: 'session_complete',
    sessionId,
    totalSegments,
    createdAt: new Date().toISOString(),
  }
  await writeFile(path.join(getQueueDir(), `scomplete-${sessionId}.json`), JSON.stringify(job, null, 2), 'utf-8')
}

async function sendSessionComplete(payload: { id: string; serverUrl: string; token: string }) {
  const jobPath = path.join(getQueueDir(), `${payload.id}.json`)
  const job = JSON.parse(await readFile(jobPath, 'utf-8')) as SessionCompleteJob

  if (!job.totalSegments) {
    console.warn('[SessionComplete] fișier job fără totalSegments — șters:', job.id)
    await rm(jobPath, { force: true })
    return { ok: true, status: 0, body: 'incomplete job deleted' }
  }

  const form = new FormData()
  form.append('total_segments', String(job.totalSegments))
  console.log('[SessionComplete] trimit session_id:', job.sessionId, 'total_segments:', job.totalSegments)

  const response = await fetch(
    `${normalizeServerUrl(payload.serverUrl)}/api/v1/inbox/session/${job.sessionId}/complete`,
    {
      method: 'POST',
      headers: { Authorization: `Bearer ${payload.token}` },
      body: form,
    },
  )

  const bodyText = await response.text()
  let body: unknown = null
  try { body = bodyText ? JSON.parse(bodyText) : null } catch { body = bodyText }

  return { ok: response.ok, status: response.status, body }
}

async function patchSiblingSegments(sessionId: string, uploadedId: string, recordingId: string) {
  const files = await readdir(getQueueDir())
  for (const file of files.filter(f => f.endsWith('.json'))) {
    const metaPath = path.join(getQueueDir(), file)
    const m = JSON.parse(await readFile(metaPath, 'utf-8')) as StoredSegmentMeta
    if (m.sessionId === sessionId && m.id !== uploadedId && !m.existingRecordingId) {
      m.existingRecordingId = recordingId
      await writeFile(metaPath, JSON.stringify(m, null, 2), 'utf-8')
    }
  }
}

async function deleteQueueItem(id: string) {
  await rm(path.join(getQueueDir(), `${id}.audio`), { force: true })
  await rm(path.join(getQueueDir(), `${id}.json`), { force: true })
}

async function uploadQueueItem(payload: { id: string; serverUrl: string; token: string }) {
  const metaPath = path.join(getQueueDir(), `${payload.id}.json`)
  const audioPath = path.join(getQueueDir(), `${payload.id}.audio`)
  const meta = JSON.parse(await readFile(metaPath, 'utf-8')) as StoredSegmentMeta
  const audioBuffer = await readFile(audioPath)

  const form = new FormData()
  form.append('file', new Blob([audioBuffer], { type: meta.mimeType }), meta.fileName)
  form.append('title', meta.title)
  form.append('meeting_date', meta.meetingDate)
  form.append('location', meta.location)
  if (meta.participants) {
    form.append('participants', meta.participants)
  }
  form.append('description', `Inregistrare automata — ${meta.roomName}`)
  const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
  const sessionId = UUID_RE.test(meta.sessionId ?? '') ? meta.sessionId : randomUUID()
  form.append('session_id', sessionId)
  form.append('segment_index', String(Number.isInteger(meta.segmentIndex) ? meta.segmentIndex : 0))
  if (meta.existingRecordingId) {
    form.append('existing_recording_id', meta.existingRecordingId)
  }

  const response = await fetch(`${normalizeServerUrl(payload.serverUrl)}/api/v1/inbox/upload`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${payload.token}`,
    },
    body: form,
  })

  const bodyText = await response.text()
  let body: unknown = null
  try {
    body = bodyText ? JSON.parse(bodyText) : null
  } catch {
    body = bodyText
  }

  if (response.ok && meta.sessionId) {
    // Patch recording_id pe celelalte segmente ale sesiunii (dacă e prezent în răspuns)
    const recordingId = (
      body !== null && typeof body === 'object' && 'recording_id' in body
        ? (body as { recording_id: string | null }).recording_id
        : null
    )
    if (recordingId) {
      await patchSiblingSegments(meta.sessionId, payload.id, recordingId)
    }

    // Trimite /complete după ultimul segment — fără să depindă de recording_id.
    // Serverul face lookup după session_id singur.
    const isLastSegment = Number.isInteger(meta.totalSegments) &&
      meta.segmentIndex === (meta.totalSegments as number) - 1
    if (isLastSegment) {
      await writeSessionCompleteJob(meta.sessionId, meta.totalSegments as number)
      const completeResult = await sendSessionComplete({
        id: `scomplete-${meta.sessionId}`,
        serverUrl: payload.serverUrl,
        token: payload.token,
      }).catch(() => ({ ok: false }))
      if (completeResult.ok) {
        await rm(path.join(getQueueDir(), `scomplete-${meta.sessionId}.json`), { force: true })
      }
      // dacă eșuează (ex. ingest încă procesează seg 0 → 404), fișierul rămâne pe disk
      // și queue poller îl reîncearcă la fiecare 5s
    }
  }

  return {
    ok: response.ok,
    status: response.status,
    body,
  }
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1360,
    height: 900,
    minWidth: 1180,
    minHeight: 760,
    backgroundColor: '#0d1b16',
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  })

  // Permite accesul la microfon din renderer
  mainWindow.webContents.session.setPermissionRequestHandler((_webContents, permission, callback) => {
    if (permission === 'media') {
      callback(true)
    } else {
      callback(false)
    }
  })

  const devServerUrl = process.env.VITE_DEV_SERVER_URL
  if (devServerUrl) {
    void mainWindow.loadURL(devServerUrl)
    mainWindow.webContents.openDevTools({ mode: 'detach' })
    return
  }

  void mainWindow.loadFile(path.join(app.getAppPath(), 'dist', 'index.html'))
}

app.whenReady().then(async () => {
  await ensureAppStorage()

  ipcMain.handle('settings:load', loadSettings)
  ipcMain.handle('settings:save', (_event, settings: ClientSettings) => saveSettings(settings))
  ipcMain.handle('queue:list', listQueueItems)
  ipcMain.handle('queue:enqueue', (_event, payload) => enqueueSegment(payload))
  ipcMain.handle('queue:delete', (_event, id: string) => deleteQueueItem(id))
  ipcMain.handle('queue:upload', (_event, payload) => uploadQueueItem(payload))
  ipcMain.handle('queue:complete', (_event, payload) => sendSessionComplete(payload))

  createWindow()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow()
    }
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})