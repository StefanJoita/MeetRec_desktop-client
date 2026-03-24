import { LogIn } from 'lucide-react'

type Props = {
  onLogout: () => void
}

export function ParticipantBlockedScreen({ onLogout }: Props) {
  return (
    <main className="login-shell">
      <section className="login-card card">
        <p className="eyebrow">MeetRec Room Client</p>
        <h1>Acces restricționat</h1>
        <p className="login-subtitle">Contul cu rol participant nu are acces la clientul de captare audio din sală.</p>
        <button className="secondary-button" onClick={onLogout}>
          <LogIn size={16} /> Deconectare
        </button>
      </section>
    </main>
  )
}
