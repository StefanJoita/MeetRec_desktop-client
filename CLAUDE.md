# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

MeetRec Desktop Client is an Electron + React + TypeScript desktop application that continuously records meeting room audio, encodes it to WAV, and uploads segments to a MeetRec server with offline queuing and retry.

## Commands

```bash
# Development
npm run dev              # Start all dev processes concurrently
npm run dev:renderer     # Vite dev server only (http://127.0.0.1:5173)
npm run dev:electron     # esbuild watch for Electron files only

# Type checking & build
npm run typecheck        # TypeScript type check
npm run build            # Full build (typecheck + Vite + Electron bundle)

# Distribution (Windows)
npm run dist:portable    # Build portable .exe
npm run dist:setup       # Build NSIS installer
npm run dist:all         # Build both variants
```

There are no test commands in this project.

## Architecture

### Process Model
```
Electron Main (electron/main.ts)
    ↓ IPC via window.meetrecDesktop (electron/preload.ts)
React Renderer (src/App.tsx)
    ↓ HTTP via axios
MeetRec Server (/api/v1/*)
```

### Electron Main Process (`electron/main.ts`)
Handles infrastructure concerns only:
- Settings persistence to `userData/client-settings.json`
- Upload queue management in `userData/upload-queue/` (JSON metadata + WAV files)
- IPC handlers exposed via two namespaces: `settings` and `queue`

### IPC Bridge (`electron/preload.ts`)
Context-isolated bridge that exposes `window.meetrecDesktop` to the renderer. TypeScript types are in `src/types/electron.d.ts`.

### React Renderer (`src/App.tsx`)
Currently monolithic (~1112 lines) containing all UI, state, and business logic:
- **Authentication**: login, session restore from localStorage, Bearer token management
- **Audio recording**: Web Audio API with ScriptProcessorNode → custom WAV encoder (44-byte header + PCM 16-bit mono, mixed to mono)
- **Queue**: segments are written to Electron queue via IPC; a 5-second polling loop retries failed uploads
- **Views**: login, overview (recorder controls), settings, account, queue, diagnostics

### HTTP API (`src/lib/api.ts`)
Thin axios wrapper for:
- `POST /api/v1/auth/login` — authentication
- `GET /api/v1/auth/me` — session verification
- `POST /api/v1/inbox/upload` — multipart WAV upload

### Data Flow
1. Web Audio API captures microphone input
2. ScriptProcessorNode buffers PCM samples
3. On segment boundary, samples are WAV-encoded in the renderer
4. WAV blob + metadata JSON are sent to Electron main via IPC and saved to disk
5. Queue poller picks up segments and POSTs them to the server
6. Successfully uploaded segments are deleted from disk

## Key Design Notes

- **WAV encoding** is implemented manually in `App.tsx` — 44-byte header construction + 16-bit PCM conversion. Multi-channel audio is mixed down to mono before encoding.
- **Segment duration** is configurable (30s–3600s). The recorder splits continuous audio into fixed-length files.
- **Queue persistence** survives app restarts — uploads resume automatically on next launch.
- **Path alias**: `@/` maps to `src/` in both Vite and TypeScript configs.
- **refactor_plan.md** documents a planned (not yet implemented) decomposition of `App.tsx` into feature modules (auth, recorder, queue, settings, diagnostics).
