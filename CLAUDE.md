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
React Renderer (src/app/AppShell.tsx)
    ↓ HTTP via axios
MeetRec Server (/api/v1/*)
```

### Electron Main Process (`electron/main.ts`)
Handles infrastructure concerns only:
- Settings persistence to `userData/client-settings.json`
- Upload queue management in `userData/upload-queue/` (JSON metadata + WAV files)
- IPC handlers exposed via two namespaces: `settings` and `queue`

### IPC Bridge (`electron/preload.ts`)
Context-isolated bridge exposing `window.meetrecDesktop` to the renderer. TypeScript types in `src/types/electron.d.ts`. The renderer accesses it only through `src/infrastructure/desktop-bridge.ts`.

### React Renderer — Feature Architecture
Entry point is `src/main.tsx` → `src/app/AppShell.tsx`. The app is decomposed into feature modules:

```
src/
  app/AppShell.tsx              # Root component: composes all hooks and routes to screens
  features/
    auth/
      hooks/useAuth.ts          # Login, session restore, logout state
      LoginScreen.tsx           # Login UI
    recorder/
      hooks/useRecorder.ts      # Web Audio API, WAV encoding, segment dispatch
    queue/
      hooks/useQueueSync.ts     # 5s polling loop, upload retry, queue state
    settings/
      hooks/useSettings.ts      # Load/save settings via IPC
    setup/
      SetupWizard.tsx           # First-run wizard (server URL, room, microphone)
      hooks/useSetupFlow.ts
  screens/
    OperatorScreen.tsx          # Simplified recorder UI for operator role
    AdminScreen.tsx             # Full UI: recorder + settings + queue + diagnostics
    ParticipantBlockedScreen.tsx
  infrastructure/
    desktop-bridge.ts           # Thin wrapper around window.meetrecDesktop IPC
    session-storage.ts          # localStorage wrapper for token persistence
    api/
      auth-api.ts               # login(), getMe(), testConnection()
      http-client.ts            # apiBase() URL helper + normalizeServerUrl()
  shared/
    hooks/useDevices.ts         # Microphone device enumeration + permission
```

### Role-Based Routing (`AppShell.tsx`)
After login, `getUserRole(user)` maps the server-side user object to one of three roles:
- `admin` → `AdminScreen` (full access: recorder + all settings tabs)
- `operator` → `OperatorScreen` (recorder only, no settings)
- `participant` → `ParticipantBlockedScreen` (no access)

### HTTP API (`src/infrastructure/api/auth-api.ts`)
- `POST /api/v1/auth/login` — returns JWT
- `GET /api/v1/auth/me` — session verification + user profile
- `POST /api/v1/inbox/upload` — multipart WAV upload (handled in Electron main via queue)

### Data Flow
1. Web Audio API captures microphone input (`useRecorder`)
2. ScriptProcessorNode buffers PCM samples; on segment boundary, samples are WAV-encoded
3. WAV blob + metadata JSON are sent to Electron main via `desktopBridge.queue.enqueue()`
4. `useQueueSync` polls every 5 seconds and calls `desktopBridge.queue.upload()` per item
5. Electron main POSTs to the server; successfully uploaded segments are deleted from disk

## Key Design Notes

- **WAV encoding** is in `useRecorder` — 44-byte header + 16-bit PCM, multi-channel mixed to mono.
- **Segment duration** is configurable (30s–3600s) via settings.
- **Queue persistence** survives app restarts — uploads resume automatically on next launch.
- **Path alias**: `@/` maps to `src/` in both Vite and TypeScript configs.
- **`testConnection()`** in `auth-api.ts` uses a probe request to `GET /auth/me` with a dummy token; a 401 or 403 response counts as "server reachable".
