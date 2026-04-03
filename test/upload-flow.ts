/**
 * Test: trimiterea unei înregistrări cu 3 segmente la server
 *
 * Build & run:
 *   npm run test:upload
 *
 * Ce testează:
 *   - Segmentele sunt uploadate în ordine (0, 1, 2)
 *   - Câmpurile multipart sunt corecte (session_id, segment_index, is_final, total_segments)
 *   - POST /session/complete este apelat o singură dată, cu session_id corect
 *   - Fișierele WAV sunt șterse după upload
 *   - Niciun segment nu rămâne în starea pending sau error
 */

import { createServer } from 'node:http'
import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import { initDatabase, getDb, closeDatabase } from '../electron/store/Database'
import { QueueStore } from '../electron/store/QueueStore'
import { UploadWorker } from '../electron/services/UploadWorker'
import type { AuthService } from '../electron/services/AuthService'
import type { SettingsService } from '../electron/services/SettingsService'

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Creează un WAV valid minimal (header PCM 16-bit mono + silence) */
function makeWav(sampleCount = 800): Buffer {
  const dataBytes = sampleCount * 2
  const buf = Buffer.alloc(44 + dataBytes, 0)
  buf.write('RIFF', 0)
  buf.writeUInt32LE(36 + dataBytes, 4)
  buf.write('WAVE', 8)
  buf.write('fmt ', 12)
  buf.writeUInt32LE(16, 16)
  buf.writeUInt16LE(1, 20)      // PCM
  buf.writeUInt16LE(1, 22)      // mono
  buf.writeUInt32LE(48000, 24)  // sample rate
  buf.writeUInt32LE(96000, 28)  // byte rate
  buf.writeUInt16LE(2, 32)      // block align
  buf.writeUInt16LE(16, 34)     // bits per sample
  buf.write('data', 36)
  buf.writeUInt32LE(dataBytes, 40)
  return buf
}

/**
 * Extrage câmpurile text dintr-un body multipart/form-data.
 * Lucrează pe Buffer (nu string) pentru a gestiona corect câmpurile UTF-8
 * ce coexistă cu datele binare ale fișierului WAV.
 */
function parseMultipartFields(body: Buffer, contentType: string): Record<string, string> {
  const boundaryMatch = /boundary=([^\s;]+)/.exec(contentType)
  if (!boundaryMatch) return {}

  const delimiter = Buffer.from(`--${boundaryMatch[1]}`)
  const fields: Record<string, string> = {}
  const CRLF2 = Buffer.from('\r\n\r\n')

  let pos = 0
  while (pos < body.length) {
    const delimStart = body.indexOf(delimiter, pos)
    if (delimStart === -1) break

    // Sari peste boundary + CRLF
    const partStart = delimStart + delimiter.length + 2
    const nextDelim = body.indexOf(delimiter, partStart)
    const partEnd = nextDelim === -1 ? body.length : nextDelim - 2 // exclude \r\n înainte de boundary

    const part = body.subarray(partStart, partEnd)
    const headerEnd = part.indexOf(CRLF2)
    if (headerEnd === -1) { pos = partStart; continue }

    const headers = part.subarray(0, headerEnd).toString('utf8')

    // Sărită câmpurile cu fișiere binare
    if (headers.includes('filename=')) { pos = partStart; continue }

    const nameMatch = /name="([^"]+)"/.exec(headers)
    if (nameMatch) {
      // Valoarea câmpului text e după \r\n\r\n, decodată UTF-8
      const value = part.subarray(headerEnd + 4).toString('utf8').replace(/\r\n$/, '')
      fields[nameMatch[1]] = value
    }

    pos = partStart
  }

  return fields
}

// ─── Assertions ───────────────────────────────────────────────────────────────

let passed = 0
let failed = 0

function assert(condition: boolean, message: string, extra = ''): void {
  if (condition) {
    console.log(`  ✓  ${message}`)
    passed++
  } else {
    console.error(`  ✗  ${message}${extra ? `  ← ${extra}` : ''}`)
    failed++
  }
}

