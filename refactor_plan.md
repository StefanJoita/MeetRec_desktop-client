# Refactor Plan — MeetRec Desktop Client

## Probleme identificate în forma actuală

### Funcționale
1. **Permisiune microfon nu se cere explicit** — `refreshDevices()` la init nu face `getUserMedia`, deci device ID-urile sunt goale sau invalide; prima înregistrare eșuează cu "Requested device not found"
2. **Device ID invalid la start** — auto-selecția primului device ID din listă se face fără permisiune; ID-ul poate fi fantomă (dispozitiv enumerat dar inaccesibil)
3. **Nu există flux de setup la prima pornire** — dacă serverul e `localhost:8080` și sala nu e configurată, utilizatorul nu știe ce să facă
4. **Operatorul nu vede statusul upload-ului** — view-ul de operator are upload status bar, dar nu are acces la coadă sau diagnostice
5. **`segmentIndex` în `SessionMeetingMeta`** — câmpul e redundant (valoarea reală e în `segmentIndexRef`); tipul e înșelător

### Arhitecturale
6. **App.tsx monolitic** — 1100+ linii, amestecă auth, recorder, queue, settings, UI, toate în același component
7. **UI accesează direct `window.meetrecDesktop` și `localStorage`** — zero separare între prezentare și infrastructură
8. **Logica de business e în handlers inline** — imposibil de testat sau reutilizat

---

## Flux de utilizare optim (redesign UX)

### Stări globale ale aplicației (în ordine)

```
SETUP (prima pornire)
  → server URL + test conexiune
  → configurare sală + locație
  → cerere permisiune microfon
  → gata

LOGIN
  → username + parolă
  → restore automată din sesiune salvată

BLOCAT (rol participant)

OPERATOR
  → un singur ecran: start/stop + status

ADMIN
  → sidebar + panou principal + navigare
```

### Flux detaliat

#### Prima pornire (setup wizard)
Detectat când: `settings.serverUrl === 'http://localhost:8080'` și nu există sesiune salvată.

**Pasul 1 — Server**
- Input URL server
- Buton "Testează conexiunea" → GET /api/v1/health sau /api/v1/auth/me cu token fals (așteptat 401)
- Feedback vizibil: conectat / eroare rețea
- Buton "Continuă" activ doar după test reușit

**Pasul 2 — Sală**
- Input: Nume sală (obligatoriu)
- Input: Locație (opțional)
- Input: Durată segment (default 300s, slider sau input numeric)

**Pasul 3 — Microfon**
- Explicație clară: "Aplicația are nevoie de acces la microfon pentru a înregistra"
- Buton mare: "Acordă acces la microfon"
- După permisiune: listează dispozitivele disponibile și permite selecția
- Dacă permisiunea e refuzată: instrucțiuni cum să o acorde din Windows

#### Reporniri normale
- Auto-restore sesiune din localStorage
- Dacă sesiunea e validă → direct la ecranul de rol
- Dacă sesiunea a expirat → ecran login cu mesaj "Sesiunea a expirat"
- Cererea permisiunii de microfon se face silențios la pornire; dacă e refuzată, se arată banner de avertizare

#### Ecranul operator (simplificat)
```
┌─────────────────────────────────────┐
│  MeetRec · Sala de ședințe          │
│  [operator.sala]          [Logout]  │
├─────────────────────────────────────┤
│                                     │
│     [icon microfon / animație]      │
│                                     │
│     In asteptare / ÎNREGISTREAZĂ    │
│          00:12:34                   │
│     Titlu ședință                   │
│     Participanți                    │
│                                     │
│     [  Începe ședința  ] sau        │
│     [  Încheie ședința ]            │
│                                     │
│  [erori dacă există]                │
├─────────────────────────────────────┤
│  ● Toate segmentele trimise         │  ← status bar upload
└─────────────────────────────────────┘
```

- **Nu există navigare** — operatorul nu are de-a face cu setări sau coadă
- Eroarea de microfon apare cu buton "Reîncearcă" care re-solicită permisiunea
- Status bar upload vizibil permanent

#### Ecranul admin
- Sidebar cu: Panou, Configurare, Cont, Coadă upload, Diagnostic
- Panoul principal identic cu cel de operator (start/stop recording)
- Configurare: server, sală, locație, durată segment, selecție microfon cu test live
- Coadă: lista segmentelor cu posibilitate de ștergere manuală
- Diagnostic: stare sistem, versiune, format audio, device activ

#### Cerere permisiune microfon — reguli
1. La init app: `navigator.permissions.query({ name: 'microphone' })` — verifică fără a cere
2. Dacă `state === 'granted'` → `refreshDevices(true)` silențios
3. Dacă `state === 'prompt'` → arată banner "Acordă acces la microfon" cu buton explicit
4. Dacă `state === 'denied'` → arată mesaj de eroare permanent cu instrucțiuni Windows
5. Înainte de `startRecording()` → verifică din nou; dacă nu e granted, oprește cu mesaj clar
6. La selectarea unui device în Settings → testează imediat cu `getUserMedia({ deviceId: { exact } })` scurt

---

## Arhitectura țintă

### Strat Electron (neschimbat ca responsabilități)
```
electron/main.ts     — filesystem, IPC handlers, upload HTTP
electron/preload.ts  — bridge IPC tipat
```

### Strat renderer

