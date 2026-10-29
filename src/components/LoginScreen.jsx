import { useState } from 'react'
import { LogIn } from 'lucide-react'
import './LoginScreen.css'

function loginErrorText(error) {
  const message = String(error?.message || '')
  if (typeof navigator !== 'undefined' && !navigator.onLine) return 'Sin conexión. Conéctate a internet para iniciar sesión.'
  if (/invalid login credentials/i.test(message)) return 'El email o la contraseña no son correctos.'
  if (/email not confirmed/i.test(message)) return 'Falta confirmar el email de la cuenta en Supabase.'
  if (/provider is not enabled|unsupported provider/i.test(message)) return 'Este modo de entrar aún no está activado en Supabase.'
  if (/fetch|network/i.test(message)) return 'No se pudo conectar con el servidor. Inténtalo de nuevo.'
  return message || 'No se pudo iniciar sesión.'
}

// Error con el que vuelve Google o Discord (?error_description=… o #error_description=…). Se quita
// de la dirección para que no salga otra vez al recargar.
function readOAuthError() {
  try {
    const { hash, search, pathname } = window.location
    const params = new URLSearchParams(hash.startsWith('#') ? hash.slice(1) : hash)
    const query = new URLSearchParams(search)
    const description = params.get('error_description') || query.get('error_description')
    if (!description) return null
    window.history.replaceState(null, '', pathname)
    return loginErrorText({ message: description.replace(/\+/g, ' ') })
  } catch {
    return null
  }
}

const PROVIDERS = [
  { id: 'google', label: 'Entrar con Google', Logo: GoogleLogo },
  { id: 'discord', label: 'Entrar con Discord', Logo: DiscordLogo },
]

// Inicio de sesión de Supabase Auth: con Google o Discord (también sirven para registrarse: la
// cuenta nueva entra como pendiente) o con email y contraseña. La sesión se recuerda.
export default function LoginScreen({ onSignIn, onOAuth }) {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState(readOAuthError)
  const [submitting, setSubmitting] = useState(false)
  const [redirecting, setRedirecting] = useState(null)

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

  // Lleva a Google o Discord; al volver, la app recoge la sesión de la dirección.
  const handleOAuth = async (provider) => {
    setRedirecting(provider)
    setError(null)
    try {
      await onOAuth(provider)
    } catch (err) {
      setError(loginErrorText(err))
      setRedirecting(null)
    }
  }

  const busy = submitting || !!redirecting

  return (
    <div className="login-screen">
      <form className="login-card" onSubmit={handleSubmit} noValidate data-reload-safe>
        <div className="login-brand">
          <span className="sidebar-logo">C</span>
          <span className="login-brand-name">CIFA</span>
        </div>
        <h1>Iniciar sesión</h1>
        <p className="login-hint">Entra con tu cuenta para tener los mismos datos en el móvil y en el ordenador.</p>

        {onOAuth && (
          <>
            <div className="login-providers">
              {PROVIDERS.map(({ id, label, Logo }) => (
                <button key={id} type="button" className="login-secondary" disabled={busy} onClick={() => handleOAuth(id)}>
                  <Logo />
                  {redirecting === id ? 'Abriendo…' : label}
                </button>
              ))}
            </div>
            <div className="login-divider" role="separator">
              <span>o con tu email</span>
            </div>
          </>
        )}

        <label className="login-field">
          <span>Email</span>
          <input
            type="email"
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="tu@email.com"
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

        <button type="submit" className="login-submit" disabled={busy}>
          <LogIn size={16} strokeWidth={1.75} />
          {submitting ? 'Entrando…' : 'Entrar'}
        </button>
      </form>
    </div>
  )
}

function GoogleLogo() {
  return (
    <svg width="16" height="16" viewBox="0 0 48 48" aria-hidden="true">
      <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z" />
      <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z" />
      <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z" />
      <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z" />
    </svg>
  )
}

function DiscordLogo() {
  return (
    <svg width="17" height="17" viewBox="0 0 127.14 96.36" aria-hidden="true">
      <path
        fill="#5865F2"
        d="M107.7,8.07A105.15,105.15,0,0,0,81.47,0a72.06,72.06,0,0,0-3.36,6.83A97.68,97.68,0,0,0,49,6.83,72.37,72.37,0,0,0,45.64,0,105.89,105.89,0,0,0,19.39,8.09C2.79,32.65-1.71,56.6.54,80.21h0A105.73,105.73,0,0,0,32.71,96.36,77.7,77.7,0,0,0,39.6,85.25a68.42,68.42,0,0,1-10.85-5.18c.91-.66,1.8-1.34,2.66-2a75.57,75.57,0,0,0,64.32,0c.87.71,1.76,1.39,2.66,2a68.68,68.68,0,0,1-10.87,5.19,77,77,0,0,0,6.89,11.1A105.25,105.25,0,0,0,126.6,80.22h0C129.24,52.84,122.09,29.11,107.7,8.07ZM42.45,65.69C36.18,65.69,31,60,31,53s5-12.74,11.43-12.74S54,46,53.89,53,48.84,65.69,42.45,65.69Zm42.24,0C78.41,65.69,73.25,60,73.25,53s5-12.74,11.44-12.74S96.23,46,96.12,53,91.08,65.69,84.69,65.69Z"
      />
    </svg>
  )
}
