import { useState } from 'react'
import { CircleCheck, LogOut, Plug } from 'lucide-react'
import './GoogleAuth.css'

export default function GoogleAuth({ isConnected, onConnect, onDisconnect }) {
  const [menuOpen, setMenuOpen] = useState(false)

  if (!isConnected) {
    return (
      <button type="button" className="google-auth-btn connect" onClick={() => onConnect()}>
        <Plug size={15} strokeWidth={1.75} />
        Conectar Google Calendar
      </button>
    )
  }

  return (
    <div className="google-auth-menu">
      <button
        type="button"
        className="google-auth-btn connected"
        onClick={() => setMenuOpen((open) => !open)}
      >
        <CircleCheck size={15} strokeWidth={1.75} />
        Conectado
      </button>
      {menuOpen && (
        <>
          <div className="google-auth-backdrop" onClick={() => setMenuOpen(false)} />
          <div className="google-auth-dropdown">
            <button
              type="button"
              onClick={() => {
                setMenuOpen(false)
                onDisconnect()
              }}
            >
              <LogOut size={14} strokeWidth={1.75} />
              Desconectar
            </button>
          </div>
        </>
      )}
    </div>
  )
}
