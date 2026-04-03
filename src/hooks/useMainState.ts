import { useCallback, useEffect, useReducer } from 'react'
import type {
  AuthUser,
  ClientSettings,
  QueueStats,
  SegmentRow,
  SessionStatePayload,
  StartSessionPayload,
} from '@/types/electron'

// ─── State shape ─────────────────────────────────────────────────────────────

export interface AppState {
  authLoading: boolean
  user: AuthUser | null
  token: string | null

  settingsLoading: boolean
  settings: ClientSettings

  session: SessionStatePayload

  queue: QueueStats
  queueItems: SegmentRow[]
  queueItemsLoading: boolean
}

const DEFAULT_SETTINGS: ClientSettings = {
  serverUrl: 'http://localhost:8080',
  roomName: 'Sala de sedinte',
  location: 'Sediu principal',
  segmentDurationSeconds: 300,
  setupComplete: false,
}

const DEFAULT_SESSION: SessionStatePayload = { state: 'idle' }

const DEFAULT_QUEUE: QueueStats = {
  total: 0,
  pending: 0,
  uploading: 0,
  completed: 0,
  errorCount: 0,
  isUploading: false,
}

const INITIAL_STATE: AppState = {
  authLoading: true,
  user: null,
  token: null,
  settingsLoading: true,
  settings: DEFAULT_SETTINGS,
  session: DEFAULT_SESSION,
  queue: DEFAULT_QUEUE,
  queueItems: [],
  queueItemsLoading: false,
}

// ─── Reducer ──────────────────────────────────────────────────────────────────

type Action =
  | { type: 'AUTH_RESOLVED'; user: AuthUser | null; token: string | null }
  | { type: 'AUTH_EXPIRED' }
  | { type: 'AUTH_USER_CHANGED'; user: AuthUser | null }
  | { type: 'SETTINGS_RESOLVED'; settings: ClientSettings }
  | { type: 'SESSION_CHANGED'; payload: SessionStatePayload }
  | { type: 'QUEUE_UPDATED'; payload: QueueStats }
  | { type: 'QUEUE_ITEMS_LOADING' }
  | { type: 'QUEUE_ITEMS_RESOLVED'; items: SegmentRow[] }

function reducer(state: AppState, action: Action): AppState {
  switch (action.type) {
    case 'AUTH_RESOLVED':
      return { ...state, authLoading: false, user: action.user, token: action.token }

    case 'AUTH_EXPIRED':
      return { ...state, user: null, token: null }

    case 'AUTH_USER_CHANGED':
      return { ...state, user: action.user }

    case 'SETTINGS_RESOLVED':
      return { ...state, settingsLoading: false, settings: action.settings }

    case 'SESSION_CHANGED':
      return { ...state, session: action.payload }

    case 'QUEUE_UPDATED':
      return { ...state, queue: action.payload }

    case 'QUEUE_ITEMS_LOADING':
      return { ...state, queueItemsLoading: true }

    case 'QUEUE_ITEMS_RESOLVED':
      return { ...state, queueItemsLoading: false, queueItems: action.items }

    default:
      return state
  }
}

// ─── Hook ─────────────────────────────────────────────────────────────────────

export function useMainState(): AppState & {
  login: (serverUrl: string, username: string, password: string) => Promise<string | null>
  logout: () => Promise<void>
  saveSettings: (s: Partial<ClientSettings>) => Promise<void>
  startSession: (payload: StartSessionPayload) => Promise<string | null>
  stopSession: () => Promise<void>
  refreshQueueItems: () => Promise<void>
  deleteSegment: (id: string) => Promise<void>
  retrySegment: (id: string) => Promise<void>
  pingServer: (url: string) => Promise<{ ok: boolean; latencyMs?: number; error?: string }>
} {
  const [state, dispatch] = useReducer(reducer, INITIAL_STATE)

  // Init: restore auth + load settings in parallel
  useEffect(() => {
    void Promise.all([
      window.meetrecDesktop.restoreAuth().then(result => {
        dispatch({
          type: 'AUTH_RESOLVED',
          user: result?.user ?? null,
          token: result?.token ?? null,
        })
      }),
      window.meetrecDesktop.getSettings().then(settings => {
        dispatch({ type: 'SETTINGS_RESOLVED', settings })
      }),
    ])
  }, [])

  // Subscribe to push events
  useEffect(() => {
    const cleanups: Array<() => void> = [
      window.meetrecDesktop.onAuthTokenExpired(() => {
        dispatch({ type: 'AUTH_EXPIRED' })
      }),

      window.meetrecDesktop.onAuthUserChanged(payload => {
        dispatch({ type: 'AUTH_USER_CHANGED', user: payload?.user ?? null })
      }),

      window.meetrecDesktop.onSessionStateChanged(payload => {
        dispatch({ type: 'SESSION_CHANGED', payload })
      }),

      window.meetrecDesktop.onQueueUpdated(payload => {
        if (payload) {
          dispatch({ type: 'QUEUE_UPDATED', payload })
        }
      }),

      // capture:start / capture:stop are handled by useCapture — no state change here
      window.meetrecDesktop.onCaptureStart(() => undefined),
      window.meetrecDesktop.onCaptureStop(() => undefined),
    ]

    return () => cleanups.forEach(fn => fn())
  }, [])

  // ─── Commands ───────────────────────────────────────────────────────────────

  const login = useCallback(
    async (serverUrl: string, username: string, password: string): Promise<string | null> => {
      const result = await window.meetrecDesktop.login(serverUrl, username, password)
      if (result.ok) {
        dispatch({ type: 'AUTH_RESOLVED', user: result.user, token: result.token })
        return null
      }
      return result.error
    },
    [],
  )

  const logout = useCallback(async (): Promise<void> => {
    await window.meetrecDesktop.logout()
    dispatch({ type: 'AUTH_EXPIRED' })
  }, [])

  const saveSettings = useCallback(async (updates: Partial<ClientSettings>): Promise<void> => {
    const saved = await window.meetrecDesktop.saveSettings(updates)
    dispatch({ type: 'SETTINGS_RESOLVED', settings: saved })
  }, [])

  const startSession = useCallback(
    async (payload: StartSessionPayload): Promise<string | null> => {
      const result = await window.meetrecDesktop.startSession(payload)
      if ('error' in result) return result.error
      return null
    },
    [],
  )

  const stopSession = useCallback(async (): Promise<void> => {
    await window.meetrecDesktop.stopSession()
  }, [])

  const refreshQueueItems = useCallback(async (): Promise<void> => {
    dispatch({ type: 'QUEUE_ITEMS_LOADING' })
    const items = await window.meetrecDesktop.listQueue()
    dispatch({ type: 'QUEUE_ITEMS_RESOLVED', items })
  }, [])

  const deleteSegment = useCallback(async (id: string): Promise<void> => {
    await window.meetrecDesktop.deleteSegment(id)
    await refreshQueueItems()
  }, [refreshQueueItems])

  const retrySegment = useCallback(async (id: string): Promise<void> => {
    await window.meetrecDesktop.retrySegment(id)
    await refreshQueueItems()
  }, [refreshQueueItems])

  const pingServer = useCallback(
    (url: string) => window.meetrecDesktop.pingServer(url),
    [],
  )

  return {
    ...state,
    login,
    logout,
    saveSettings,
    startSession,
    stopSession,
    refreshQueueItems,
    deleteSegment,
    retrySegment,
    pingServer,
  }
}
