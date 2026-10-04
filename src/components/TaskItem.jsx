import { Check, CalendarClock, ChevronRight } from 'lucide-react'
import { assigneeName, formatDue, isOverdue, sourceLabel } from '../lib/tasks'
import './Tasks.css'

/**
 * Una tarea en una lista: casilla para marcarla hecha, título, responsable, fecha límite (en rojo si
 * está vencida) y, si sale de una reunión, el enlace a esa reunión (o sesión).
 * `sourceExists`: si la reunión sigue existiendo (si no, se muestra sin enlace).
 */
export default function TaskItem({ task, contacts, today, onToggle, onOpen, onOpenSource, showSource = true, sourceExists = true }) {
  const done = task.status === 'done'
  const overdue = isOverdue(task, today)
  return (
    <li className={`task-item${done ? ' done' : ''}${overdue ? ' overdue' : ''}`}>
      <label className="task-check" title={done ? 'Marcar como pendiente' : 'Marcar como hecha'}>
        <input
          type="checkbox"
          checked={done}
          onChange={() => onToggle(task)}
          aria-label={`${done ? 'Hecha' : 'Pendiente'}: ${task.title}`}
        />
        <span className="task-check-box" aria-hidden="true">
          {done && <Check size={14} strokeWidth={2.5} />}
        </span>
      </label>
      <div className="task-body">
        <button type="button" className="task-main" onClick={() => onOpen(task)}>
          <span className="task-title">{task.title}</span>
          <span className="task-meta">
            <span>{assigneeName(task, contacts)}</span>
            {task.dueDate && (
              <span className="task-due">
                <CalendarClock size={12} strokeWidth={2} aria-hidden="true" />
                {overdue ? `Vencida · ${formatDue(task.dueDate)}` : formatDue(task.dueDate)}
              </span>
            )}
          </span>
        </button>
        {showSource && task.source && (
          sourceExists ? (
            <button type="button" className="task-source" onClick={() => onOpenSource(task)}>
              De: {sourceLabel(task.source)}
              <ChevronRight size={13} strokeWidth={2} aria-hidden="true" />
            </button>
          ) : (
            <span className="task-source gone">De: {sourceLabel(task.source)} (ya no está en el calendario)</span>
          )
        )}
      </div>
    </li>
  )
}
