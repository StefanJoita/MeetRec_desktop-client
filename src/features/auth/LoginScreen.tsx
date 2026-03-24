import { useState } from 'react'
import type { FormEvent } from 'react'
import { CircleAlert, LogIn } from 'lucide-react'

type Props = {
  serverUrl: string
  loading: boolean
  error: string
  mustChangePassword: boolean
  onLogin: (username: string, password: string) => Promise<boolean>
}

export function LoginScreen({ serverUrl, loading, error, mustChangePassword, onLogin }: Props) {
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    await onLogin(username, password)
    setPassword('')
  }

  return (
    <main className="login-shell">
      <section className="login-card card">
        <p className="eyebrow">MeetRec Room Client</p>
        <h1>Conectare</h1>

        <p style={{ color: '#7a9a8a', fontSize: '0.88rem', margin: '0 0 16px' }}>
          Server: <strong style={{ color: '#adc1b4' }}>{serverUrl}</strong>
        </p>

        {mustChangePassword ? (
          <div className="message message-warning" style={{ marginBottom: 14 }}>
            <CircleAlert size={18} style={{ flexShrink: 0, marginTop: 2 }} />
            <div>
              <strong>Schimbare parolă necesară</strong>
              <p>Contul tău necesită o nouă parolă. Deschide aplicația web MeetRec, setează o parolă nouă, apoi revino aici.</p>
            </div>
          </div>
        ) : error ? (
          <div className="message message-error" style={{ marginBottom: 14 }}>
            <CircleAlert size={18} style={{ flexShrink: 0 }} />
            <span>{error}</span>
          </div>
        ) : null}

        <form className="stack-form" onSubmit={e => void handleSubmit(e)}>
          <label>
            <span>Username</span>
            <input
              value={username}
              onChange={e => setUsername(e.target.value)}
              placeholder="operator.sala"
              disabled={loading}
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
              disabled={loading}
              autoComplete="current-password"
            />
          </label>
          <button
            className="primary-button"
            type="submit"
            disabled={loading || !username.trim() || !password}
          >
            <LogIn size={18} />
            {loading ? 'Se conectează...' : 'Conectare'}
          </button>
        </form>
      </section>
    </main>
  )
}
