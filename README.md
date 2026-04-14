<div align="center">

# MeetRec Desktop Client

**Electron companion app for conference-room audio capture and upload.**

[![Electron](https://img.shields.io/badge/Electron-29-47848F?style=flat-square&logo=electron&logoColor=white)](https://electronjs.org)
[![React](https://img.shields.io/badge/React-18-61DAFB?style=flat-square&logo=react&logoColor=black)](https://react.dev)
[![TypeScript](https://img.shields.io/badge/TypeScript-5-3178C6?style=flat-square&logo=typescript&logoColor=white)](https://typescriptlang.org)
[![Platform](https://img.shields.io/badge/Platform-Windows%2010%2F11-0078D4?style=flat-square&logo=windows&logoColor=white)](https://microsoft.com/windows)
[![License](https://img.shields.io/badge/License-Proprietary-red?style=flat-square)](LICENSE)

*Runs in a meeting room. Records continuously. Uploads automatically. Requires no manual intervention.*

[Quick Start](#quick-start) · [Features](#features) · [Architecture](#architecture) · [Configuration](#configuration) · [Building](#building)

</div>

---

## What it does

The desktop client runs on a dedicated PC in a meeting room. It captures audio from any connected microphone, splits the recording into fixed-size WAV segments, and uploads them to a [MeetRec server](https://github.com/StefanJoita/MeetRec) with automatic retry if the network is unavailable. When the meeting ends, the operator clicks **Stop** and the server immediately assembles all segments and begins Whisper transcription.

Segments are persisted to a local SQLite queue — if the app restarts mid-meeting, queued uploads resume automatically.

---

## Features

- **Continuous recording** — captures audio via Web Audio API + AudioWorklet with no gaps between segments
- **WAV encoding** — segments encoded as PCM 16-bit mono WAV directly in the Electron main process
- **Configurable segment duration** — 30 s to 3600 s (default: 5 minutes); shorter segments reach the server sooner
- **Persistent upload queue** — segments survive app restarts; uploads resume automatically on next launch
- **Automatic retry** — failed uploads are retried every 5 seconds with exponential backoff
- **Session grouping** — every segment in a meeting shares a `session_id` UUID; the server groups them into a single recording
- **Explicit session completion** — after the last segment is confirmed, the client calls `POST /inbox/session/{id}/complete`; the server starts transcription immediately without waiting for a timeout
- **Role-based UI** — `admin` sees recorder + full settings; `operator` sees recorder only; `participant` is blocked with an informational screen
- **Setup wizard** — first-run wizard collects server URL, room name, and microphone permission; settings are persisted in SQLite
- **Session restore** — JWT and session state are restored automatically on relaunch
- **Microphone selector** — lists all available audio input devices; selection persists across restarts
- **Connection test** — verifies server reachability from the settings screen before starting a meeting
- **Microphone test** — captures a short sample and plays it back to confirm the microphone is working

---

## Requirements

- Windows 10 or 11
- Node.js 20+ and npm 10+ (development only)
- A running [MeetRec server](https://github.com/StefanJoita/MeetRec) reachable over the network
- A USB or built-in microphone; USB conference microphones (e.g. Jabra Speak 510, Jabra Speak 750) significantly improve transcription accuracy for 6–15 participants

---

## Quick Start

### Use a pre-built release

Download the latest installer or portable executable from the [Releases](https://github.com/StefanJoita/MeetRec_desktop-client/releases) page. Run it, complete the setup wizard, and the app is ready.

### Build from source

```powershell
# 1. Clone
git clone https://github.com/StefanJoita/MeetRec_desktop-client.git
cd MeetRec_desktop-client

# 2. Install dependencies
npm install

# 3. Start in development mode
npm run dev
```

---

## Architecture

```
┌─────────────────────────────────────────┐
│           React Renderer                │
│  (AppShell → screens based on role)     │
│                                         │
│  AudioWorklet → PCM chunks via IPC      │
└──────────────┬──────────────────────────┘
               │ window.meetrecDesktop.*
               │ (context-isolated IPC bridge)
               ▼
┌─────────────────────────────────────────┐
│         Electron Main Process           │
│                                         │
│  WAV encoder (audio/wav-encoder.ts)     │
│  SQLite queue  (userData/meetrec.db)    │
│  WAV files     (userData/segments/)     │
│  UploadWorker  (retry + backoff)        │
└──────────────┬──────────────────────────┘
               │ HTTP (axios)
               ▼
┌─────────────────────────────────────────┐
│           MeetRec Server                │
│  POST /api/v1/inbox/upload              │
│  POST /api/v1/inbox/session/{id}/complete│
└─────────────────────────────────────────┘
```

### Process model

| Layer | Technology | Responsibility |
|---|---|---|
| **Renderer** | React 18 + Vite + TailwindCSS | UI, microphone capture via AudioWorklet |
| **IPC bridge** | Electron preload (context isolation) | Typed channel bridge via `window.meetrecDesktop` |
| **Main process** | Electron + Node.js | WAV encoding, SQLite persistence, upload queue, HTTP calls |
| **Storage** | SQLite (`userData/meetrec.db`) | Settings, upload queue, segment metadata |

### Role routing

After login, the server-side user role determines the screen shown:

| Role | Screen | Capabilities |
|---|---|---|
| `admin` | `AdminScreen` | Recorder + all settings tabs (server, room, microphone, account) |
| `operator` | `OperatorScreen` | Recorder only (start/stop meeting) |
| `participant` | `ParticipantBlockedScreen` | Informational — no recording access |

---

## Data flow

1. Renderer captures microphone PCM via `AudioWorklet` and sends chunks to Electron main over IPC (`capture:pcm-chunk`)
2. Main accumulates chunks, encodes a WAV segment when the configured duration is reached, writes it to `userData/segments/`
3. A `segments` row is inserted into SQLite with status `pending`
4. `UploadWorker` drains the queue: `POST /api/v1/inbox/upload` with the WAV file and session metadata; on success the local WAV file is deleted and the row marked `uploaded`
5. After the operator clicks **Stop**, the final segment is uploaded and the client calls `POST /api/v1/inbox/session/{session_id}/complete`; a 409 response (already dispatched) is treated as success
6. The server assembles all segments, runs Whisper, and the transcript appears in the web UI

---

## Configuration

All settings are stored in SQLite and managed through the app's settings screen. There are no config files to edit manually.

| Setting | Description |
|---|---|
| **Server URL** | Base URL of the MeetRec server (e.g. `https://meetrec.company.local`) |
| **Room name** | Inserted as the `location` field on every uploaded recording |
| **Segment duration** | Duration of each WAV chunk in seconds (30–3600, default: 300) |
| **Microphone** | Audio input device; selected from a dropdown populated by the OS |
| **Username / Password** | MeetRec server credentials; JWT is cached and refreshed automatically |

---

## Building

```powershell
# Type-check only
npm run typecheck

# Full build (typecheck + Vite + Electron bundle)
npm run build

# Distribution builds (output in release/)
npm run dist:portable   # Portable .exe — no installer required
npm run dist:setup      # NSIS installer
npm run dist:all        # Both variants
```

---

## API endpoints used

| Method | Endpoint | Purpose |
|---|---|---|
| `POST` | `/api/v1/auth/login` | Obtain JWT |
| `GET` | `/api/v1/auth/me` | Verify session + fetch user profile |
| `POST` | `/api/v1/inbox/upload` | Upload one WAV segment (multipart) |
| `POST` | `/api/v1/inbox/session/{id}/complete` | Signal end of session → trigger immediate transcription |

### Upload fields (`multipart/form-data`)

| Field | Value |
|---|---|
| `file` | WAV file |
| `title` | Meeting title entered by the operator |
| `meeting_date` | Date the meeting started (`YYYY-MM-DD`) |
| `location` | Room name from settings |
| `participants` | Comma-separated participant names |
| `description` | `Inregistrare automata — <room name>` |
| `session_id` | UUID shared by all segments of one meeting |
| `segment_index` | Segment order: 0, 1, 2, … |

---

## Project structure

```
electron/
  main.ts              — main process: settings, queue, upload, IPC handlers
  preload.ts           — context-isolated IPC bridge → window.meetrecDesktop
  audio/
    wav-encoder.ts     — PCM → WAV encoding

src/
  app/
    AppShell.tsx       — root component: routes to screens based on auth state + role
  hooks/
    useMainState.ts    — subscribes to all main push events + invokes IPC commands
    useCapture.ts      — AudioWorklet lifecycle; streams PCM chunks to main
    useDevices.ts      — microphone device enumeration
  screens/
    LoginScreen.tsx
    SetupWizard.tsx
    OperatorScreen.tsx
    AdminScreen.tsx
    ParticipantBlockedScreen.tsx
  components/
    RecorderStatus.tsx
    QueuePanel.tsx
    SettingsForm.tsx
    StartMeetingModal.tsx
  types/
    electron.d.ts      — TypeScript types for window.meetrecDesktop

shared/                — types shared between main and renderer
```

---

## License

Proprietary — all rights reserved. Contact the repository owner for licensing inquiries.
