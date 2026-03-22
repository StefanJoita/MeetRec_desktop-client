# MeetRec Desktop Client

Client desktop pentru calculatorul din sala de sedinte. Aplicatia capteaza audio de la microfonul local, segmenteaza inregistrarea in bucati fixe si trimite fiecare segment catre serverul MeetRec prin API-ul existent.

## Ce face MVP-ul

- login cu user si parola prin `/api/v1/auth/login`
- verificare sesiune prin `/api/v1/auth/me`
- inregistrare continua pe segmente prin `MediaRecorder`
- coada locala persistenta pe disc pentru segmentele netrimise
- retry automat la upload catre `/api/v1/inbox/upload`
- configurare pentru URL server, nume sala, locatie si durata segmentului
- selectie de microfon din dispozitivele disponibile pe calculator

## Structura

```text
desktop-client/
├── electron/
│   ├── main.ts
│   └── preload.ts
├── src/
│   ├── App.tsx
│   ├── index.css
│   ├── main.tsx
│   ├── lib/api.ts
│   └── types/electron.d.ts
├── index.html
├── package.json
├── tsconfig.json
├── tsconfig.node.json
└── vite.config.ts
```

## Cerinte locale

- Node.js 20+
- npm 10+
- Windows 10/11 pentru rularea initiala in sala

## Comenzi

```powershell
Set-Location .\desktop-client
npm install
npm run dev
```

Pentru build portabil Windows:

```powershell
Set-Location .\desktop-client
npm run dist:portable
```

Pentru setup cu interfata grafica (wizard Next/Install/Finish):

```powershell
Set-Location .\desktop-client
npm run dist:setup
```

Pentru ambele variante (portable + setup):

```powershell
Set-Location .\desktop-client
npm run dist:all
```

Artefactele se genereaza in `desktop-client/release/`.

- varianta portabila: executabil direct
- varianta setup: `MeetRec-Room-Client-Setup-<versiune>.exe`

## Flux operational

1. Operatorul configureaza URL-ul serverului si datele salii.
2. Clientul se autentifica cu un cont existent din MeetRec.
3. La pornirea recorderului, aplicatia creeaza segmente audio locale la intervalul configurat.
4. Fiecare segment este salvat in coada locala si apoi trimis automat la server.
5. Daca serverul nu raspunde, segmentele raman pe disc si se reincarca la urmatorul ciclu de retry.

## Limitari curente

- pornirea automata cu Windows nu este implementata inca
- sesiunea este pastrata local, dar credentialele nu sunt memorate
- pentru MVP, upload-ul continua doar cat timp aplicatia ramane deschisa
- titlurile segmentelor sunt generate automat din numele salii si timestamp

## Urmatorii pasi recomandati

- cheie dedicata de dispozitiv in loc de user/parola
- auto-start la boot si minimizare in system tray
- health checks pentru microfon si server
- jurnal local de evenimente si ecran de diagnostics