import { useEffect, useState } from 'react'
import { Award, BookOpen, CalendarDays, CircleCheck, ClipboardCheck, House, Inbox, Newspaper, MessageCircle, Pencil, Star } from 'lucide-react'
import { Brand, ProfileFormPage, ProfileLoadError, ProfileLoading, SignOutButton } from './ProfileScreens.jsx'
import { useMyProfile } from './useMyProfile'
import { initials, zoneShort } from '../lib/studentPortal'
import { countryName } from '../lib/timezones'
import SharedCalendar from './shared/SharedCalendar.jsx'
import StudentCourses from './StudentCourses.jsx'
import StudentAttendance from './StudentAttendance.jsx'
import TestimonialsView from './TestimonialsView.jsx'
import NewsletterView from './NewsletterView.jsx'
import NewsletterNotice from './NewsletterNotice.jsx'
import MailboxView from './MailboxView.jsx'
import StudentGrades from './StudentGrades.jsx'
import MessagesView, { MessagesPrivate } from './chat/MessagesView.jsx'
import ScheduleChanges from './ScheduleChanges.jsx'
import { listStudentCourses } from '../lib/studentCourses'
import { viewZone } from '../lib/zoneView'
import './StudentPortal.css'

// Portal del alumno (papel 'alumno'). Consultas directas a Supabase (sin el motor de
// sincronización ni datos en el navegador): su cuenta (profiles) y su perfil (account_profiles).
// Hasta que completa el perfil no puede hacer nada más.

// Las secciones del portal (en el móvil, la barra de abajo se desplaza de lado si no caben).
const NAV = [
  { id: 'home', label: 'Inicio', Icon: House },
  { id: 'calendar', label: 'Calendario', Icon: CalendarDays },
  { id: 'courses', label: 'Cursos', Icon: BookOpen },
  { id: 'attendance', label: 'Asistencia', Icon: ClipboardCheck },
  { id: 'grades', label: 'Calificaciones', Icon: Award },
  { id: 'messages', label: 'Mensajes', Icon: MessageCircle },
  { id: 'testimonials', label: 'Testimonios', Icon: Star },
  { id: 'newsletter', label: 'Newsletter', Icon: Newspaper },
  { id: 'mailbox', label: 'Buzón', Icon: Inbox },
]

const CARDS = [
  { id: 'calendar', label: 'Calendario', Icon: CalendarDays, text: 'Tus clases y eventos de la semana, en tu hora.' },
  { id: 'courses', label: 'Cursos', Icon: BookOpen, text: 'Tus cursos e inscripciones.' },
  { id: 'attendance', label: 'Asistencia', Icon: ClipboardCheck, text: 'Las clases a las que has venido en cada curso.' },
]

// Tarjeta destacada de Inicio si el alumno aún no está en ningún curso (no sale mientras carga, si
// falla ni en «Ver como»).
function FirstCourseCard({ client, preview, onOpen }) {
  const [empty, setEmpty] = useState(false)

  useEffect(() => {
    if (!client || preview) return
    let active = true
    listStudentCourses(client).then(
      (rows) => active && setEmpty(!(rows || []).some((c) => c.mine)),
      () => {},
    )
    return () => {
      active = false
    }
  }, [client, preview])

  if (!empty) return null
  return (
    <section className="sp-card sp-first-course">
      <span className="sp-soon-icon" aria-hidden="true">
        <BookOpen size={20} strokeWidth={1.75} />
      </span>
      <div>
        <h2>Apúntate a tu primer curso</h2>
        <p className="sp-text">Mira los cursos abiertos y elige el tuyo.</p>
      </div>
      <button type="button" className="sp-btn-primary" onClick={onOpen}>
        Ver cursos
      </button>
    </section>
  )
}

// Con `preview` ({ account, profile }, vista previa de «Ver como») no se pide ni se guarda nada en
// Supabase; readOnly desactiva guardar y cerrar sesión. El calendario de la vista previa se lee con
// calendarClient (el de la ceo) y calendarAs (la cuenta que se está viendo).
export default function StudentPortal({ client, userId, onSignOut, preview = null, readOnly = false, calendarClient = null, calendarAs = null }) {
  const { data, loadError, retry, save } = useMyProfile(client, userId, preview)
  const [editing, setEditing] = useState(false)
  const [section, setSection] = useState('home')
  const [justDone, setJustDone] = useState(false) // acaba de completar el perfil por primera vez

  const handleSave = async (row) => {
    if (readOnly) return
    const first = !data?.profile?.completed_at
    await save(row)
    setEditing(false)
    if (first) {
      setJustDone(true)
      setSection('courses')
    }
    window.scrollTo(0, 0)
  }

  const go = (id) => {
    setJustDone(false)
    setSection(id)
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
              onClick={() => go(id)}
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

            <ScheduleChanges client={client} zone={viewZone(profile)} preview={!!preview} />
            <NewsletterNotice client={client} preview={!!preview} onOpen={() => go('newsletter')} />

            <FirstCourseCard client={client} preview={!!preview} onOpen={() => go('courses')} />

            <div className="sp-cards">
              {CARDS.map(({ id, label, Icon, text }) => (
                <button key={id} type="button" className="sp-card sp-soon-card sp-card-link" onClick={() => go(id)}>
                  <span className="sp-soon-icon" aria-hidden="true">
                    <Icon size={20} strokeWidth={1.75} />
                  </span>
                  <div>
                    <h2>{label}</h2>
                    <p className="sp-text">{text}</p>
                  </div>
                </button>
              ))}
            </div>

            <div className="sp-mobile-signout">{signOutButton}</div>
          </>
        ) : section === 'courses' ? (
          <>
            {justDone && (
              <p className="sp-done" role="status">
                <CircleCheck size={18} strokeWidth={2} aria-hidden="true" />
                ¡Listo! Ya puedes apuntarte a los cursos
              </p>
            )}
            <StudentCourses client={client} zone={viewZone(profile)} preview={!!preview} />
          </>
        ) : section === 'messages' ? (
          preview ? <MessagesPrivate /> : <MessagesView client={client} meId={userId} zone={viewZone(profile)} safety />
        ) : section === 'grades' ? (
          <StudentGrades client={client} preview={!!preview} />
        ) : section === 'mailbox' ? (
          <MailboxView client={client} readOnly={readOnly || !!preview} />
        ) : section === 'newsletter' ? (
          <NewsletterView client={client} readOnly={readOnly || !!preview} />
        ) : section === 'testimonials' ? (
          <TestimonialsView client={client} readOnly={readOnly || !!preview} />
        ) : section === 'attendance' ? (
          <StudentAttendance client={client} zone={viewZone(profile)} preview={!!preview} />
        ) : section === 'calendar' ? (
          <SharedCalendar
            client={preview ? calendarClient : client}
            meId={preview ? calendarAs : userId}
            zone={viewZone(profile)}
            asId={preview ? calendarAs : null}
            readOnly={readOnly}
          />
        ) : null}
      </main>

      <nav className="sp-bottom-nav" aria-label="Secciones">
        {NAV.map(({ id, label, Icon }) => (
          <button
            key={id}
            type="button"
            className={`sp-bottom-item${section === id ? ' active' : ''}`}
            aria-current={section === id ? 'page' : undefined}
            onClick={() => go(id)}
          >
            <Icon size={22} strokeWidth={1.75} aria-hidden="true" />
            <span>{label}</span>
          </button>
        ))}
      </nav>
    </div>
  )
}
