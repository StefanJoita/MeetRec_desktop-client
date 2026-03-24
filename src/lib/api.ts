// Acest fișier e păstrat pentru compatibilitate cu App.tsx existent.
// Logica nouă folosește src/infrastructure/api/
export { login, getMe, testConnection } from '@/infrastructure/api/auth-api'
export { normalizeServerUrl } from '@/infrastructure/api/http-client'
export type { AuthUser, TokenResponse } from '@/infrastructure/api/auth-api'
