import { useMemo, useState } from 'react'
import { ListTodo, Trash2, X } from 'lucide-react'
import { ME, sourceLabel, validateTask } from '../lib/tasks'
import './AvailabilityModal.css'
import './Tasks.css'

/**
 * Crear o editar una tarea. `task`: la que se edita (o null). `initial`: datos de una nueva
 * ({ title, source, decisionId } si sale del acta de una reunión o de una decisión).
 */
export default function TaskFormModal({ task = null, initial = {}, contacts, onSave, onDelete, onClose }) {
  const start = task || initial
  const [title, setTitle] = useState(start.title || '')
  const [assignee, setAssignee] = useState(start.assignee || ME)
  const [dueDate, setDueDate] = useState(start.dueDate || '')
  const [status, setStatus] = useState(start.status || 'pending')
  const [error, setError] = useState(null)
  const source = start.source || null

  const people = useMemo(
    () =>
      contacts
        .filter((c) => !c.archived || c.id === start.assignee)
        .sort((a, b) => (a.name || '').localeCompare(b.name || '', 'es', { sensitivity: 'base' })),
    [contacts, start.assignee],
  )
  const missingAssignee = assignee !== ME && !contacts.some((c) => c.id === assignee)

  const handleSubmit = (e) => {
    e.preventDefault()
    const problem = validateTask({ title, dueDate })
    if (problem) {
      setError(problem)
      return
    }
    onSave({ title, assignee, dueDate: dueDate || null, status, source, decisionId: start.decisionId || null })
    onClose()
  }

  const handleDelete = () => {
    if (!window.confirm('¿Eliminar esta tarea?')) return
    onDelete(task.id)
    onClose()
  }

  return (
    <div className="availability-backdrop task-modal-backdrop" onClick={onClose}>
      <form
        className="availability-modal task-modal"
        onClick={(e) => e.stopPropagation()}
        onSubmit={handleSubmit}
        aria-labelledby="task-modal-title"
      >
        <div className="availability-header">
          <h2 id="task-modal-title">
            <ListTodo size={17} strokeWidth={1.75} />
            {task ? 'Tarea' : 'Nueva tarea'}
          </h2>
          <button type="button" className="availability-close" onClick={onClose} aria-label="Cerrar">
            <X size={18} strokeWidth={1.75} />
          </button>
        </div>

        <div className="availability-scroll task-form">
          {source && <p className="task-form-source">De la reunión: {sourceLabel(source)}</p>}

          <label className="task-field">
            <span>Qué hay que hacer</span>
            <textarea
              value={title}
              onChange={(e) => setTitle(e.target.value.replace(/\n/g, ' '))}
              rows={2}
              autoFocus={!task}
              placeholder="Enviar el presupuesto a Ana…"
            />
          </label>

          <label className="task-field">
            <span>Responsable</span>
            <select value={assignee} onChange={(e) => setAssignee(e.target.value)}>
              <option value={ME}>Yo</option>
              {missingAssignee && <option value={assignee}>Contacto borrado</option>}
              {people.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </label>

          <label className="task-field">
            <span>Fecha límite (opcional)</span>
            <input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
          </label>

          <fieldset className="task-field task-status">
            <legend>Estado</legend>
            <div className="task-status-options">
              {[
                ['pending', 'Pendiente'],
                ['done', 'Hecha'],
              ].map(([value, label]) => (
                <label key={value} className={status === value ? 'active' : ''}>
                  <input type="radio" name="task-status" value={value} checked={status === value} onChange={() => setStatus(value)} />
                  {label}
                </label>
              ))}
            </div>
          </fieldset>

          {error && (
            <div className="availability-error" role="alert">
              {error}
            </div>
          )}
        </div>

        <div className="availability-footer task-form-footer">
          {task && (
            <button type="button" className="task-delete" onClick={handleDelete}>
              <Trash2 size={15} strokeWidth={1.75} />
              Eliminar
            </button>
          )}
          <button type="button" className="availability-cancel" onClick={onClose}>
            Cancelar
          </button>
          <button type="submit" className="availability-submit">
            Guardar
          </button>
        </div>
      </form>
    </div>
  )
}
