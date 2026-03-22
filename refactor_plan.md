# Refactor Plan

## Obiectiv
Transformarea clientului desktop dintr-un renderer React monolitic intr-o aplicatie modulara, usor de extins si testat, pastrand arhitectura buna deja existenta: Electron main process + preload bridge + React renderer.

## Directie recomandata
- pastram Electron pentru infrastructura desktop
- pastram React pentru UI
- introducem un strat clar de application/services intre UI si infrastructura
- reorganizam frontend-ul pe feature-uri, nu intr-un singur App.tsx mare
- pastram IPC ca granita clara intre renderer si capabilitatile native

## Arhitectura recomandata

### 1. Electron shell
Responsabilitati:
- creare si configurare fereastra desktop
- filesystem local
- persistenta setari
- persistenta coada upload
- executie upload catre server
- expunere IPC handlers

Fisiere relevante:
- electron/main.ts
- electron/preload.ts

Regula:
- Electron ramane strat de infrastructura, nu loc pentru logica de UI.

### 2. Application layer in renderer
Acesta este stratul care lipseste clar in forma actuala.

Responsabilitati:
- orchestrarea sesiunii de autentificare
- start/stop recording
- validarea fluxurilor
- polling si retry pentru coada de upload
- reguli de rol
- coordonarea intre UI, API HTTP si IPC bridge

Scop:
- componentele UI sa nu cheme direct peste tot window.meetrecDesktop sau API-uri HTTP.

### 3. Presentation layer
Componente React orientate strict pe UI.

Exemple:
- LoginScreen
- OperatorScreen
- AdminScreen
- ParticipantBlockedScreen
- StartMeetingModal
- StopRecordingModal
- QueueList
- DiagnosticsPanel
- SettingsForm

Regula:
- componentele de prezentare primesc props si emit actiuni; nu contin logica de business complexa.

### 4. Services
Servicii pure, fara JSX.

Exemple:
- auth-service.ts
- recorder-service.ts
- queue-service.ts
- settings-service.ts

Responsabilitati:
- reguli de business
- coordonare cu infrastructura
- validari si mapari de date

### 5. Infrastructure adapters
Adaptoare pentru dependinte externe.

Exemple:
- auth-api.ts
- http-client.ts
- desktop-bridge.ts
- session-storage.ts

Responsabilitati:
- apeluri HTTP
- acces la window.meetrecDesktop
- persistere token in localStorage

## Flux recomandat

```text
UI Component
-> Feature Controller / Hook
-> Service
-> Infrastructure Adapter
-> Electron IPC sau HTTP API
```

Exemple:

### Login
```text
LoginForm
-> useAuthController
-> authService.login()
-> authApi.login() + authApi.getMe()
-> auth state update
```

### Recording
```text
StartMeetingModal
-> useRecorderController
-> recorderService.startSession()
-> MediaRecorder produce chunks
-> queueService.enqueueChunk()
-> desktopBridge.queue.enqueue()
```

### Upload sync
```text
useQueueSync
-> queueService.drain()
-> desktopBridge.queue.list/upload/delete()
```

## Structura de foldere recomandata

```text
src/
  app/
    AppShell.tsx
    providers.tsx
    routes.tsx

  features/
    auth/
      components/
      hooks/
      auth-service.ts
      auth-store.ts
      auth-types.ts

    recorder/
      components/
      hooks/
      recorder-service.ts
      recorder-store.ts
      recorder-types.ts

    queue/
      components/
      hooks/
      queue-service.ts
      queue-store.ts
      queue-types.ts

    settings/
      components/
      hooks/
      settings-service.ts
      settings-store.ts

    diagnostics/
      components/
      diagnostics-service.ts

  shared/
    components/
    hooks/
    lib/
    utils/

  infrastructure/
    api/
      http-client.ts
      auth-api.ts
    electron/
      desktop-bridge.ts
    storage/
      session-storage.ts
```

