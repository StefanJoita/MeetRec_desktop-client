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
  const metaFiles = files.filter(file => file.endsWith('.json'))

  const items = await Promise.all(
    metaFiles.map(async file => {
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
        }
      } catch {
        // Audio file missing (partial delete) — skip this item
        return null
      }
    }),
  )

  return items
    .filter((item): item is QueueItem => item !== null)
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
}) {
  await ensureAppStorage()
  const id = `${Date.now()}-${randomUUID()}`
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
  }

  await writeFile(path.join(getQueueDir(), `${id}.audio`), Buffer.from(payload.bytes))
  await writeFile(path.join(getQueueDir(), `${id}.json`), JSON.stringify(meta, null, 2), 'utf-8')

  return { id }
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
  form.append('session_id', meta.sessionId)
  form.append('segment_index', String(meta.segmentIndex))

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