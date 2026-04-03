/**
 * Minimal mock for the `electron` module — used only in tests.
 * Aliases: --alias:electron=./test/electron-stub.cjs (via esbuild)
 */
const os = require('os')
const path = require('path')
const fs = require('fs')

const TEST_DIR = path.join(os.tmpdir(), `meetrec-test-${Date.now()}`)
fs.mkdirSync(TEST_DIR, { recursive: true })

// Exposed so the test can clean up after itself
global.__MEETREC_TEST_DIR__ = TEST_DIR

const app = {
  getPath: (_name) => TEST_DIR,
  quit: () => {},
  on: () => {},
}

module.exports = {
  app,
  BrowserWindow: class {},
  ipcMain: { handle: () => {}, on: () => {} },
}
