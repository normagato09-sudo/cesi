import { useEffect, useState } from 'react'
import { BookOpen, CalendarClock, UserRound, Users, Video } from 'lucide-react'
import { hhmmOf, keyOf } from '../lib/sharedCalendar'
import { dayText, enrollInCourse, freeSeats, leaveCourse, listCallLinks, listMyTeacherCourses, listStudentCourses, progressPercent, progressText, scheduleInZone, splitCourses, studentCoursesErrorText } from '../lib/studentCourses'
import './StudentCourses.css'

function Schedule({ course, zone }) {
  const rows = scheduleInZone(course, zone)
  if (rows.length === 0) return <span>Horario por decidir</span>
  return <span>{rows.join(' · ')}</span>
}

/**
 * «Cursos» del portal del alumno: «Mis cursos» (profesor, horario en su zona, progreso y
 * «Desapuntarme») y «Cursos abiertos» (para apuntarse si quedan plazas). Todo se comprueba en el
 * servidor (parte 25). zone: la de su perfil. preview: «Ver como» (no se puede ver ni cambiar).
 */
export default function StudentCourses({ client, zone, preview = false }) {
  const [courses, setCourses] = useState(null)
  const [error, setError] = useState(null)
  const [busy, setBusy] = useState(null)
  const [notice, setNotice] = useState(null)
  const [reload, setReload] = useState(0)
  // Parte 39: los cursos que doy (no me puedo apuntar) y el link de la llamada de los míos.
  const [teaching, setTeaching] = useState(() => new Set())
  const [links, setLinks] = useState(() => new Map())
  useEffect(() => {
    if (!client || preview) return
    let active = true
    listMyTeacherCourses(client).then((ids) => active && setTeaching(ids), () => {})
    listCallLinks(client).then((m) => active && setLinks(m), () => {})
    return () => {
      active = false
    }
  }, [client, preview, reload])

  useEffect(() => {
    if (!client || preview) return
    let active = true
    listStudentCourses(client).then(
      (rows) => {
        if (!active) return
        setCourses(rows || [])
        setError(null)
      },
      (err) => active && setError(studentCoursesErrorText(err)),
    )
    return () => {
      active = false
    }
  }, [client, preview, reload])

  if (preview) {
    return (
      <section className="sp-card stc-empty">
        <p>En «Ver como» no se muestran los cursos del alumno: se apunta desde su propia cuenta.</p>
      </section>
    )
  }

  const run = async (course, action) => {
    setBusy(course.id)
    setNotice(null)
    try {
      const result = await action()
      if (result?.status === 'full') setNotice({ id: course.id, text: 'Curso completo: ya no quedan plazas.' })
      setReload((n) => n + 1)
    } catch (err) {
      setNotice({ id: course.id, text: studentCoursesErrorText(err) })
    }
    setBusy(null)
  }

  const { mine, open } = splitCourses(courses || [])

  return (
    <div className="stc-root">
      <h1 className="stc-title">Cursos</h1>
      {error ? (
        <p className="stc-error">{error}</p>
      ) : !courses ? (
        <p className="stc-muted">Cargando…</p>
      ) : (
        <>
          <section className="stc-section" aria-label="Mis cursos">
            <h2>Mis cursos</h2>
            {mine.length === 0 ? (
              <p className="stc-muted">Todavía no estás apuntado a ningún curso. Elige uno en «Cursos abiertos».</p>
            ) : (
              <ul className="stc-list">
                {mine.map((c) => {
                  const percent = progressPercent(c)
                  return (
                    <li key={c.id} className="sp-card stc-card">
                      <div className="stc-card-head">
                        <BookOpen size={18} strokeWidth={1.75} aria-hidden="true" />
                        <h3>{c.name}</h3>
                      </div>
                      <p className="stc-line">
                        <UserRound size={14} strokeWidth={1.75} aria-hidden="true" />
                        {c.teacher_name || 'Sin profesor todavía'}
                      </p>
                      <p className="stc-line">
                        <CalendarClock size={14} strokeWidth={1.75} aria-hidden="true" />
                        <Schedule course={c} zone={zone} />
                      </p>
                      <div className="stc-progress">
                        <span>{progressText(c)}</span>
                        {percent !== null && (
                          <span className="stc-bar" aria-hidden="true">
                            <span style={{ width: `${percent}%` }} />
                          </span>
                        )}
                      </div>
                      {c.next_class && (
                        <p className="stc-muted">
                          Próxima clase: {dayText(keyOf(new Date(c.next_class), zone))}, {hhmmOf(new Date(c.next_class), zone)}
                        </p>
                      )}
                      {links.get(c.id)?.link && (
                        <p className="stc-line">
                          <Video size={14} strokeWidth={1.75} aria-hidden="true" />
                          <a className="stc-btn primary stc-join" href={links.get(c.id).link} target="_blank" rel="noreferrer noopener">
                            Entrar a la clase
                          </a>
                        </p>
                      )}
                      {notice?.id === c.id && <p className="stc-error">{notice.text}</p>}
                      <div className="stc-actions">
                        <button
                          type="button"
                          className="stc-btn"
                          disabled={busy === c.id}
                          onClick={() => window.confirm(`¿Desapuntarte de «${c.name}»? Sus clases dejarán de salir en tu calendario.`) && run(c, () => leaveCourse(client, c.id))}
                        >
                          Desapuntarme
                        </button>
                      </div>
                    </li>
                  )
                })}
              </ul>
            )}
          </section>

          <section className="stc-section" aria-label="Cursos abiertos">
            <h2>Cursos abiertos</h2>
            {open.length === 0 ? (
              <p className="stc-muted">Ahora mismo no hay cursos con inscripción abierta.</p>
            ) : (
              <ul className="stc-list">
                {open.map((c) => {
                  const free = freeSeats(c)
                  const full = free === 0
                  return (
                    <li key={c.id} className="sp-card stc-card">
                      <div className="stc-card-head">
                        <BookOpen size={18} strokeWidth={1.75} aria-hidden="true" />
                        <h3>{c.name}</h3>
                      </div>
                      {c.description && <p className="stc-desc">{c.description}</p>}
                      <p className="stc-line">
                        <UserRound size={14} strokeWidth={1.75} aria-hidden="true" />
                        {c.teacher_name || 'Sin profesor todavía'}
                      </p>
                      <p className="stc-line">
                        <CalendarClock size={14} strokeWidth={1.75} aria-hidden="true" />
                        <Schedule course={c} zone={zone} />
                      </p>
                      <p className="stc-line">
                        <Users size={14} strokeWidth={1.75} aria-hidden="true" />
                        {free === null ? 'Plazas sin límite' : `${free} ${free === 1 ? 'plaza libre' : 'plazas libres'}`}
                        {c.start_date && ` · Empieza el ${dayText(c.start_date)}`}
                      </p>
                      {notice?.id === c.id && <p className="stc-error">{notice.text}</p>}
                      <div className="stc-actions">
                        {teaching.has(c.id) ? (
                          <span className="stc-muted">Eres el profesor</span>
                        ) : (
                          <button type="button" className="stc-btn primary" disabled={busy === c.id || full} onClick={() => run(c, () => enrollInCourse(client, c.id))}>
                            {full ? 'Curso completo' : busy === c.id ? 'Apuntando…' : 'Apuntarme'}
                          </button>
                        )}
                      </div>
                    </li>
                  )
                })}
              </ul>
            )}
          </section>
        </>
      )}
    </div>
  )
}
