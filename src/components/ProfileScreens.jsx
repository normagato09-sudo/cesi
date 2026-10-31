import { LogOut, RefreshCw } from 'lucide-react'
import StudentProfileForm from './StudentProfileForm.jsx'
import './StudentPortal.css'

// Pantallas del perfil comunes al portal de alumnos y a la app del equipo: cargando, error al
// cargar y el formulario a pantalla completa («Completa tu perfil» / «Editar mi perfil»).

export function Brand() {
  return (
    <div className="sp-brand">
      <span className="sp-logo">C</span>
      <span>CIFA</span>
    </div>
  )
}

export function SignOutButton({ onSignOut, readOnly = false }) {
  const handleSignOut = () => {
    if (window.confirm('¿Cerrar sesión?')) onSignOut()
  }
  return (
    <button type="button" className="sp-btn-secondary sp-signout" onClick={handleSignOut} disabled={readOnly}>
      <LogOut size={16} strokeWidth={1.75} />
      Cerrar sesión
    </button>
  )
}

export function ProfileLoading() {
  return <div className="student-portal sp-center sp-loading">Cargando…</div>
}

export function ProfileLoadError({ onRetry, onSignOut, readOnly = false }) {
  return (
    <div className="student-portal sp-center">
      <div className="sp-card sp-narrow">
        <Brand />
        <h1>No se pudo cargar tu perfil</h1>
        <p className="sp-text">Comprueba la conexión y vuelve a intentarlo.</p>
        <button type="button" className="sp-btn-primary" onClick={onRetry}>
          <RefreshCw size={16} strokeWidth={1.75} />
          Reintentar
        </button>
        <SignOutButton onSignOut={onSignOut} readOnly={readOnly} />
      </div>
    </div>
  )
}

// Primera vez (obligatorio, con «Cerrar sesión» arriba) o editando (con la X para cerrar).
export function ProfileFormPage({ profile, account, audience, readOnly = false, onSave, onCancel, onSignOut }) {
  const completed = !!profile?.completed_at
  return (
    <div className="student-portal">
      <div className="sp-form-page">
        <div className="sp-form-top">
          <Brand />
          {!completed && <SignOutButton onSignOut={onSignOut} readOnly={readOnly} />}
        </div>
        <StudentProfileForm
          profile={profile}
          account={account}
          audience={audience}
          required={!completed}
          readOnly={readOnly}
          onSave={onSave}
          onCancel={completed ? onCancel : null}
        />
      </div>
    </div>
  )
}
