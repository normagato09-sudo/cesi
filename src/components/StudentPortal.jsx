import { useState } from 'react'
import { Award, BookOpen, CalendarDays, House, Mail, MessageCircle, Pencil } from 'lucide-react'
import { Brand, ProfileFormPage, ProfileLoadError, ProfileLoading, SignOutButton } from './ProfileScreens.jsx'
import { useMyProfile } from './useMyProfile'
import { initials, zoneShort } from '../lib/studentPortal'
import { countryName, localTimeZone } from '../lib/timezones'
import SharedCalendar from './shared/SharedCalendar.jsx'
import './StudentPortal.css'

// Portal del alumno (papel 'alumno'). Consultas directas a Supabase (sin el motor de
// sincronización ni datos en el navegador): su cuenta (profiles) y su perfil (account_profiles).
// Hasta que completa el perfil no puede hacer nada más.

const NAV = [
  { id: 'home', label: 'Inicio', Icon: House },
  { id: 'calendar', label: 'Calendario', Icon: CalendarDays },
  { id: 'courses', label: 'Cursos', Icon: BookOpen },
  { id: 'grades', label: 'Calificaciones', Icon: Award },
  { id: 'newsletter', label: 'Newsletter', Icon: Mail },
  { id: 'messages', label: 'Mensajes', Icon: MessageCircle },
]

const CARDS = [
  { id: 'calendar', label: 'Calendario', Icon: CalendarDays, text: 'Tus clases y eventos de la semana, en tu hora.' },
  { id: 'courses', label: 'Cursos', Icon: BookOpen, text: 'Tus cursos e inscripciones.' },
  { id: 'grades', label: 'Calificaciones', Icon: Award, text: 'Tus calificaciones y tu asistencia.' },
  { id: 'newsletter', label: 'Newsletter', Icon: Mail, text: 'Las novedades de CIFA.' },
  { id: 'messages', label: 'Mensajes', Icon: MessageCircle, text: 'Habla con tus compañeros de curso.' },
]

// Secciones que ya funcionan (las demás dicen «Próximamente»).
const READY = new Set(['calendar'])

// Con `preview` ({ account, profile }, vista previa de «Ver como») no se pide ni se guarda nada en
// Supabase; readOnly desactiva guardar y cerrar sesión. El calendario de la vista previa se lee con
// calendarClient (el de la ceo) y calendarAs (la cuenta que se está viendo).
export default function StudentPortal({ client, userId, onSignOut, preview = null, readOnly = false, calendarClient = null, calendarAs = null }) {
  const { data, loadError, retry, save } = useMyProfile(client, userId, preview)
  const [editing, setEditing] = useState(false)
  const [section, setSection] = useState('home')

  const handleSave = async (row) => {
    if (readOnly) return
    await save(row)
    setEditing(false)
    window.scrollTo(0, 0)
  }

  const signOutButton = <SignOutButton onSignOut={onSignOut} readOnly={readOnly} />

  if (loadError && !data) return <ProfileLoadError onRetry={retry} onSignOut={onSignOut} readOnly={readOnly} />
  if (!data) return <ProfileLoading />

  const { account, profile } = data
  const completed = !!profile?.completed_at

  // Primera vez (o editando): el formulario a pantalla completa.
  if (!completed || editing) {
    return (
      <ProfileFormPage
        profile={profile}
        account={account}
        audience="alumno"
        readOnly={readOnly}
        onSave={handleSave}
        onCancel={() => setEditing(false)}
        onSignOut={onSignOut}
      />
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
                  {/* Siempre «Alumno»: lo que pone mi ficha de Alumnos no se enseña al alumno. */}
                  Alumno · {countryName(profile.country)} · {zoneShort(profile.time_zone)}
                </p>
              </div>
              <button type="button" className="sp-icon-btn sp-edit-btn" onClick={() => setEditing(true)} aria-label="Editar mi perfil" title="Editar mi perfil">
                <Pencil size={18} strokeWidth={1.75} />
              </button>
            </header>

            <div className="sp-cards">
              {CARDS.map(({ id, label, Icon, text }) =>
                READY.has(id) ? (
                  <button key={id} type="button" className="sp-card sp-soon-card sp-card-link" onClick={() => setSection(id)}>
                    <span className="sp-soon-icon" aria-hidden="true">
                      <Icon size={20} strokeWidth={1.75} />
                    </span>
                    <div>
                      <h2>{label}</h2>
                      <p className="sp-text">{text}</p>
                    </div>
                  </button>
                ) : (
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
                ),
              )}
            </div>

            <div className="sp-mobile-signout">{signOutButton}</div>
          </>
        ) : section === 'calendar' ? (
          <SharedCalendar
            client={preview ? calendarClient : client}
            meId={preview ? calendarAs : userId}
            zone={profile.time_zone || localTimeZone()}
            asId={preview ? calendarAs : null}
            readOnly={readOnly}
          />
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
