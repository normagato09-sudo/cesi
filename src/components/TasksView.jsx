import { useMemo, useState } from 'react'
import { ListTodo, Plus } from 'lucide-react'
import TaskItem from './TaskItem.jsx'
import { DEFAULT_FILTER, DUE_FILTERS, ME, STATUS_FILTERS, assigneesOf, filterTasks, isOverdue, sourceOccurrence } from '../lib/tasks'
import './Tasks.css'

// Sección "Tareas": todas las tareas (de reuniones y sueltas), filtrables por persona, estado y fecha.
export default function TasksView({ tasks, contacts, rawEvents, today, onNewTask, onOpenTask, onToggleTask, onOpenSource }) {
  const [filter, setFilter] = useState(DEFAULT_FILTER)
  const people = useMemo(() => assigneesOf(tasks, contacts), [tasks, contacts])
  const shown = useMemo(() => filterTasks(tasks, filter, today), [tasks, filter, today])
  const overdueCount = tasks.filter((t) => isOverdue(t, today)).length
  const set = (field) => (e) => setFilter((f) => ({ ...f, [field]: e.target.value }))
  const filtered = filter.assignee !== 'all' || filter.status !== DEFAULT_FILTER.status || filter.due !== 'all'

  return (
    <div className="tasks-view">
      <header className="tasks-header">
        <div>
          <h1>
            <ListTodo size={20} strokeWidth={1.75} />
            Tareas
          </h1>
          {overdueCount > 0 && (
            <button type="button" className="tasks-overdue-badge" onClick={() => setFilter({ assignee: 'all', status: 'pending', due: 'overdue' })}>
              {overdueCount === 1 ? '1 vencida' : `${overdueCount} vencidas`}
            </button>
          )}
        </div>
        <button type="button" className="tasks-new" onClick={() => onNewTask({})}>
          <Plus size={16} strokeWidth={2} />
          Nueva tarea
        </button>
      </header>

      <div className="tasks-filters" role="group" aria-label="Filtrar tareas">
        <label>
          <span>Persona</span>
          <select value={filter.assignee} onChange={set('assignee')}>
            <option value="all">Todas</option>
            <option value={ME}>Yo</option>
            {people.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </label>
        <label>
          <span>Estado</span>
          <select value={filter.status} onChange={set('status')}>
            {STATUS_FILTERS.map((s) => (
              <option key={s.id} value={s.id}>
                {s.label}
              </option>
            ))}
          </select>
        </label>
        <label>
          <span>Fecha</span>
          <select value={filter.due} onChange={set('due')}>
            {DUE_FILTERS.map((s) => (
              <option key={s.id} value={s.id}>
                {s.label}
              </option>
            ))}
          </select>
        </label>
      </div>

      {shown.length === 0 ? (
        <div className="tasks-empty">
          {tasks.length === 0 ? (
            <p>Todavía no hay tareas. Créalas aquí o desde el acta de una reunión.</p>
          ) : (
            <p>No hay tareas con estos filtros.</p>
          )}
          {filtered && (
            <button type="button" className="tasks-clear" onClick={() => setFilter(DEFAULT_FILTER)}>
              Quitar filtros
            </button>
          )}
        </div>
      ) : (
        <ul className="task-list">
          {shown.map((task) => (
            <TaskItem
              key={task.id}
              task={task}
              contacts={contacts}
              today={today}
              onToggle={onToggleTask}
              onOpen={onOpenTask}
              onOpenSource={onOpenSource}
              sourceExists={!task.source || !!sourceOccurrence(task, rawEvents)}
            />
          ))}
        </ul>
      )}
    </div>
  )
}
