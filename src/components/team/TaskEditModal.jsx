import { useEffect, useMemo, useState } from 'react'
import Modal from '../shared/Modal.jsx'
import AssigneePicker from './AssigneePicker.jsx'
import {
  STATUS_LABEL,
  TASK_PRIORITIES,
  TASK_STATUSES,
  assigneesLabel,
  deleteTeamTask,
  emptyTaskForm,
  errorText,
  formFromTask,
  listTaskPeople,
  saveTeamTask,
  setTeamTaskStatus,
  validateTaskForm,
} from '../../lib/teamWork'
import { listGoals, monthLabel, taskMonth } from '../../lib/goals'
import { keyOf } from '../../lib/sharedCalendar'
import './TeamWork.css'

// Nueva tarea del equipo o editar una (quien la creó, Directivo o la ceo). Directivo y la ceo
// eligen área y a quién (una o varias personas, o un área entera); los demás, solo su área y para
// sí mismos. Cada persona asignada marca su parte; quien la creó, Directivo y la ceo pueden
// cambiar la de cualquiera. Sin permiso para editarla (o en «Ver como»), solo se ve.
// me: { id, area, boss }; areas: [{ id, name }]. prefill: datos de una tarea nueva ({ title,
// description }, p. ej. desde el acta de una reunión). onChanged: al cambiar una parte (sin cerrar).
// zone: para saber el mes de hoy (los objetivos que se pueden elegir son los del área de la tarea
// en el mes de su fecha límite o, sin fecha, en el actual).
export default function TaskEditModal({ client, me, zone, task = null, prefill = null, areas, readOnly = false, onClose, onSaved, onChanged = null }) {
  const [form, setForm] = useState(() => (task ? formFromTask(task) : { ...emptyTaskForm(me), ...prefill }))
  const [people, setPeople] = useState(null)
  const [goals, setGoals] = useState(null) // null: sin cargar (o sin la parte 14)
  const goalMonth = taskMonth(form.dueDate, keyOf(new Date(), zone))
  const [parts, setParts] = useState(() => task?.assignees || [])
  const [partBusy, setPartBusy] = useState(null)
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

  useEffect(() => {
    if (!client || !form.area) return
    let active = true
    listGoals(client, goalMonth, { area: form.area, withUnclosed: false }).then(
      (rows) => active && setGoals(rows || []),
      () => active && setGoals(null),
    )
    return () => {
      active = false
    }
  }, [client, form.area, goalMonth])

  // El objetivo al que ya está unida aunque sea de otro mes.
  const goalOptions = useMemo(() => {
    const list = (form.area ? goals || [] : []).map((g) => ({ id: g.id, title: g.title }))
    if (task?.goal_id && task.goal_id === form.goalId && !list.some((g) => g.id === task.goal_id)) list.push({ id: task.goal_id, title: task.goal_title || 'Objetivo' })
    return list
  }, [goals, form.area, form.goalId, task])

  const areaOptions = me.boss ? areas : areas.filter((a) => a.id === me.area)
  // Las personas asignadas aunque ya no estén en la lista.
  const peopleOptions = useMemo(() => {
    const list = [...(people || [])]
    for (const a of task?.assignees || []) if (!a.gone && !list.some((p) => p.id === a.id)) list.push({ id: a.id, name: a.name, area: a.area })
    return list
  }, [people, task])
  // El estado de la tarea se elige a mano solo si no tiene a nadie asignado.
  const manualStatus = form.mode === 'people' && form.assignees.length === 0

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

  const changePart = async (part, status) => {
    setPartBusy(part.id)
    setError(null)
    try {
      await setTeamTaskStatus(client, task.id, status, part.id === me.id ? null : part.id)
      setParts((list) => list.map((p) => (p.id === part.id && !p.gone ? { ...p, status } : p)))
      onChanged?.()
    } catch (err) {
      setError(errorText(err))
    }
    setPartBusy(null)
  }

  const handleSubmit = (e) => {
    e.preventDefault()
    if (!canEdit) return
    setTried(true)
    if (Object.keys(validateTaskForm(form)).length > 0) return
    run(() => saveTeamTask(client, task?.id || null, form))
  }

  const field = (name) => `sc-field${errors[name] ? ' invalid' : ''}`
  const live = parts.filter((p) => !p.gone)
  const doneCount = live.filter((p) => p.status === 'hecha').length

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
              <select value={form.area} onChange={(e) => set({ area: e.target.value, goalId: '' })} disabled={!me.boss}>
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
            <label className={field('dueDate')}>
              <span>Fecha límite</span>
              <input type="date" value={form.dueDate} onChange={(e) => set({ dueDate: e.target.value })} />
              {errors.dueDate && <span className="sc-error">{errors.dueDate}</span>}
            </label>
          </div>
          {(goals !== null || form.goalId) && (
            <label className="sc-field">
              <span>Objetivo (opcional)</span>
              <select value={form.goalId} onChange={(e) => set({ goalId: e.target.value })}>
                <option value="">Sin objetivo</option>
                {goalOptions.map((g) => (
                  <option key={g.id} value={g.id}>
                    {g.title}
                  </option>
                ))}
              </select>
              {form.area && goals && goals.length === 0 && !form.goalId && <span className="sc-zone">El área no tiene objetivos de {monthLabel(goalMonth)}.</span>}
            </label>
          )}
          {canEdit && me.boss ? (
            people === null ? (
              <p className="sc-zone">Cargando personas…</p>
            ) : (
              <AssigneePicker people={peopleOptions} areas={areas} form={form} onChange={set} error={errors.assignArea} />
            )
          ) : (
            <label className="sc-field">
              <span>Asignada a</span>
              <input type="text" value={task ? assigneesLabel(task, 4) : 'Tú'} disabled />
            </label>
          )}
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
            {manualStatus && (
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
            )}
          </div>
        </fieldset>

        {task && parts.length > 0 && (
          <section className="tw-parts" aria-label="Partes de cada persona">
            <h3>
              {live.length > 1 ? `${doneCount} de ${live.length} hechas` : 'Su parte'}
              {' · '}
              <span className="sc-zone">La tarea queda hecha cuando todos la terminan.</span>
            </h3>
            <ul>
              {parts.map((p) => {
                const mayChange = !readOnly && !p.gone && (task.can_edit || p.id === me.id)
                return (
                  <li key={p.gone ? `gone:${p.name}` : p.id} className={p.status === 'hecha' ? 'done' : undefined}>
                    <span>
                      {p.name}
                      {p.id === me.id ? ' (tú)' : ''}
                    </span>
                    {mayChange ? (
                      <select className="tw-status" value={p.status} aria-label={`Parte de ${p.name}`} disabled={partBusy === p.id} onChange={(e) => changePart(p, e.target.value)}>
                        {TASK_STATUSES.map((s) => (
                          <option key={s.id} value={s.id}>
                            {s.label}
                          </option>
                        ))}
                      </select>
                    ) : (
                      <span className="tw-part-status">{STATUS_LABEL[p.status]}</span>
                    )}
                  </li>
                )
              })}
            </ul>
          </section>
        )}

        {task && (
          <p className="sc-zone">
            Creada por {task.created_by_name || '—'}
            {task.assigned_area_name ? ` · asignada a toda el área ${task.assigned_area_name}` : ''}
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
