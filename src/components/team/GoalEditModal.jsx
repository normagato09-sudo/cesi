import { useEffect, useMemo, useState } from 'react'
import Modal from '../shared/Modal.jsx'
import { GOAL_STATUSES, deleteGoal, emptyGoalForm, formFromGoal, goalErrorText, goalProgressText, monthStart, saveGoal, validateGoalForm } from '../../lib/goals'
import { listTaskPeople } from '../../lib/teamWork'

// Nuevo objetivo o editar uno (Directivo y la ceo: también cerrarlo o borrarlo). Sin permiso (o en
// «Ver como»), solo se ve. start: { area, month } del objetivo nuevo; areas: [{ id, name }].
export default function GoalEditModal({ client, goal = null, start = null, areas, readOnly = false, onClose, onSaved }) {
  const [form, setForm] = useState(() => (goal ? formFromGoal(goal) : emptyGoalForm(start)))
  const [people, setPeople] = useState([])
  const [tried, setTried] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)
  const canEdit = !readOnly && (!goal || goal.can_edit)
  const errors = useMemo(() => (tried ? validateGoalForm(form) : {}), [tried, form])
  const set = (patch) => setForm((f) => ({ ...f, ...patch }))

  useEffect(() => {
    if (!canEdit) return
    let active = true
    listTaskPeople(client).then(
      (rows) => active && setPeople(rows || []),
      (err) => active && setError(goalErrorText(err)),
    )
    return () => {
      active = false
    }
  }, [client, canEdit])

  // El responsable aunque no esté en la lista (p. ej. al verlo sin poder editar).
  const peopleOptions = useMemo(() => {
    const list = [...people]
    if (goal?.owner_id && !list.some((p) => p.id === goal.owner_id)) list.push({ id: goal.owner_id, name: goal.owner_name })
    return list
  }, [people, goal])

  const run = async (action) => {
    setBusy(true)
    setError(null)
    try {
      await action()
      onSaved()
    } catch (err) {
      setError(goalErrorText(err))
      setBusy(false)
    }
  }

  const handleSubmit = (e) => {
    e.preventDefault()
    if (!canEdit) return
    setTried(true)
    if (Object.keys(validateGoalForm(form)).length > 0) return
    run(() => saveGoal(client, goal?.id || null, form))
  }

  const field = (name) => `sc-field${errors[name] ? ' invalid' : ''}`

  return (
    <Modal title={goal ? (canEdit ? 'Editar objetivo' : 'Objetivo') : 'Nuevo objetivo'} onClose={onClose}>
      <form className="sc-form" onSubmit={handleSubmit} noValidate>
        <fieldset disabled={!canEdit} style={{ display: 'contents' }}>
          <label className={field('title')}>
            <span>Título</span>
            <input type="text" value={form.title} maxLength={200} onChange={(e) => set({ title: e.target.value })} autoFocus={canEdit} />
            {errors.title && <span className="sc-error">{errors.title}</span>}
          </label>
          <label className="sc-field">
            <span>Descripción (opcional)</span>
            <textarea value={form.description} maxLength={2000} onChange={(e) => set({ description: e.target.value })} />
          </label>
          <div className="sc-row">
            <label className={field('area')}>
              <span>Área</span>
              <select value={form.area} onChange={(e) => set({ area: e.target.value })}>
                <option value="">Elige el área</option>
                {areas.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name}
                  </option>
                ))}
                {goal?.area && !areas.some((a) => a.id === goal.area) && <option value={goal.area}>{goal.area_name || goal.area}</option>}
              </select>
              {errors.area && <span className="sc-error">{errors.area}</span>}
            </label>
            <label className={field('month')}>
              <span>Mes</span>
              <input type="month" value={(form.month || '').slice(0, 7)} onChange={(e) => set({ month: e.target.value ? monthStart(e.target.value) : '' })} />
              {errors.month && <span className="sc-error">{errors.month}</span>}
            </label>
          </div>
          <div className="sc-row">
            <label className="sc-field">
              <span>Responsable (opcional)</span>
              <select value={form.owner} onChange={(e) => set({ owner: e.target.value })}>
                <option value="">Sin responsable</option>
                {peopleOptions.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="sc-field">
              <span>Estado</span>
              <select value={form.status} onChange={(e) => set({ status: e.target.value })}>
                {GOAL_STATUSES.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.label}
                  </option>
                ))}
              </select>
            </label>
          </div>
        </fieldset>

        {goal && (
          <p className="sc-zone">
            {goal.unclosed ? 'Sin cerrar: es de un mes ya pasado y sigue en curso. ' : ''}
            {goal.tasks_count} {goal.tasks_count === 1 ? 'tarea' : 'tareas'} · {goalProgressText(goal)}
            {goal.created_by_name ? ` · Creado por ${goal.created_by_name}` : ''}
          </p>
        )}

        {error && <p className="sc-message error">{error}</p>}

        <div className="sc-actions">
          {goal && canEdit && (
            <button
              type="button"
              className="sc-btn-danger"
              disabled={busy}
              onClick={() => window.confirm(`¿Borrar el objetivo «${goal.title}»? Sus tareas se quedan, sin objetivo.`) && run(() => deleteGoal(client, goal.id))}
            >
              Borrar
            </button>
          )}
          <button type="button" className="sc-btn" onClick={onClose}>
            {canEdit ? 'Cancelar' : 'Cerrar'}
          </button>
          {canEdit && (
            <button type="submit" className="sc-btn-primary" disabled={busy}>
              {busy ? 'Guardando…' : goal ? 'Guardar cambios' : 'Crear objetivo'}
            </button>
          )}
        </div>
      </form>
    </Modal>
  )
}
