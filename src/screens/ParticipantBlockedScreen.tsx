import { LogIn } from 'lucide-react'

interface Props {
  onLogout: () => Promise<void>
}

export function ParticipantBlockedScreen({ onLogout }: Props) {
  return (
    <main className="login-shell">
      <section className="login-card card">
        <p className="eyebrow">MeetRec Room Client</p>
        <h1>Acces restricționat</h1>
        <p className="login-subtitle">
          Accesul participanților nu este disponibil pe clientul de cameră.
        </p>
        <button className="secondary-button" onClick={() => void onLogout()}>
          <LogIn size={16} /> Deconectare
        </button>
      </section>
    </main>
  )
}
