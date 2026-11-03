import { useEffect, useState } from 'react'
import { ClipboardCheck } from 'lucide-react'
import { listMyAttendance, myAttendanceErrorText, statusText, summarizeMyAttendance, summaryText } from '../lib/myAttendance'
import { listStudentCourses } from '../lib/studentCourses'
import './StudentCourses.css'
import './StudentAttendance.css'

// «Lun 4 nov · 18:00» en la hora de quien mira.
function whenText(date, zone) {
  if (!date) return ''
  const day = new Intl.DateTimeFormat('es-ES', { weekday: 'short', day: 'numeric', month: 'short', timeZone: zone }).format(date)
  const time = new Intl.DateTimeFormat('es-ES', { hour: '2-digit', minute: '2-digit', hourCycle: 'h23', timeZone: zone }).format(date)
  return `${day.charAt(0).toUpperCase()}${day.slice(1)} · ${time}`
}

/**
 * «Asistencia» del portal del alumno: por cada uno de sus cursos, «Has venido a 8 de 10 clases
 * (80 %)» y sus clases con lista pasada (Presente, Retraso o Falta, y si está justificada), en su
 * hora. Solo la suya (cesi_my_attendance, parte 31). zone: la de su perfil. preview: «Ver como».
 */
export default function StudentAttendance({ client, zone, preview = false }) {
  const [courses, setCourses] = useState(null)
  const [error, setError] = useState(null)

  useEffect(() => {
    if (!client || preview) return
    let active = true
    Promise.all([listMyAttendance(client), listStudentCourses(client).catch(() => [])]).then(
      ([records, list]) => {
        if (!active) return
        const mine = (list || []).filter((c) => c.mine).map((c) => ({ id: c.id, name: c.name }))
        setCourses(summarizeMyAttendance(records, mine))
        setError(null)
      },
      (err) => active && setError(myAttendanceErrorText(err)),
    )
    return () => {
      active = false
    }
  }, [client, preview])

  if (preview) {
    return (
      <section className="sp-card stc-empty">
        <p>En «Ver como» no se muestra la asistencia del alumno: la ve desde su propia cuenta.</p>
      </section>
    )
  }

  return (
    <div className="stc-root">
      <h1 className="stc-title">Asistencia</h1>
      {error ? (
        <p className="stc-error">{error}</p>
      ) : !courses ? (
        <p className="stc-muted">Cargando…</p>
      ) : courses.length === 0 ? (
        <section className="sp-card stc-empty">
          <p>Cuando estés en un curso y se pase lista, aquí verás tu asistencia.</p>
        </section>
      ) : (
        courses.map((c) => (
          <section key={c.courseId} className="sp-card sa-course" aria-label={`Asistencia de ${c.name}`}>
            <div className="stc-card-head">
              <ClipboardCheck size={18} strokeWidth={1.75} aria-hidden="true" />
              <h3>{c.name}</h3>
            </div>
            <p className="sa-summary">{summaryText(c)}</p>
            {c.percent !== null && (
              <span className="stc-bar sa-bar" aria-hidden="true">
                <span style={{ width: `${c.percent}%` }} />
              </span>
            )}
            {c.records.length > 0 && (
              <ul className="sa-list">
                {c.records.map((r) => (
                  <li key={r.classKey}>
                    <span>{whenText(r.start, zone)}</span>
                    <span className={`sa-status ${r.status}${r.justified ? ' justified' : ''}`}>{statusText(r)}</span>
                  </li>
                ))}
              </ul>
            )}
          </section>
        ))
      )}
    </div>
  )
}
