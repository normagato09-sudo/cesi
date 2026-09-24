import { useState } from 'react'
import { LogIn } from 'lucide-react'
import './LoginScreen.css'

function loginErrorText(error) {
  const message = String(error?.message || '')
  if (typeof navigator !== 'undefined' && !navigator.onLine) return 'Sin conexión. Conéctate a internet para iniciar sesión.'
  if (/invalid login credentials/i.test(message)) return 'El email o la contraseña no son correctos.'
  if (/email not confirmed/i.test(message)) return 'Falta confirmar el email de la cuenta en Supabase.'
  if (/fetch|network/i.test(message)) return 'No se pudo conectar con el servidor. Inténtalo de nuevo.'
  return message || 'No se pudo iniciar sesión.'
}

// Inicio de sesión con email y contraseña de Supabase Auth. La sesión se recuerda.
export default function LoginScreen({ onSignIn }) {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState(null)
  const [submitting, setSubmitting] = useState(false)

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!email.trim() || !password) {
      setError('Escribe tu email y tu contraseña.')
      return
    }
    setSubmitting(true)
    setError(null)
    try {
      await onSignIn(email.trim(), password)
    } catch (err) {
      setError(loginErrorText(err))
      setSubmitting(false)
    }
  }

  return (
    <div className="login-screen">
      <form className="login-card" onSubmit={handleSubmit} noValidate>
        <div className="login-brand">
          <span className="sidebar-logo">C</span>
          <span className="login-brand-name">CESI</span>
        </div>
        <h1>Iniciar sesión</h1>
        <p className="login-hint">Entra con tu cuenta para tener los mismos datos en el móvil y en el ordenador.</p>

        <label className="login-field">
          <span>Email</span>
          <input
            type="email"
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="tu@email.com"
            autoFocus
          />
        </label>
        <label className="login-field">
          <span>Contraseña</span>
          <input
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </label>

        {error && (
          <p className="login-error" role="alert">
            {error}
          </p>
        )}

        <button type="submit" className="login-submit" disabled={submitting}>
          <LogIn size={16} strokeWidth={1.75} />
          {submitting ? 'Entrando…' : 'Entrar'}
        </button>
      </form>
    </div>
  )
}
