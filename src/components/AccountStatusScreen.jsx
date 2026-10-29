import { useState } from 'react'
import { LogOut, RefreshCw } from 'lucide-react'
import './LoginScreen.css'

// Cuenta sin la app de la ceo: pendiente (kind 'waiting'), alumno (kind 'student': su «Mi panel»)
// o cuyo papel no se ha podido comprobar (kind 'error': sin conexión la primera vez).
export default function AccountStatusScreen({ kind = 'waiting', email = '', name = '', onRetry, onSignOut }) {
  const [signingOut, setSigningOut] = useState(false)

  const handleSignOut = async () => {
    setSigningOut(true)
    try {
      await onSignOut()
    } catch {
      setSigningOut(false)
    }
  }

  return (
    <div className="login-screen">
      <div className="login-card">
        <div className="login-brand">
          <span className="sidebar-logo">C</span>
          <span className="login-brand-name">CIFA</span>
        </div>
        {kind === 'error' ? (
          <>
            <h1>No se pudo comprobar tu cuenta</h1>
            <p className="login-hint">Conéctate a internet y vuelve a intentarlo.</p>
          </>
        ) : kind === 'student' ? (
          <>
            <h1>Mi panel</h1>
            <p className="login-hint">
              Hola{name ? `, ${name}` : ''}. Aquí verás tus cursos y tu asistencia muy pronto.
            </p>
          </>
        ) : (
          <>
            <h1>Tu cuenta está creada</h1>
            <p className="login-hint">Espera a que la dirección te dé acceso.</p>
          </>
        )}
        {email && <p className="login-hint">Has entrado como {email}.</p>}
        {kind === 'error' && (
          <button type="button" className="login-submit" onClick={onRetry}>
            <RefreshCw size={16} strokeWidth={1.75} />
            Reintentar
          </button>
        )}
        <button type="button" className={kind === 'error' ? 'login-secondary' : 'login-submit'} onClick={handleSignOut} disabled={signingOut}>
          <LogOut size={16} strokeWidth={1.75} />
          {signingOut ? 'Cerrando sesión…' : 'Cerrar sesión'}
        </button>
      </div>
    </div>
  )
}
