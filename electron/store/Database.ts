// @ts-ignore — node:sqlite types may be incomplete in older @types/node versions
import { DatabaseSync } from 'node:sqlite'
import path from 'node:path'
import { app } from 'electron'

// IMPORTANT: SQL inlined as string — esbuild does not bundle external .sql files.
const MIGRATION = `
CREATE TABLE IF NOT EXISTS segments (
  id             TEXT PRIMARY KEY,
  session_id     TEXT NOT NULL,
  segment_index  INTEGER NOT NULL,
  status         TEXT NOT NULL DEFAULT 'pending',
  is_final       INTEGER NOT NULL DEFAULT 0,
  total_segments INTEGER,
  audio_path     TEXT NOT NULL,
  audio_bytes    INTEGER NOT NULL DEFAULT 0,
  title          TEXT NOT NULL,
  room_name      TEXT NOT NULL,
  location       TEXT NOT NULL,
  participants   TEXT NOT NULL DEFAULT '',
  meeting_date   TEXT NOT NULL,
  error_count    INTEGER NOT NULL DEFAULT 0,
  last_error     TEXT,
  created_at     TEXT NOT NULL,
  updated_at     TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS settings (
  key   TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS auth (
  id         INTEGER PRIMARY KEY CHECK (id = 1),
  token      TEXT NOT NULL,
  username   TEXT NOT NULL,
  expires_at INTEGER NOT NULL
);
`

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let _db: any | null = null

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function initDatabase(): any {
  const dbPath = path.join(app.getPath('userData'), 'meetrec.db')
  // @ts-ignore
  const db = new DatabaseSync(dbPath)
  db.exec('PRAGMA journal_mode = WAL')
  db.exec('PRAGMA foreign_keys = ON')
  db.exec(MIGRATION)
  _db = db
  return db
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function getDb(): any {
  if (!_db) throw new Error('Database not initialized')
  return _db
}

export function closeDatabase(): void {
  if (_db) {
    try { _db.close() } catch { /* ignore */ }
    _db = null
  }
}
