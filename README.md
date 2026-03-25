# MeetRec Desktop Client

Client desktop pentru calculatorul din sala de ședințe. Aplicația captează audio de la microfonul local, segmentează înregistrarea în bucăți fixe și trimite fiecare segment către serverul MeetRec prin API-ul existent.

## Ce face aplicația

- setup wizard la prima pornire: configurare server, sală și permisiune microfon
- login cu user și parolă prin `/api/v1/auth/login`, restore automată a sesiunii
- înregistrare continuă pe segmente (WAV PCM 16-bit, mono)
- fiecare sesiune de înregistrare primește un `session_id` unic — toate segmentele aceleiași ședințe sunt grupate pe server ca o singură înregistrare
- după confirmarea ultimului segment, trimite explicit `POST /api/v1/inbox/session/{id}/complete` pentru a declanșa imediat transcrierea fără a aștepta timeout-ul serverului
- răspunsul 409 de la `/session/complete` este tratat ca succes (sesiunea a fost deja dispecerizată)
- coadă locală persistentă pe disc pentru segmentele netrimise; fișierele `.scomplete` de control sunt excluse din operațiunile de patch pentru a evita coruperea lor
- retry automat la upload la fiecare 5 secunde
- interfață separată pentru rolul operator (simplu: start/stop) și admin (configurare completă)
- test conexiune server și test microfon din setări

## Structură

```text
electron/
  main.ts          — process principal: filesystem, IPC, upload HTTP
  preload.ts       — bridge IPC tipat

src/
  app/
    AppShell.tsx   — routing bazat pe stare (setup / login / rol)
  features/
    auth/          — login, restore sesiune, logout
    recorder/      — Web Audio API, encoding WAV, segmentare
    queue/         — polling coadă, retry upload
    settings/      — load/save setări
    setup/         — wizard prima pornire
  screens/
    OperatorScreen.tsx
    AdminScreen.tsx
    ParticipantBlockedScreen.tsx
  shared/
    hooks/useDevices.ts   — permisiune microfon + enumerare dispozitive
  infrastructure/
    api/           — auth-api, http-client
    desktop-bridge.ts
    session-storage.ts
```

## Cerințe locale

- Node.js 20+
- npm 10+
- Windows 10/11

## Comenzi

```powershell
# Prima rulare
npm install

# Development
$env:Path = "C:\Program Files\nodejs;" + $env:Path
npm run dev
```

Build distribuție Windows:

```powershell
npm run dist:portable   # executabil portabil
npm run dist:setup      # installer NSIS
npm run dist:all        # ambele variante
```

Artefactele se generează în `release/`.

## Flux operațional

1. La prima pornire, wizard-ul ghidează configurarea: URL server → nume sală → permisiune microfon.
2. Aplicația restaurează automat sesiunea anterioară la repornire.
3. Operatorul pornește înregistrarea, introduce titlul ședinței și participanții.
4. Aplicația înregistrează continuu și taie segmente la intervalul configurat (implicit 5 minute).
5. Fiecare segment e salvat local cu `session_id` și `segment_index`, apoi trimis automat la server.
6. Dacă serverul nu răspunde, segmentele rămân pe disc și se retrimite automat.
7. La confirmarea ultimului segment, aplicația apelează `POST /session/complete` — serverul asamblează imediat toate segmentele și pornește transcrierea Whisper.

## API server — câmpuri trimise la upload

`POST /api/v1/inbox/upload` — `multipart/form-data`:

| Câmp | Descriere |
|------|-----------|
| `file` | fișier WAV |
| `title` | titlul ședinței |
| `meeting_date` | data ședinței (YYYY-MM-DD) |
| `location` | locația |
| `participants` | participanți separați prin virgulă |
| `description` | `Inregistrare automata — <nume sală>` |
| `session_id` | UUID unic per sesiune de înregistrare |
| `segment_index` | ordinea segmentului (0, 1, 2...) |

`session_id` și `segment_index` permit serverului să grupeze toate segmentele aceleiași ședințe ca o singură înregistrare.

### Semnalizare finalizare sesiune

`POST /api/v1/inbox/session/{session_id}/complete` — `application/json`:

```json
{ "session_id": "uuid" }
```

Apelat automat după ce ultimul segment a fost confirmat de server. Răspunsul 409 (sesiune deja dispecerizată) este tratat ca succes.

## Limitări curente

- pornirea automată cu Windows nu este implementată încă
- upload-ul continuă doar cât timp aplicația rămâne deschisă
- fără autentificare dedicată de dispozitiv (folosește user/parolă)

## Pași următori recomandați

- cheie dedicată de dispozitiv în loc de user/parolă
- auto-start la boot și minimizare în system tray
- jurnal local de evenimente
