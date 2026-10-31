import StudentProfileForm from './StudentProfileForm.jsx'
import { RefreshCw } from 'lucide-react'
import './StudentPortal.css'

// «Mi perfil» de la ceo (menú › Mi panel): el mismo formulario que el de alumnos y equipo, dentro
// de la app. No es obligatorio: si no está completo, Inicio lo recuerda (ProfileReminder).
// state: lo que devuelve useMyProfile; onDone vuelve a Inicio (al guardar o al cerrar).
export default function MyProfileView({ state, onDone }) {
  const { data, loadError, retry, save } = state

  if (loadError && !data) {
    return (
      <div className="student-portal sp-embedded sp-center">
        <div className="sp-card sp-narrow">
          <h1>No se pudo cargar tu perfil</h1>
          <p className="sp-text">Comprueba la conexión y vuelve a intentarlo.</p>
          <button type="button" className="sp-btn-primary" onClick={retry}>
            <RefreshCw size={16} strokeWidth={1.75} />
            Reintentar
          </button>
        </div>
      </div>
    )
  }
  if (!data) return <div className="student-portal sp-embedded sp-center sp-loading">Cargando…</div>

  return (
    <div className="student-portal sp-embedded">
      <div className="sp-form-page">
        <StudentProfileForm
          profile={data.profile}
          account={data.account}
          audience="ceo"
          required={false}
          onSave={async (row) => {
            await save(row)
            onDone()
          }}
          onCancel={onDone}
        />
      </div>
    </div>
  )
}
