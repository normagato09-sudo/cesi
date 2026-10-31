import { useEffect, useState } from 'react'
import { keyOf } from '../../lib/sharedCalendar'
import { STATUS_LABEL, asSeenByMe, errorText, isOverdue, listTeamTasks, myOpenTasks, progressText } from '../../lib/teamWork'
import './TeamWork.css'

function dueLabel(key) {
  const [y, m, d] = key.split('-')
  return `${Number(d)}/${Number(m)}/${y}`
}

// Mis tareas del equipo sin terminar (mi parte), para el Inicio. tasks: filas de cesi_team_tasks.
export function MyTasksList({ tasks, today, onOpen = null }) {
  const mine = myOpenTasks(tasks).map(asSeenByMe)
  if (mine.length === 0) return <p className="sc-zone">No tienes tareas pendientes.</p>
  return (
    <ul className="tw-list">
      {mine.map((t) => {
        const overdue = isOverdue(t, today)
        const progress = progressText(t)
        const Main = onOpen ? 'button' : 'div'
        return (
          <li key={t.id} className={`tw-task${overdue ? ' overdue' : ''}`}>
            <Main {...(onOpen ? { type: 'button', onClick: () => onOpen(t) } : {})} className="tw-task-main">
              <span className="tw-task-title">{t.title}</span>
              <span className="tw-task-meta">
                <span>{STATUS_LABEL[t.status]}</span>
                {t.due_date && <span className={overdue ? 'tw-overdue' : undefined}>{overdue ? `Atrasada · ${dueLabel(t.due_date)}` : `Hasta el ${dueLabel(t.due_date)}`}</span>}
                {progress && <span className="tw-progress">{progress}</span>}
              </span>
            </Main>
          </li>
        )
      })}
    </ul>
  )
}

// «Mis tareas» en el Inicio de una persona de equipo (asId: «Ver como» de la ceo). onOpenAll: ir a Tareas.
export default function MyTeamTasks({ client, zone, asId = null, onOpenAll }) {
  const [tasks, setTasks] = useState(null)
  const [error, setError] = useState(null)

  useEffect(() => {
    if (!client) return
    let active = true
    listTeamTasks(client, asId).then(
      (rows) => active && setTasks(rows || []),
      (err) => active && setError(errorText(err)),
    )
    return () => {
      active = false
    }
  }, [client, asId])

  if (!client) return null
  return (
    <section className="member-panel-access tw-home-tasks">
      <h2>Mis tareas</h2>
      {error ? (
        <p className="sc-message error">{error}</p>
      ) : !tasks ? (
        <p className="sc-zone">Cargando…</p>
      ) : (
        <MyTasksList tasks={tasks} today={keyOf(new Date(), zone)} onOpen={onOpenAll} />
      )}
    </section>
  )
}
