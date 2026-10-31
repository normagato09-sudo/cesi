import { useEffect, useMemo, useState } from 'react'
import Modal from '../shared/Modal.jsx'
import {
  TASK_PRIORITIES,
  TASK_STATUSES,
  deleteTeamTask,
  emptyTaskForm,
  errorText,
  formFromTask,
  listTaskPeople,
  saveTeamTask,
  validateTaskForm,
} from '../../lib/teamWork'

// Nueva tarea del equipo o editar una (quien la creó, Directivo o la ceo). Directivo y la ceo
// eligen área y persona; los demás, solo su área y para sí mismos. Sin permiso para editarla
// (o en «Ver como»), solo se ve.
// me: { id, area, boss }; areas: [{ id, name }]. prefill: datos de una tarea nueva ({ title,
// description }, p. ej. desde el acta de una reunión).
export default function TaskEditModal({ client, me, task = null, prefill = null, areas, readOnly = false, onClose, onSaved }) {
  const [form, setForm] = useState(() => (task ? formFromTask(task) : { ...emptyTaskForm(me), ...prefill }))
  const [people, setPeople] = useState(null)
  const [tried, setTried] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)
  const canEdit = !readOnly && (!task || task.can_edit)
  const errors = useMemo(() => (tried ? validateTaskForm(form) : {}), [tried, form])
  const set = (patch) => setForm((f) => ({ ...f, ...patch }))

  useEffect(() => {
    if (!canEdit || !me.boss) return
    let active = true
    listTaskPeople(client).then(
      (rows) => active && setPeople(rows || []),
      (err) => active && setError(errorText(err)),
    )
    return () => {
      active = false
    }
  }, [client, canEdit, me.boss])

  const areaOptions = me.boss ? areas : areas.filter((a) => a.id === me.area)
  // La persona asignada aunque no esté en la lista (p. ej. al verla sin poder editar).
  const peopleOptions = useMemo(() => {
    const list = [...(people || [])]
    if (task?.assignee_id && !list.some((p) => p.id === task.assignee_id)) list.push({ id: task.assignee_id, name: task.assignee_name })
    return list
  }, [people, task])

  const run = async (action) => {
    setBusy(true)
    setError(null)
    try {
      await action()
      onSaved()
    } catch (err) {
      setError(errorText(err))
      setBusy(false)
    }
  }

  const handleSubmit = (e) => {
    e.preventDefault()
    if (!canEdit) return
    setTried(true)
    if (Object.keys(validateTaskForm(form)).length > 0) return
    run(() => saveTeamTask(client, task?.id || null, form))
  }

  const field = (name) => `sc-field${errors[name] ? ' invalid' : ''}`

  return (
    <Modal title={task ? (canEdit ? 'Editar tarea' : 'Tarea') : 'Nueva tarea'} onClose={onClose}>
      <form className="sc-form" onSubmit={handleSubmit} noValidate>
        <fieldset disabled={!canEdit} style={{ display: 'contents' }}>
          <label className={field('title')}>
            <span>Título</span>
            <input type="text" value={form.title} maxLength={200} onChange={(e) => set({ title: e.target.value })} autoFocus={canEdit} />
            {errors.title && <span className="sc-error">{errors.title}</span>}
          </label>
          <label className="sc-field">
            <span>Descripción (opcional)</span>
            <textarea value={form.description} maxLength={4000} onChange={(e) => set({ description: e.target.value })} />
          </label>
          <div className="sc-row">
            <label className={field('area')}>
              <span>Área</span>
              <select value={form.area} onChange={(e) => set({ area: e.target.value })} disabled={!me.boss}>
                <option value="">Elige el área</option>
                {areaOptions.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name}
                  </option>
                ))}
                {task?.area && !areaOptions.some((a) => a.id === task.area) && <option value={task.area}>{task.area_name || task.area}</option>}
              </select>
              {errors.area && <span className="sc-error">{errors.area}</span>}
            </label>
            <label className="sc-field">
              <span>Asignada a</span>
              {me.boss ? (
                <select value={form.assignee} onChange={(e) => set({ assignee: e.target.value })}>
                  <option value="">Sin asignar</option>
                  {peopleOptions.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                </select>
              ) : (
                <input type="text" value={task ? task.assignee_name || 'Sin asignar' : 'Tú'} disabled />
              )}
            </label>
            <label className={field('dueDate')}>
              <span>Fecha límite</span>
              <input type="date" value={form.dueDate} onChange={(e) => set({ dueDate: e.target.value })} />
              {errors.dueDate && <span className="sc-error">{errors.dueDate}</span>}
            </label>
          </div>
          <div className="sc-row">
            <label className="sc-field">
              <span>Prioridad</span>
              <select value={form.priority} onChange={(e) => set({ priority: e.target.value })}>
                {TASK_PRIORITIES.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.label}
                  </option>
                ))}
              </select>
            </label>
            <label className="sc-field">
              <span>Estado</span>
              <select value={form.status} onChange={(e) => set({ status: e.target.value })}>
                {TASK_STATUSES.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.label}
                  </option>
                ))}
              </select>
            </label>
          </div>
        </fieldset>
        {task && (
          <p className="sc-zone">
            Creada por {task.created_by_name || '—'}
            {task.assignee_name ? ` · asignada a ${task.assignee_name}` : ''}
          </p>
        )}

        {error && <p className="sc-message error">{error}</p>}

        <div className="sc-actions">
          {task && canEdit && (
            <button
              type="button"
              className="sc-btn-danger"
              disabled={busy}
              onClick={() => window.confirm(`¿Borrar la tarea «${task.title}»?`) && run(() => deleteTeamTask(client, task.id))}
            >
              Borrar
            </button>
          )}
          <button type="button" className="sc-btn" onClick={onClose}>
            {canEdit ? 'Cancelar' : 'Cerrar'}
          </button>
          {canEdit && (
            <button type="submit" className="sc-btn-primary" disabled={busy}>
              {busy ? 'Guardando…' : task ? 'Guardar cambios' : 'Crear tarea'}
            </button>
          )}
        </div>
      </form>
    </Modal>
  )
}
