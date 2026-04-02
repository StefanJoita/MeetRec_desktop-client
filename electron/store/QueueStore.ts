import fs from 'node:fs'
import path from 'node:path'
import { randomUUID } from 'node:crypto'
import { getDb } from './Database'

export type SegmentStatus =
  | 'pending'
  | 'uploading'
  | 'uploaded'
  | 'complete_pending'
  | 'completed'
  | 'error'
  | 'dead'

export interface SegmentRow {
  id: string
  session_id: string
  segment_index: number
  status: SegmentStatus
  is_final: number      // 0 or 1
  total_segments: number | null
  audio_path: string
  audio_bytes: number
  title: string
  room_name: string
  location: string
  participants: string
  meeting_date: string
  error_count: number
  last_error: string | null
  created_at: string
  updated_at: string
}

export interface EnqueueOptions {
  sessionId: string
  segmentIndex: number
  isFinal: boolean
  totalSegments?: number
  audioPath: string
  audioBytes: number
  title: string
  roomName: string
  location: string
  participants: string
  meetingDate: string
}

function now(): string {
  return new Date().toISOString()
}

export const QueueStore = {
  enqueue(opts: EnqueueOptions): SegmentRow {
    const db = getDb()
    const id = randomUUID()
    const ts = now()

    db.prepare(`
      INSERT INTO segments (
        id, session_id, segment_index, status, is_final, total_segments,
        audio_path, audio_bytes, title, room_name, location, participants,
        meeting_date, error_count, last_error, created_at, updated_at
      ) VALUES (
        ?, ?, ?, 'pending', ?, ?,
        ?, ?, ?, ?, ?, ?,
        ?, 0, NULL, ?, ?
      )
    `).run(
      id,
      opts.sessionId,
      opts.segmentIndex,
      opts.isFinal ? 1 : 0,
      opts.totalSegments ?? null,
      opts.audioPath,
      opts.audioBytes,
      opts.title,
      opts.roomName,
      opts.location,
      opts.participants,
      opts.meetingDate,
      ts,
      ts,
    )

    return QueueStore.getById(id) as SegmentRow
  },

  getById(id: string): SegmentRow | undefined {
    const db = getDb()
    const row = db.prepare('SELECT * FROM segments WHERE id = ?').get(id)
    return row as SegmentRow | undefined
  },

  getNextPending(): SegmentRow | undefined {
    const db = getDb()
    const row = db.prepare(
      "SELECT * FROM segments WHERE status = 'pending' ORDER BY segment_index ASC LIMIT 1"
    ).get()
    return row as SegmentRow | undefined
  },

  getPendingBatch(limit: number): SegmentRow[] {
    const db = getDb()
    const ts = now()

    const rows = db.prepare(
      "SELECT * FROM segments WHERE status = 'pending' ORDER BY segment_index ASC LIMIT ?"
    ).all(limit) as SegmentRow[]

    if (rows.length === 0) return []

    const placeholders = rows.map(() => '?').join(',')
    db.prepare(
      `UPDATE segments SET status = 'uploading', updated_at = ? WHERE id IN (${placeholders})`
    ).run(ts, ...rows.map(r => r.id))

    return rows
  },

  getNextCompletePending(): SegmentRow | undefined {
    const db = getDb()
    const row = db.prepare(
      "SELECT * FROM segments WHERE status = 'complete_pending' ORDER BY created_at ASC LIMIT 1"
    ).get()
    return row as SegmentRow | undefined
  },

  getAllBySessionId(sessionId: string): SegmentRow[] {
    const db = getDb()
    return db.prepare(
      'SELECT * FROM segments WHERE session_id = ?'
    ).all(sessionId) as SegmentRow[]
  },

  setStatus(id: string, status: SegmentStatus, error?: string): void {
    const db = getDb()
    const ts = now()

    if (status === 'error') {
      db.prepare(`
        UPDATE segments
        SET status = ?, error_count = error_count + 1, last_error = ?, updated_at = ?
        WHERE id = ?
      `).run(status, error ?? null, ts, id)
    } else {
      db.prepare(`
        UPDATE segments
        SET status = ?, updated_at = ?
        WHERE id = ?
      `).run(status, ts, id)
    }
  },

  list(): SegmentRow[] {
    const db = getDb()
    const rows = db.prepare(
      "SELECT * FROM segments WHERE status != 'completed' ORDER BY created_at ASC"
    ).all()
    return rows as SegmentRow[]
  },

  delete(id: string): void {
    const db = getDb()
    db.prepare('DELETE FROM segments WHERE id = ?').run(id)
  },

  resetStaleUploading(): void {
    const db = getDb()
    const ts = now()
    db.prepare(`
      UPDATE segments
      SET status = 'pending', updated_at = ?
      WHERE status = 'uploading'
    `).run(ts)
  },

  getQueueStats(): {
    total: number
    pending: number
    uploading: number
    completed: number
    errorCount: number
  } {
    const db = getDb()

    const total = (db.prepare('SELECT COUNT(*) as cnt FROM segments').get() as { cnt: number }).cnt
    const pending = (db.prepare("SELECT COUNT(*) as cnt FROM segments WHERE status = 'pending'").get() as { cnt: number }).cnt
    const uploading = (db.prepare("SELECT COUNT(*) as cnt FROM segments WHERE status = 'uploading'").get() as { cnt: number }).cnt
    const completed = (db.prepare("SELECT COUNT(*) as cnt FROM segments WHERE status = 'completed'").get() as { cnt: number }).cnt
    const errorCount = (db.prepare("SELECT COUNT(*) as cnt FROM segments WHERE status = 'error' OR status = 'dead'").get() as { cnt: number }).cnt

    return { total, pending, uploading, completed, errorCount }
  },

  cleanupOrphanWavs(segmentsDir: string): void {
    if (!fs.existsSync(segmentsDir)) return

    const db = getDb()
    const rows = db.prepare('SELECT audio_path FROM segments').all() as Array<{ audio_path: string }>
    const knownPaths = new Set(rows.map(r => r.audio_path))

    let files: string[]
    try {
      files = fs.readdirSync(segmentsDir)
    } catch {
      return
    }

    for (const file of files) {
      if (!file.endsWith('.wav')) continue
      const fullPath = path.join(segmentsDir, file)
      if (!knownPaths.has(fullPath)) {
        try {
          fs.unlinkSync(fullPath)
          console.log('[QueueStore] Deleted orphan WAV:', fullPath)
        } catch {
          // ignore — file may have been deleted by another process
        }
      }
    }
  },

  deleteSessionWavs(sessionId: string): void {
    const db = getDb()
    const rows = db.prepare(
      'SELECT audio_path FROM segments WHERE session_id = ?'
    ).all(sessionId) as Array<{ audio_path: string }>

    for (const row of rows) {
      if (!row.audio_path) continue
      try {
        fs.unlinkSync(row.audio_path)
      } catch {
        // File may already be gone; not an error
      }
    }
  },
}