// ─── Test principal ───────────────────────────────────────────────────────────

async function run(): Promise<void> {
  console.log('\n══════════════════════════════════════════')
  console.log('  Test: upload 3 segmente')
  console.log('══════════════════════════════════════════\n')

  // 1. Directorul temporar pentru fișierele WAV ale testului
  const wavDir = fs.mkdtempSync(path.join(os.tmpdir(), 'meetrec-wavs-'))

  // 2. Inițializare DB (electron-stub direcționează userData → alt tmpdir)
  initDatabase()
  QueueStore.resetStaleUploading()

  // 3. Server HTTP mock
  const receivedUploads: {
    index: number
    sessionId: string
    isFinal: boolean
    totalSegments: string
    title: string
    roomName: string
  }[] = []

  let completeCallCount = 0
  let completeSessionId = ''

  const server = createServer((req, res) => {
    const chunks: Buffer[] = []
    req.on('data', (chunk: Buffer) => chunks.push(chunk))
    req.on('end', () => {
      const body = Buffer.concat(chunks)

      if (req.method === 'POST' && req.url?.includes('/api/v1/inbox/upload')) {
        const ct = req.headers['content-type'] ?? ''
        const fields = parseMultipartFields(body, ct)

        receivedUploads.push({
          index: parseInt(fields['segment_index'] ?? '-1', 10),
          sessionId: fields['session_id'] ?? '',
          isFinal: fields['is_final'] === 'true',
          totalSegments: fields['total_segments'] ?? '',
          title: fields['title'] ?? '',
          roomName: fields['room_name'] ?? '',
        })

        res.writeHead(200, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({ recording_id: `rec-${Date.now()}` }))

      } else if (
        req.method === 'POST' &&
        req.url?.match(/\/api\/v1\/inbox\/session\/.+\/complete/)
      ) {
        const m = /\/api\/v1\/inbox\/session\/([^/]+)\/complete/.exec(req.url ?? '')
        completeCallCount++
        completeSessionId = m?.[1] ?? ''
        res.writeHead(200, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({ ok: true }))

      } else {
        res.writeHead(404)
        res.end(`Not found: ${req.method} ${req.url}`)
      }
    })
  })

  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', () => resolve()))
  const { port } = server.address() as { port: number }
  const serverUrl = `http://127.0.0.1:${port}`
  console.log(`  Mock server pornit pe ${serverUrl}`)

  // 4. Mock-uri pentru AuthService și SettingsService
  const SESSION_ID = 'sess-test-abc-123'

  const mockAuth = {
    getToken: () => 'Bearer dummy-token',
    getServerUrl: () => serverUrl,
  } as unknown as AuthService

  const mockSettings = {
    get: () => ({ serverUrl, segmentDurationSeconds: 300 }),
  } as unknown as SettingsService

  const pushFn = (_ch: string, _payload?: unknown) => { /* no-op */ }

  // 5. Creează fișiere WAV fake și enqueue 3 segmente
  const TOTAL_SEGMENTS = 3
  const wavPaths: string[] = []

  console.log(`\n  Enqueue ${TOTAL_SEGMENTS} segmente...\n`)

  for (let i = 0; i < TOTAL_SEGMENTS; i++) {
    const wavPath = path.join(wavDir, `segment-${i}.wav`)
    const wavData = makeWav(1000)
    fs.writeFileSync(wavPath, wavData)
    wavPaths.push(wavPath)

    QueueStore.enqueue({
      sessionId: SESSION_ID,
      segmentIndex: i,
      isFinal: i === TOTAL_SEGMENTS - 1,
      totalSegments: TOTAL_SEGMENTS,
      audioPath: wavPath,
      audioBytes: wavData.length,
      title: 'Ședință test',
      roomName: 'Sala A',
      location: 'Sediu central',
      participants: 'Alice, Bob, Carol',
      meetingDate: '2026-04-02',
    })

    console.log(
      `    [enqueue] segment ${i}  isFinal=${i === TOTAL_SEGMENTS - 1}  path=${path.basename(wavPath)}`,
    )
  }

  // 6. Pornire UploadWorker
  console.log('\n  Upload worker pornit...\n')
  const worker = new UploadWorker(QueueStore, mockAuth, mockSettings, pushFn)
  worker.start()

  // 7. Așteptare până toate segmentele sunt procesate (max 15s)
  await new Promise<void>((resolve, reject) => {
    const deadline = setTimeout(
      () => reject(new Error('Timeout: worker nu a terminat în 15s')),
      15000,
    )
    const poll = setInterval(() => {
      const stats = QueueStore.getQueueStats()
      if (stats.completed >= TOTAL_SEGMENTS) {
        clearInterval(poll)
        clearTimeout(deadline)
        resolve()
      }
    }, 50)
  })

  worker.stop()
  server.close()

  // 8. Assertions
  console.log('  Rezultate:\n')

  // Upload count
  assert(
    receivedUploads.length === TOTAL_SEGMENTS,
    `Server a primit ${TOTAL_SEGMENTS} requesturi de upload`,
    `primit: ${receivedUploads.length}`,
  )

  // Ordine segmente
  for (let i = 0; i < TOTAL_SEGMENTS; i++) {
    const seg = receivedUploads[i]
    assert(seg?.index === i, `Segmentul ${i} trimis la poziția ${i}`, `index primit: ${seg?.index}`)
    assert(
      seg?.sessionId === SESSION_ID,
      `Segmentul ${i} are session_id corect`,
      `primit: ${seg?.sessionId}`,
    )
    assert(
      seg?.totalSegments === String(TOTAL_SEGMENTS),
      `Segmentul ${i} are total_segments=${TOTAL_SEGMENTS}`,
      `primit: ${seg?.totalSegments}`,
    )
    assert(seg?.title === 'Ședință test', `Segmentul ${i} are titlul corect`)
    assert(seg?.roomName === 'Sala A', `Segmentul ${i} are room_name corect`)
  }

  // is_final
  assert(
    receivedUploads[TOTAL_SEGMENTS - 1]?.isFinal === true,
    `Ultimul segment (${TOTAL_SEGMENTS - 1}) are is_final=true`,
  )
  for (let i = 0; i < TOTAL_SEGMENTS - 1; i++) {
    assert(
      receivedUploads[i]?.isFinal === false,
      `Segmentul ${i} are is_final=false`,
    )
  }

  // /complete
  assert(completeCallCount === 1, `POST /complete apelat exact o dată`, `apelat: ${completeCallCount}`)
  assert(
    completeSessionId === SESSION_ID,
    `POST /complete cu session_id corect`,
    `primit: ${completeSessionId}`,
  )

  // Stare DB finală
  const finalStats = QueueStore.getQueueStats()
  assert(finalStats.pending === 0, `Niciun segment rămas pending`, `pending: ${finalStats.pending}`)
  assert(
    finalStats.errorCount === 0,
    `Nicio eroare în coadă`,
    `errors: ${finalStats.errorCount}`,
  )

  // WAV-urile șterse
  for (let i = 0; i < TOTAL_SEGMENTS; i++) {
    const deleted = !fs.existsSync(wavPaths[i]!)
    assert(deleted, `WAV segment ${i} șters după upload`)
  }

  // 9. Cleanup — închide DB-ul înainte de a șterge directoarele
  closeDatabase()
  try { fs.rmSync(wavDir, { recursive: true, force: true }) } catch { /* ignore */ }
  const testDbDir = (global as Record<string, unknown>)['__MEETREC_TEST_DIR__'] as string | undefined
  try { if (testDbDir) fs.rmSync(testDbDir, { recursive: true, force: true }) } catch { /* ignore */ }

  // 10. Sumar
  console.log(`\n══════════════════════════════════════════`)
  console.log(`  ${passed} passed   ${failed} failed`)
  console.log(`══════════════════════════════════════════\n`)

  process.exit(failed > 0 ? 1 : 0)
}

run().catch(err => {
  console.error('\n[CRASH]', err)
  process.exit(1)
})