```
src/
  infrastructure/
    desktop-bridge.ts      — wrapper tipat peste window.meetrecDesktop
    session-storage.ts     — localStorage abstraction
    api/
      http-client.ts
      auth-api.ts

  features/
    setup/
      SetupWizard.tsx
      hooks/useSetupFlow.ts

    auth/
      LoginScreen.tsx
      hooks/useAuth.ts
      auth-service.ts

    recorder/
      hooks/useRecorder.ts
      recorder-service.ts   — Web Audio API, WAV encoding, segmentare

    queue/
      hooks/useQueueSync.ts
      QueuePanel.tsx

    settings/
      SettingsForm.tsx
      hooks/useSettings.ts
      mic-permission.ts     — logica permisiune microfon

    diagnostics/
      DiagnosticsPanel.tsx

  screens/
    OperatorScreen.tsx
    AdminScreen.tsx
    ParticipantBlockedScreen.tsx

  shared/
    components/
      StatusBar.tsx
      ErrorBanner.tsx
      MicPermissionBanner.tsx
    hooks/
      useDevices.ts         — enumerare device-uri + listener devicechange

  app/
    AppShell.tsx            — routing bazat pe stare: setup / login / rol
    AppProviders.tsx
```

### Flux de date

```
UI Component
  → custom hook (useRecorder, useAuth, useSettings)
    → service (recorder-service, auth-service)
      → infrastructure adapter (desktop-bridge, auth-api, session-storage)
        → Electron IPC sau HTTP
```

**Regulă strictă**: niciun component UI nu importă direct `window.meetrecDesktop`, `axios`, sau `localStorage`.

---

## Modificări necesare față de planul inițial

### Adăugat față de v1

**A. Permisiune microfon ca feature de sine stătător**
- `src/features/settings/mic-permission.ts` — state machine: `unknown → checking → granted / prompt / denied`
- `MicPermissionBanner` — component persistent când permisiunea nu e granted
- Verificare permisiune înainte de `startRecording()`, nu doar la init

**B. Setup wizard**
- `src/features/setup/SetupWizard.tsx` — 3 pași: server, sală, microfon
- Detectat automat la prima pornire
- Salvează setările și marchează setup ca finalizat (`settings.setupComplete: boolean`)

**C. Modificare `ClientSettings`**
```typescript
type ClientSettings = {
  serverUrl: string
  roomName: string
  location: string
  segmentDurationSeconds: number
  setupComplete: boolean   // ← nou
}
```

**D. Curățare `SessionMeetingMeta`**
- Eliminat `segmentIndex` din tip (rămâne doar în `segmentIndexRef` din recorder)
- `sessionId` rămâne — generat la `startRecording()`, nu la construirea obiectului form

**E. Test conexiune server**
- `auth-api.ts` — funcție `testConnection(serverUrl)` → boolean
- Folosită în Setup wizard și în Settings form

**F. Test microfon în Settings**
- La selectarea unui device nou → `getUserMedia` scurt → feedback imediat "Funcționează" / eroare

**G. Error recovery în recorder**
- La eroare "NotFoundError" (device lipsă) → buton "Schimbă microfonul" direct din ecranul operator
- La eroare "NotAllowedError" (permisiune refuzată) → buton "Acordă permisiunea"

### Modificat față de v1

- `useRecorderController` → `useRecorder` — elimină `segmentIndex` din meta, îl gestionează intern
- `useSettingsController` → `useSettings` — include logica de permisiune microfon
- `AdminScreen` preia controlul recording din sidebar (ca acum), nu dintr-un panou separat

---

## Plan de implementare în etape

### Etapa 1 — Infrastructură renderer
Fișiere noi:
- `src/infrastructure/desktop-bridge.ts`
- `src/infrastructure/session-storage.ts`
- `src/infrastructure/api/http-client.ts`
- `src/infrastructure/api/auth-api.ts` (+ `testConnection`)

Rezultat: App.tsx nu mai accesează direct `window.meetrecDesktop`, `axios`, `localStorage`.

### Etapa 2 — Feature hooks
Fișiere noi:
- `src/shared/hooks/useDevices.ts`
- `src/features/settings/mic-permission.ts`
- `src/features/auth/hooks/useAuth.ts`
- `src/features/recorder/hooks/useRecorder.ts`
- `src/features/queue/hooks/useQueueSync.ts`
- `src/features/settings/hooks/useSettings.ts`

Rezultat: toată logica din App.tsx extrasă în hooks; App.tsx devine orchestrator pur.

### Etapa 3 — Setup wizard
Fișiere noi:
- `src/features/setup/SetupWizard.tsx`
- `src/features/setup/hooks/useSetupFlow.ts`

Modificări:
- `ClientSettings` primește `setupComplete`
- `electron/main.ts` actualizat cu noul câmp
- `AppShell` rutează la SetupWizard dacă `!settings.setupComplete`

### Etapa 4 — Ecrane și componente
Fișiere noi:
- `src/screens/OperatorScreen.tsx`
- `src/screens/AdminScreen.tsx`
- `src/screens/ParticipantBlockedScreen.tsx`
- `src/shared/components/MicPermissionBanner.tsx`
- `src/shared/components/StatusBar.tsx`
- `src/features/auth/LoginScreen.tsx`
- `src/features/queue/QueuePanel.tsx`
- `src/features/diagnostics/DiagnosticsPanel.tsx`
- `src/features/settings/SettingsForm.tsx`

### Etapa 5 — AppShell curat
`src/app/AppShell.tsx`:
```
setup incomplete → SetupWizard
no session       → LoginScreen
participant      → ParticipantBlockedScreen
operator         → OperatorScreen
admin            → AdminScreen
```

App.tsx devine wrapper minim sau dispare complet.

---

## Ce NU se schimbă
- Electron main process (logica de queue, upload, settings persistence)
- IPC bridge (preload.ts)
- WAV encoding (mutat în `recorder-service.ts`, logic identic)
- Segmentarea audio (mutat în `useRecorder`, comportament identic)
- Câmpurile trimise la server (`session_id`, `segment_index` rămân)
