/**
 * Test de integrare: upload segmente reale la serverul MeetRec
 *
 * Build & run:
 *   npm run test:integration
 *
 * Ce testează:
 *   - Login cu credențiale reale
 *   - Creare sesiune (POST /inbox/session/create)
 *   - Upload 3 segmente WAV (în paralel, ca în producție)
 *   - POST /session/complete
 *   - Înregistrarea apare pe server cu status corect (GET /recordings)
 */

import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import axios from 'axios'

const SERVER_URL = 'http://localhost:8080'
const USERNAME   = 'operator'
const PASSWORD   = 'operator123'
const SESSION_ID = `integ-test-${Date.now()}`
const TOTAL_SEGMENTS = 3

// ─── WAV helper ───────────────────────────────────────────────────────────────

function makeWav(seconds = 6): Buffer {
  const sampleRate = 48000
  const samples    = sampleRate * seconds
  const dataBytes  = samples * 2
  const buf        = Buffer.alloc(44 + dataBytes)
  buf.write('RIFF', 0)
  buf.writeUInt32LE(36 + dataBytes, 4)
  buf.write('WAVE', 8)
  buf.write('fmt ', 12)
  buf.writeUInt32LE(16, 16)
  buf.writeUInt16LE(1, 20)
  buf.writeUInt16LE(1, 22)
  buf.writeUInt32LE(sampleRate, 24)
  buf.writeUInt32LE(sampleRate * 2, 28)
  buf.writeUInt16LE(2, 32)
  buf.writeUInt16LE(16, 34)
  buf.write('data', 36)
  buf.writeUInt32LE(dataBytes, 40)
  // Zgomot aleatoriu — hash unic la fiecare rulare, evită duplicate detection
  for (let i = 44; i < buf.length; i += 2) {
    buf.writeInt16LE(Math.floor((Math.random() - 0.5) * 1000), i)
  }
  return buf
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

// ─── Test ─────────────────────────────────────────────────────────────────────

async function run(): Promise<void> {
  console.log('\n══════════════════════════════════════════')
  console.log('  Test integrare: upload real la server')
  console.log(`  Server: ${SERVER_URL}`)
  console.log('══════════════════════════════════════════\n')

  // 1. Login
  console.log('  1. Login...')
  let token: string
  try {
    const res = await axios.post<{ access_token: string }>(
      `${SERVER_URL}/api/v1/auth/login`,
      { username: USERNAME, password: PASSWORD },
      { timeout: 10000 },
    )
    token = res.data.access_token
    assert(!!token, 'Login reușit, token primit')
  } catch (err) {
    console.error('  ✗  Login eșuat:', err instanceof Error ? err.message : err)
    process.exit(1)
  }

  const headers = { Authorization: `Bearer ${token}` }

  // 2. Creare sesiune
  console.log('\n  2. Creare sesiune...')
  const recordingTitle = `[TEST INTEGRARE] Ședință ${new Date().toISOString()}`
  let sessionId: string
  try {
    const res = await axios.post<{ session_id: string }>(
      `${SERVER_URL}/api/v1/inbox/session/create`,
      {
        title: recordingTitle,
        meeting_date: new Date().toISOString().slice(0, 10),
        participants: 'Alice, Bob',
        location: 'Test Lab',
        room_name: 'Sala Test',
      },
      { headers, timeout: 10000 },
    )
    sessionId = res.data.session_id
    assert(!!sessionId, `Sesiune creată cu session_id: ${sessionId}`)
  } catch (err: unknown) {
    if (axios.isAxiosError(err) && err.response?.status === 404) {
      console.warn('  ⚠  /inbox/session/create nu există pe server — se continuă fără pre-înregistrare')
      sessionId = SESSION_ID
    } else {
      console.error('  ✗  Creare sesiune eșuată:', axios.isAxiosError(err) ? err.message : err)
      process.exit(1)
    }
  }

  // 3. Upload segmente
  console.log(`\n  3. Upload ${TOTAL_SEGMENTS} segmente (session_id=${sessionId})...`)

  const wavDir   = fs.mkdtempSync(path.join(os.tmpdir(), 'meetrec-integ-'))
  const uploadResults: { index: number; status: number; ok: boolean }[] = []

  await Promise.all(
    Array.from({ length: TOTAL_SEGMENTS }, async (_, i) => {
      const isFinal  = i === TOTAL_SEGMENTS - 1
      const wavBuf   = makeWav(6)  // minim 5s impus de ingest
      const wavPath  = path.join(wavDir, `segment-${i}.wav`)
      fs.writeFileSync(wavPath, wavBuf)

      const form = new FormData()
      form.append('file', new Blob([wavBuf], { type: 'audio/wav' }), `segment_${i}.wav`)
      form.append('session_id', sessionId)
      form.append('segment_index', String(i))
      form.append('is_final', isFinal ? 'true' : 'false')
      form.append('total_segments', String(TOTAL_SEGMENTS))
      form.append('title', recordingTitle)
      form.append('room_name', 'Sala Test')
      form.append('location', 'Test Lab')
      form.append('participants', 'Alice, Bob')
      form.append('meeting_date', new Date().toISOString().slice(0, 10))

      try {
        const res = await fetch(`${SERVER_URL}/api/v1/inbox/upload`, {
          method: 'POST',
          headers: { Authorization: `Bearer ${token}` },
          body: form,
          signal: AbortSignal.timeout(30000),
        })
        uploadResults.push({ index: i, status: res.status, ok: res.ok })
        console.log(`    segment ${i}: HTTP ${res.status}${isFinal ? ' (final)' : ''}`)
      } catch (err) {
        uploadResults.push({ index: i, status: 0, ok: false })
        console.error(`    segment ${i}: EROARE —`, err instanceof Error ? err.message : err)
      }
    }),
  )

  for (let i = 0; i < TOTAL_SEGMENTS; i++) {
    const r = uploadResults.find(r => r.index === i)
    assert(r?.ok === true, `Segment ${i} acceptat de server`, `HTTP ${r?.status ?? 'N/A'}`)
  }

  // 4. POST /complete — cu retry pe 409 (ingest încă procesează)
  console.log('\n  4. POST /complete...')
  let completeOk = false
  const completeDeadline = Date.now() + 3 * 60 * 1000  // max 3 minute
  let attempt = 0
  while (Date.now() < completeDeadline) {
    attempt++
    try {
      const res = await fetch(
        `${SERVER_URL}/api/v1/inbox/session/${sessionId}/complete`,
        {
          method: 'POST',
          headers: { ...headers, 'Content-Type': 'application/json' },
          body: JSON.stringify({ total_segments: TOTAL_SEGMENTS }),
          signal: AbortSignal.timeout(20000),
        },
      )
      console.log(`    attempt ${attempt}: HTTP ${res.status}`)
      if (res.ok || res.status === 201) {
        completeOk = true
        break
      }
      if (res.status === 409) {
        const body = await res.json().catch(() => ({})) as { detail?: string }
        console.log(`    409 — ${body.detail ?? 'ingest în curs'} — retry în 5s...`)
        await new Promise(r => setTimeout(r, 5000))
        continue
      }
      // altă eroare — oprire
      const body = await res.text().catch(() => '')
      console.error(`    Eroare: ${body}`)
      break
    } catch (err) {
      console.error(`    attempt ${attempt} network error:`, err instanceof Error ? err.message : err)
      await new Promise(r => setTimeout(r, 3000))
    }
  }
  assert(completeOk, '/complete finalizat cu succes', completeOk ? '' : 'timeout sau eroare')

  // 5. Verificare înregistrare pe server
  console.log('\n  5. Verificare înregistrare pe server...')
  await new Promise(r => setTimeout(r, 1500)) // dă timp serverului să proceseze

  try {
    const res = await axios.get<{ items: Array<{ id: string; title: string; status: string }> }>(
      `${SERVER_URL}/api/v1/recordings`,
      { headers, timeout: 10000 },
    )
    const items = res.data.items ?? []
    const found = items.find(r => r.title === recordingTitle)

    assert(!!found, `Înregistrarea "${recordingTitle.slice(0, 40)}..." există pe server`, found ? '' : 'nu a fost găsită')
    if (found) {
      console.log(`    id: ${found.id}  status: ${found.status}`)
      assert(
        found.status !== 'error',
        `Status înregistrare nu este error`,
        `status: ${found.status}`,
      )
    }
  } catch (err) {
    console.error('  ✗  GET /recordings eșuat:', axios.isAxiosError(err) ? err.message : err)
    failed++
  }

  // Cleanup
  try { fs.rmSync(wavDir, { recursive: true, force: true }) } catch { /* ignore */ }

  // Sumar
  console.log(`\n══════════════════════════════════════════`)
  console.log(`  ${passed} passed   ${failed} failed`)
  console.log(`══════════════════════════════════════════\n`)

  process.exit(failed > 0 ? 1 : 0)
}

run().catch(err => {
  console.error('\n[CRASH]', err)
  process.exit(1)
})
