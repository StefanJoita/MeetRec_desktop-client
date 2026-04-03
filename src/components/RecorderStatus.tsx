import type { SessionStatePayload } from '@/types/electron'

function formatElapsed(seconds: number): string {
  const h = Math.floor(seconds / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  const s = seconds % 60
  const hh = h > 0 ? `${String(h).padStart(2, '0')}:` : ''
  return `${hh}${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
}

interface Props {
  session: SessionStatePayload
}

export function RecorderStatus({ session }: Props) {
  if (session.state === 'idle') return null

  if (session.state === 'stopping') {
    return (
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <span
          style={{
            display: 'inline-block',
            width: 16,
            height: 16,
            borderRadius: '50%',
            border: '2px solid #a5b4fc',
            borderTopColor: 'transparent',
            animation: 'spin 0.7s linear infinite',
          }}
        />
        <span style={{ color: '#a5b4fc', fontWeight: 500 }}>Se finalizează...</span>
      </div>
    )
  }

  // state === 'recording'
  const elapsed = session.elapsedSeconds ?? 0
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
      <div className="recording-indicator" style={{ position: 'relative', width: 20, height: 20 }}>
        <span
          className="pulse-dot"
          style={{
            display: 'block',
            width: 12,
            height: 12,
            borderRadius: '50%',
            background: '#ef4444',
            position: 'absolute',
            top: '50%',
            left: '50%',
            transform: 'translate(-50%, -50%)',
          }}
        />
        <span
          className="pulse-ring"
          style={{
            display: 'block',
            width: 20,
            height: 20,
            borderRadius: '50%',
            border: '2px solid rgba(239,68,68,0.5)',
            position: 'absolute',
            top: 0,
            left: 0,
            animation: 'ping 1.2s cubic-bezier(0,0,0.2,1) infinite',
          }}
        />
      </div>
      <span style={{ color: '#fca5a5', fontWeight: 600, letterSpacing: '0.05em', fontSize: '0.9rem' }}>
        ÎNREGISTRARE ÎN CURS
      </span>
      <span style={{ color: '#e8eaf6', fontWeight: 500, fontVariantNumeric: 'tabular-nums' }}>
        {formatElapsed(elapsed)}
      </span>
    </div>
  )
}
