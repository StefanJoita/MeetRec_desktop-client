import { app, BrowserWindow } from 'electron'
import path from 'node:path'
import fs from 'node:fs'
import { initDatabase } from './store/Database'
import { QueueStore } from './store/QueueStore'
import { AuthService } from './services/AuthService'
import { SettingsService } from './services/SettingsService'
import { SessionController } from './services/SessionController'
import { UploadWorker } from './services/UploadWorker'
import { PcmAccumulator } from './capture/PcmAccumulator'
import { registerIpcHandlers } from './ipc/ipc-handlers'
import { pushToRenderer } from './ipc/ipc-push'
import { IPC } from '../shared/ipc-constants'

app.whenReady().then(() => {
  // 1. Initialise SQLite database and run migrations
  initDatabase()

  // 2. Reset segments that were left in 'uploading' state by a previous crash
  QueueStore.resetStaleUploading()

  // 3. Instantiate services
  const settingsService = new SettingsService()
  const authService = new AuthService(settingsService)
  const accumulator = new PcmAccumulator()
  const sessionController = new SessionController(
    accumulator,
    QueueStore,
    pushToRenderer,
    settingsService,
    authService,
    () => uploadWorker.nudge(),
  )
  const uploadWorker = new UploadWorker(
    QueueStore,
    authService,
    settingsService,
    pushToRenderer,
  )
  uploadWorker.start()

  // 4. Segments directory
  const segmentsDir = path.join(app.getPath('userData'), 'segments')
  if (!fs.existsSync(segmentsDir)) {
    fs.mkdirSync(segmentsDir, { recursive: true })
  }

  // 5. Clean up WAV files that are no longer referenced in the DB
  QueueStore.cleanupOrphanWavs(segmentsDir)

  // 6. Register all IPC handlers
  registerIpcHandlers({
    authService,
    settingsService,
    sessionController,
    uploadWorker,
    queueStore: QueueStore,
    segmentsDir,
  })

  // 7. Create the main window
  function createWindow(): BrowserWindow {
    const isDev = !!process.env.VITE_DEV_SERVER_URL

    const win = new BrowserWindow({
      width: 420,
      height: 700,
      minWidth: 380,
      minHeight: 600,
      resizable: true,
      title: 'MeetRec Room Client',
      webPreferences: {
        preload: path.join(__dirname, 'preload.cjs'),
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: false,
      },
    })

    // Allow microphone access from the renderer
    win.webContents.session.setPermissionRequestHandler(
      (_webContents, permission, callback) => {
        callback(permission === 'media')
      },
    )

    if (isDev) {
      void win.loadURL(process.env.VITE_DEV_SERVER_URL!)
      win.webContents.openDevTools()
    } else {
      void win.loadFile(path.join(__dirname, '../dist/index.html'))
    }

    // Push initial queue stats once the renderer is ready
    win.webContents.once('did-finish-load', () => {
      const stats = QueueStore.getQueueStats()
      pushToRenderer(IPC.QUEUE_UPDATED, { ...stats, isUploading: false })
    })

    return win
  }

  createWindow()

  // 8. Start the upload worker loop
  uploadWorker.start()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      // macOS: re-create window on dock icon click — only the window, not the services
      createWindow()
    }
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
