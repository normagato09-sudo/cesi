import { useEffect, useState } from 'react'
import { CalendarClock } from 'lucide-react'
import { listMyScheduleChanges, markScheduleChangeSeen } from '../lib/autoSchedule'
import { scheduleRows } from '../lib/courses'
import './ScheduleChanges.css'

// El horario en la hora de quien lo mira: «Mar 18:00–19:00 · Jue 18:00–19:00».
function inMyZone(schedule, minutes, zone) {
  if (!schedule?.slots?.length) return 'sin horario'
  return scheduleRows({ schedule, classMinutes: minutes }, new Date(), zone)
    .map((r) => r.mine)
    .join(' · ')
}

/**
 * Avisos de cambio de horario de mis cursos (alumno o profesor), hasta que pulsa «Entendido»
 * (cesi_my_schedule_changes, parte 30). Nada si no hay, sin la parte 30 o en «Ver como».
 */
export default function ScheduleChanges({ client, zone, preview = false }) {
  const [changes, setChanges] = useState([])

  useEffect(() => {
    if (!client || preview) return
    let active = true
    listMyScheduleChanges(client).then(
      (rows) => active && setChanges(rows || []),
      () => {},
    )
    return () => {
      active = false
    }
  }, [client, preview])

  if (changes.length === 0) return null

  const seen = async (id) => {
    setChanges((list) => list.filter((c) => c.id !== id))
    try {
      await markScheduleChangeSeen(client, id)
    } catch {
      // Si falla, vuelve a salir la próxima vez.
    }
  }

  return (
    <div className="sch-changes">
      {changes.map((c) => (
        <section key={c.id} className="sch-change" role="status">
          <CalendarClock size={20} strokeWidth={1.75} aria-hidden="true" />
          <div className="sch-change-text">
            <strong>Nuevo horario en {c.course_name || 'tu curso'}</strong>
            <span>Ahora: {inMyZone(c.new_schedule, c.class_minutes, zone)}</span>
            {c.old_schedule?.slots?.length > 0 && <span className="sch-muted">Antes: {inMyZone(c.old_schedule, c.class_minutes, zone)}</span>}
          </div>
          <button type="button" className="sch-ok" onClick={() => seen(c.id)}>
            Entendido
          </button>
        </section>
      ))}
    </div>
  )
}
