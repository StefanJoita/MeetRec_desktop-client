import { useState } from 'react'
import type { FormEvent } from 'react'
import { CircleAlert, LogIn } from 'lucide-react'
import type { ClientSettings } from '@/types/electron'

interface Props {
  onLogin: (serverUrl: string, username: string, password: string) => Promise<string | null>
  settings: ClientSettings
  error: string
  loading: boolean
}

export function LoginScreen({ onLogin, settings, error, loading }: Props) {
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [localError, setLocalError] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setLocalError('')
    setIsSubmitting(true)
    try {
      const result = await onLogin(settings.serverUrl, username, password)
      if (result !== null) {
        setLocalError(result)
      }
    } finally {
      setPassword('')
      setIsSubmitting(false)
    }
  }

  const displayError = localError || error

  return (
    <main className="login-shell">
      <section className="login-card card">
        <p className="eyebrow">MeetRec Room Client</p>
        <h1>Conectare</h1>

        <p style={{ color: '#7a9a8a', fontSize: '0.88rem', margin: '0 0 16px' }}>
          Server: <strong style={{ color: '#adc1b4' }}>{settings.serverUrl}</strong>
        </p>

        {displayError && (
          <div className="message message-error" style={{ marginBottom: 14 }}>
            <CircleAlert size={18} style={{ flexShrink: 0 }} />
            <span>{displayError}</span>
          </div>
        )}

        <form className="stack-form" onSubmit={e => void handleSubmit(e)}>
          <label>
            <span>Username</span>
            <input
              value={username}
              onChange={e => setUsername(e.target.value)}
              placeholder="operator.sala"
              disabled={isSubmitting || loading}
              autoComplete="username"
              autoFocus
            />
          </label>
          <label>
            <span>Parolă</span>
            <input
              type="password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              placeholder="••••••••"
              disabled={isSubmitting || loading}
              autoComplete="current-password"
            />
          </label>
          <button
            className="primary-button"
            type="submit"
            disabled={isSubmitting || loading || !username.trim() || !password}
          >
            <LogIn size={18} />
            {isSubmitting || loading ? 'Se conectează...' : 'Conectare'}
          </button>
        </form>
      </section>
    </main>
  )
}
