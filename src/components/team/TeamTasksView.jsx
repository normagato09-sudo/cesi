import { useCallback, useEffect, useMemo, useState } from 'react'
import { Plus } from 'lucide-react'
import TaskEditModal from './TaskEditModal.jsx'
import { keyOf } from '../../lib/sharedCalendar'
import {
  PRIORITY_LABEL,
  TASK_STATUSES,
  errorText,
  filterTasks,
  groupTasks,
  isOverdue,
  listAreasForTasks,
  listTeamTasks,
  setTeamTaskStatus,
} from '../../lib/teamWork'
import '../shared/SharedCalendar.css'
import './TeamWork.css'

const NO_TASKS = []

function dueLabel(key) {
  const [y, m, d] = key.split('-')
  return `${Number(d)}/${Number(m)}/${y}`
}

// Tareas del equipo: lista con filtros (mías / de mi área / todas si puedo), agrupada por estado,
// con las atrasadas en rojo. me: { id, role, area, boss }. asId + readOnly: «Ver como» de la ceo.
export default function TeamTasksView({ client, me, zone, asId = null, readOnly = false, title = 'Tareas' }) {
  const [tasks, setTasks] = useState(null)
  const [areas, setAreas] = useState([])
  const [error, setError] = useState(null)
  const [reload, setReload] = useState(0)
  const [filter, setFilter] = useState(me.boss ? 'all' : 'mine')
  const [editing, setEditing] = useState(null) // { task } (null: nueva)
  const [busyId, setBusyId] = useState(null)

  useEffect(() => {
    if (!client) return
    let active = true
    Promise.all([listTeamTasks(client, asId), listAreasForTasks(client)]).then(
      ([rows, areaRows]) => {
        if (!active) return
        setTasks(rows || [])
        setAreas(areaRows)
        setError(null)
      },
      (err) => active && setError(errorText(err)),
    )
    return () => {
      active = false
    }
  }, [client, asId, reload])

  const refresh = useCallback(() => setReload((n) => n + 1), [])
  const today = keyOf(new Date(), zone)
  // Sin cliente (vista previa de un ejemplo, sin cuenta): ninguna.
  const shownTasks = client ? tasks : NO_TASKS
  const groups = useMemo(() => (shownTasks ? groupTasks(filterTasks(shownTasks, filter, me), today) : null), [shownTasks, filter, me, today])

  const filters = [
    { id: 'mine', label: 'Mías' },
    ...(me.area ? [{ id: 'area', label: 'De mi área' }] : []),
    ...(me.boss ? [{ id: 'all', label: 'Todas' }] : []),
  ]

  const changeStatus = async (task, status) => {
    setBusyId(task.id)
    try {
      await setTeamTaskStatus(client, task.id, status)
      refresh()
    } catch (err) {
      window.alert(errorText(err))
    }
    setBusyId(null)
  }

  const canCreate = !readOnly && !!client && (me.boss || !!me.area)

  return (
    <div className="sc-root">
      <div className="sc-head">
        <div>
          <h1>{title}</h1>
          {!me.boss && !me.area && <p className="sc-zone">Para crear tareas necesitas un área (te la da la dirección en Accesos).</p>}
        </div>
        <button type="button" className="sc-btn-primary" disabled={!canCreate} onClick={() => setEditing({ task: null })}>
          <Plus size={16} strokeWidth={2} />
          Nueva tarea
        </button>
      </div>

      <div className="tw-filters" role="group" aria-label="Qué tareas ver">
        {filters.map((f) => (
          <button key={f.id} type="button" className={`tw-filter${filter === f.id ? ' on' : ''}`} aria-pressed={filter === f.id} onClick={() => setFilter(f.id)}>
            {f.label}
          </button>
        ))}
      </div>

      {error ? (
        <p className="sc-message error">{error}</p>
      ) : !groups ? (
        <p className="sc-message">Cargando…</p>
      ) : groups.every((g) => g.tasks.length === 0) ? (
        <p className="sc-message">No hay tareas aquí.</p>
      ) : (
        groups.map((group) => (
          <section key={group.id} className="tw-group">
            <h2>
              {group.label} ({group.tasks.length})
            </h2>
            {group.tasks.length > 0 && (
              <ul className="tw-list">
                {group.tasks.map((t) => {
                  const overdue = isOverdue(t, today)
                  return (
                    <li key={t.id} className={`tw-task${overdue ? ' overdue' : ''}${t.status === 'hecha' ? ' done' : ''}`}>
                      <button type="button" className="tw-task-main" onClick={() => setEditing({ task: t })}>
                        <span className="tw-task-title">{t.title}</span>
                        <span className="tw-task-meta">
                          {t.area_name && <span>{t.area_name}</span>}
                          <span>{t.assignee_name ? `→ ${t.assignee_name}` : 'Sin asignar'}</span>
                          {t.due_date && <span className={overdue ? 'tw-overdue' : undefined}>{overdue ? `Atrasada · ${dueLabel(t.due_date)}` : `Hasta el ${dueLabel(t.due_date)}`}</span>}
                          <span className={t.priority === 'alta' ? 'tw-priority-alta' : undefined}>Prioridad {PRIORITY_LABEL[t.priority].toLowerCase()}</span>
                        </span>
                      </button>
                      <select
                        className="tw-status"
                        value={t.status}
                        aria-label={`Estado de «${t.title}»`}
                        disabled={readOnly || !t.can_status || busyId === t.id}
                        onChange={(e) => changeStatus(t, e.target.value)}
                      >
                        {TASK_STATUSES.map((s) => (
                          <option key={s.id} value={s.id}>
                            {s.label}
                          </option>
                        ))}
                      </select>
                    </li>
                  )
                })}
              </ul>
            )}
          </section>
        ))
      )}

      {editing && (
        <TaskEditModal
          client={client}
          me={me}
          task={editing.task}
          areas={areas}
          readOnly={readOnly}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null)
            refresh()
          }}
        />
      )}
    </div>
  )
}
