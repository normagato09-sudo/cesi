import { useEffect, useState } from 'react'
import { addDaysKey, dayLabel, daysRange, hhmmOf, keyOf, listMyClasses } from '../../lib/sharedCalendar'
import './TeamWork.css'

// «Mis clases» en el Inicio de un profesor: las de hoy y mañana de los cursos que da (las mismas
// de su calendario), con cuántos alumnos han confirmado. Nada si no da ningún curso. asId: «Ver
// como» de la ceo. onOpen: ir a Asistencia (pasar lista), si la tiene.
export default function MyClasses({ client, zone, asId = null, onOpen = null }) {
  const [classes, setClasses] = useState(null)
  const today = keyOf(new Date(), zone)

  useEffect(() => {
    if (!client) return
    let active = true
    const { start, end } = daysRange(today, 2, zone)
    listMyClasses(client, start, end, asId).then(
      (rows) => active && setClasses((rows || []).filter((c) => c.kind === 'profesor')),
      () => active && setClasses([]),
    )
    return () => {
      active = false
    }
  }, [client, zone, today, asId])

  if (!client || !classes || classes.length === 0) return null
  const tomorrow = addDaysKey(today, 1)
  return (
    <section className="member-panel-access tw-home-tasks">
      <h2>Mis clases de hoy y mañana</h2>
      <ul className="tw-list">
        {classes.map((c) => {
          const day = keyOf(new Date(c.starts_at), zone)
          const Main = onOpen ? 'button' : 'div'
          return (
            <li key={`${c.course_id}|${c.class_key}`} className="tw-task">
              <Main {...(onOpen ? { type: 'button', onClick: onOpen } : {})} className="tw-task-main">
                <span className="tw-task-title">{c.course_name || 'Curso'}</span>
                <span className="tw-task-meta">
                  <span>
                    {day === today ? 'Hoy' : day === tomorrow ? 'Mañana' : dayLabel(day)} · {hhmmOf(new Date(c.starts_at), zone)}–{hhmmOf(new Date(c.ends_at), zone)}
                  </span>
                  <span>
                    {c.confirmed} {c.confirmed === 1 ? 'ha confirmado' : 'han confirmado'}
                  </span>
                  {c.note && <span>{c.note}</span>}
                </span>
              </Main>
            </li>
          )
        })}
      </ul>
    </section>
  )
}