## Ce trebuie extras din App.tsx

### 1. Auth
Mutat intr-un modul separat:
- login
- restore session
- logout
- must_change_password
- derivarea rolului

### 2. Recorder
Mutat intr-un modul separat:
- acces microfon
- MediaRecorder
- segmentare
- start/stop
- timer
- metadata pentru sesiune

### 3. Queue sync
Mutat intr-un modul separat:
- listare coada
- polling
- retry upload
- tratare 401
- refresh queue

### 4. Settings
Mutat intr-un modul separat:
- load/save settings
- selectie device
- validari configurare

### 5. Layout si navigatie
Mutat in componente dedicate:
- admin shell
- operator shell
- participant blocked shell
- sidebar
- view switcher

## State management recomandat
Pentru dimensiunea actuala a aplicatiei, recomandare pragmatica:
- useState si useReducer local pe feature
- Context doar pentru stari globale mici
- fara Redux in aceasta etapa

Candidati buni pentru context sau compunere centrala:
- sesiune autentificare
- setari curente
- stare recorder

## Reguli de proiectare
- UI nu interactioneaza direct cu IPC peste tot
- serviciile nu contin JSX
- componentele de prezentare nu contin logica de business complexa
- Electron main ramane infrastructura
- preload expune contracte IPC clare si tipate
- modulele sunt organizate pe domeniu functional, nu pe tip de fisier global

## Ce trebuie evitat
- un nou fisier gigant in locul lui App.tsx
- apeluri window.meetrecDesktop raspandite in toate componentele
- logica de auth amestecata cu logica de recording
- state global excesiv
- routing mai complex decat e nevoie pentru un client desktop mic

## Plan de refactor in etape

### Etapa 1. Extrage infrastructura renderer
Creeaza:
- src/infrastructure/api/http-client.ts
- src/infrastructure/api/auth-api.ts
- src/infrastructure/electron/desktop-bridge.ts
- src/infrastructure/storage/session-storage.ts

Rezultat:
- App.tsx nu mai depinde direct de axios, localStorage si window.meetrecDesktop.

### Etapa 2. Extrage serviciile
Creeaza:
- src/features/auth/auth-service.ts
- src/features/recorder/recorder-service.ts
- src/features/queue/queue-service.ts
- src/features/settings/settings-service.ts

Rezultat:
- logica de business devine reutilizabila si testabila.

### Etapa 3. Extrage hook-urile orchestratoare
Creeaza:
- src/features/auth/hooks/useAuthController.ts
- src/features/recorder/hooks/useRecorderController.ts
- src/features/queue/hooks/useQueueSync.ts
- src/features/settings/hooks/useSettingsController.ts

Rezultat:
- App.tsx pierde logica de orchestrare si ramane shell de compunere.

### Etapa 4. Extrage ecranele si componentele majore
Creeaza:
- LoginScreen
- OperatorScreen
- AdminScreen
- ParticipantBlockedScreen
- modalurile
- panourile de settings, queue si diagnostics

Rezultat:
- UI devine mai usor de inteles si modificat.

### Etapa 5. Reduce App.tsx la AppShell
App.tsx sau AppShell.tsx ar trebui sa faca doar:
- bootstrapping aplicatie
- alegerea ecranului in functie de sesiune si rol
- compunerea providerelor si layout-ului principal

Rezultat:
- renderer curat, modular, predictibil.

## Rezultatul final dorit
Arhitectura finala recomandata este:
- Electron main = infrastructura desktop
- Preload = bridge IPC sigur si tipat
- React renderer = UI modular pe feature-uri
- Services = logica de business
- Infrastructure adapters = HTTP, IPC, storage
- App shell = compunere, nu logica grea

## Beneficii asteptate
- cod mai usor de mentinut
- separare clara a responsabilitatilor
- refactoruri mai sigure
- testare mai usoara
- scalare mai buna a functionalitatilor viitoare
- reducerea riscului de regresii in App.tsx
