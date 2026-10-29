import { useCallback, useEffect, useState } from 'react'
import { BookOpen, CalendarDays, House, LogOut, Mail, MessageCircle, NotebookPen, Pencil, RefreshCw } from 'lucide-react'
import StudentProfileForm from './StudentProfileForm.jsx'
import { fetchMyPortal, initials, saveMyPortal } from '../lib/studentPortal'
import { countryName, zoneLabel } from '../lib/timezones'
import './StudentPortal.css'

// Portal del alumno (papel 'alumno'). Consultas directas a Supabase (sin el motor de
// sincronización ni datos en el navegador): su cuenta (profiles) y su perfil (student_profiles).
// Hasta que completa el perfil no puede hacer nada más.

const NAV = [
  { id: 'home', label: 'Inicio', Icon: House },
  { id: 'calendar', label: 'Calendario', Icon: CalendarDays },
  { id: 'courses', label: 'Cursos', Icon: BookOpen },
  { id: 'notes', label: 'Notas', Icon: NotebookPen },
  { id: 'messages', label: 'Mensajes', Icon: MessageCircle },
]

const CARDS = [
  { id: 'calendar', label: 'Calendario', Icon: CalendarDays, text: 'Tus clases de la semana, en tu hora.' },
  { id: 'courses', label: 'Cursos', Icon: BookOpen, text: 'Tus cursos y tu asistencia.' },
  { id: 'notes', label: 'Notas', Icon: NotebookPen, text: 'Tus notas y apuntes.' },
  { id: 'newsletter', label: 'Newsletter', Icon: Mail, text: 'Las novedades de CIFA.' },
  { id: 'messages', label: 'Mensajes', Icon: MessageCircle, text: 'Mensajes con tus profesores.' },
]

function Brand() {
  return (
    <div className="sp-brand">
      <span className="sp-logo">C</span>
      <span>CIFA</span>
    </div>
  )
}

// Con `preview` ({ account, profile }, vista previa de «Ver como») no se pide ni se guarda nada en
// Supabase; readOnly desactiva guardar y cerrar sesión.
export default function StudentPortal({ client, userId, onSignOut, preview = null, readOnly = false }) {
  const [fetched, setData] = useState(null) // { account, profile }
  const [loadError, setLoadError] = useState(false)
  const [attempt, setAttempt] = useState(0)
  const [editing, setEditing] = useState(false)
  const [section, setSection] = useState('home')
  const data = preview || fetched

  useEffect(() => {
    if (preview || !client) return
    let active = true
    fetchMyPortal(client, userId).then(
      (next) => {
        if (!active) return
        setData(next)
        setLoadError(false)
      },
      () => active && setLoadError(true),
    )
    return () => {
      active = false
    }
  }, [client, userId, attempt, preview])

  const handleSave = useCallback(
    async (row) => {
      if (readOnly) return
      const profile = await saveMyPortal(client, userId, row, data?.profile || null)
      setData((d) => ({ ...d, profile }))
      setEditing(false)
      window.scrollTo(0, 0)
    },
    [client, userId, data, readOnly],
  )

  const handleSignOut = () => {
    if (window.confirm('¿Cerrar sesión?')) onSignOut()
  }

  const signOutButton = (
    <button type="button" className="sp-btn-secondary sp-signout" onClick={handleSignOut} disabled={readOnly}>
      <LogOut size={16} strokeWidth={1.75} />
      Cerrar sesión
    </button>
  )

  if (loadError && !data) {
    return (
      <div className="student-portal sp-center">
        <div className="sp-card sp-narrow">
          <Brand />
          <h1>No se pudo cargar tu perfil</h1>
          <p className="sp-text">Comprueba la conexión y vuelve a intentarlo.</p>
          <button type="button" className="sp-btn-primary" onClick={() => setAttempt((n) => n + 1)}>
            <RefreshCw size={16} strokeWidth={1.75} />
            Reintentar
          </button>
          {signOutButton}
        </div>
      </div>
    )
  }

  if (!data) return <div className="student-portal sp-center sp-loading">Cargando…</div>

  const { account, profile } = data
  const completed = !!profile?.completed_at

  // Primera vez (o editando): el formulario a pantalla completa.
  if (!completed || editing) {
    return (
      <div className="student-portal">
        <div className="sp-form-page">
          <div className="sp-form-top">
            <Brand />
            {!completed && signOutButton}
          </div>
          <StudentProfileForm
            profile={profile}
            account={account}
            required={!completed}
            readOnly={readOnly}
            onSave={handleSave}
            onCancel={completed ? () => setEditing(false) : null}
          />
        </div>
      </div>
    )
  }

  const name = profile.full_name || account.display_name || ''
  const current = NAV.find((n) => n.id === section) || NAV[0]

  return (
    <div className="student-portal sp-app">
      <aside className="sp-sidebar">
        <Brand />
        <nav aria-label="Secciones">
          {NAV.map(({ id, label, Icon }) => (
            <button
              key={id}
              type="button"
              className={`sp-nav-item${section === id ? ' active' : ''}`}
              aria-current={section === id ? 'page' : undefined}
              onClick={() => setSection(id)}
            >
              <Icon size={19} strokeWidth={1.75} />
              {label}
            </button>
          ))}
        </nav>
        <div className="sp-sidebar-footer">{signOutButton}</div>
      </aside>

      <main className="sp-main">
        {section === 'home' ? (
          <>
            <header className="sp-hello">
              <span className="sp-avatar" aria-hidden="true">
                {initials(name)}
              </span>
              <div className="sp-hello-text">
                <h1>Hola{name ? `, ${name}` : ''}</h1>
                <p>
                  Alumno/a · {countryName(profile.country)} · {zoneLabel(profile.time_zone)}
                </p>
              </div>
              <button type="button" className="sp-icon-btn sp-edit-btn" onClick={() => setEditing(true)} aria-label="Editar mi perfil" title="Editar mi perfil">
                <Pencil size={18} strokeWidth={1.75} />
              </button>
            </header>

            <div className="sp-cards">
              {CARDS.map(({ id, label, Icon, text }) => (
                <section key={id} className="sp-card sp-soon-card">
                  <span className="sp-soon-icon" aria-hidden="true">
                    <Icon size={20} strokeWidth={1.75} />
                  </span>
                  <div>
                    <h2>{label}</h2>
                    <p className="sp-text">{text}</p>
                  </div>
                  <span className="sp-badge-soon">Próximamente</span>
                </section>
              ))}
            </div>

            <div className="sp-mobile-signout">{signOutButton}</div>
          </>
        ) : (
          <section className="sp-card sp-soon-page">
            <span className="sp-soon-icon" aria-hidden="true">
              <current.Icon size={24} strokeWidth={1.75} />
            </span>
            <h1>{current.label}</h1>
            <span className="sp-badge-soon">Próximamente</span>
          </section>
        )}
      </main>

      <nav className="sp-bottom-nav" aria-label="Secciones">
        {NAV.map(({ id, label, Icon }) => (
          <button
            key={id}
            type="button"
            className={`sp-bottom-item${section === id ? ' active' : ''}`}
            aria-current={section === id ? 'page' : undefined}
            onClick={() => setSection(id)}
          >
            <Icon size={22} strokeWidth={1.75} aria-hidden="true" />
            <span>{label}</span>
          </button>
        ))}
      </nav>
    </div>
  )
}
