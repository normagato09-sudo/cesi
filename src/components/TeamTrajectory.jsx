import { useState } from 'react'
import { AlertTriangle, Pencil, Plus, Trash2 } from 'lucide-react'
import {
  dayShort,
  missingStartText,
  newRoleId,
  roleDatesText,
  roleDurationText,
  rolesOf,
  sortRoles,
  tenure,
  tenureText,
  validateRole,
} from '../lib/trajectory'
import './EventFormModal.css'
import './TeamTrajectory.css'

// Total de tiempo en CESI y aviso de las fechas que faltan (arriba del perfil y de la trayectoria).
export function TenureSummary({ profile, now, className = '' }) {
  const t = tenure(profile, now)
  const total = tenureText(t)
  const missing = missingStartText(t.missingStart)
  if (!total && !missing) return null
  return (
    <div className={`tenure-summary ${className}`}>
      {total && <p className="tenure-total">{total}</p>}
      {missing && (
        <p className="tenure-missing" role="status">
          <AlertTriangle size={14} strokeWidth={1.75} />
          {missing}
        </p>
      )}
    </div>
  )
}

function RoleForm({ initial, areas, joinedAt, onSave, onCancel }) {
  const [role, setRole] = useState(initial.role || '')
  const [area, setArea] = useState(initial.area || '')
  const [start, setStart] = useState(initial.start || '')
  const [current, setCurrent] = useState(!initial.end)
  const [end, setEnd] = useState(initial.end || '')
  const [error, setError] = useState(null)
  const areaOptions = area && !areas.includes(area) ? [...areas, area] : areas

  const handleSave = () => {
    const entry = { ...initial, role: role.trim(), area, start: start || null, end: current ? null : end || null }
    if (!current && !entry.end) return setError('Indica la fecha de fin o marca «Rol actual».')
    const problem = validateRole(entry)
    if (problem) return setError(problem)
    onSave(entry)
  }

  return (
    <div className="role-form">
      <div className="event-form-row">
        <label className="event-form-field">
          <span>Rol</span>
          <input type="text" value={role} onChange={(e) => setRole(e.target.value)} placeholder="Moderadora" autoFocus />
        </label>
        <label className="event-form-field">
          <span>Departamento</span>
          <select value={area} onChange={(e) => setArea(e.target.value)}>
            <option value="">Sin departamento</option>
            {areaOptions.map((a) => (
              <option key={a} value={a}>
                {a}
              </option>
            ))}
          </select>
        </label>
      </div>
      <div className="event-form-row">
        <label className="event-form-field">
          <span>Fecha de inicio</span>
          <input type="date" value={start} onChange={(e) => setStart(e.target.value)} />
        </label>
        <div className="event-form-field">
          <span>Fecha de fin</span>
          {current ? (
            <p className="role-form-current">Actual</p>
          ) : (
            <input type="date" value={end} onChange={(e) => setEnd(e.target.value)} aria-label="Fecha de fin" />
          )}
          <label className="role-form-check">
            <input type="checkbox" checked={current} onChange={(e) => setCurrent(e.target.checked)} />
            Rol actual
          </label>
        </div>
      </div>
      {!start && joinedAt && (
        <button type="button" className="role-form-suggest" onClick={() => setStart(joinedAt)}>
          Usar fecha de incorporación ({dayShort(joinedAt)})
        </button>
      )}
      {error && <div className="event-form-error">{error}</div>}
      <div className="role-form-actions">
        <button type="button" className="contact-action-btn" onClick={onCancel}>
          Cancelar
        </button>
        <button type="button" className="contact-action-btn primary" onClick={handleSave}>
          Guardar rol
        </button>
      </div>
    </div>
  )
}

/**
 * Trayectoria en CESI: roles del más reciente al más antiguo, con su duración y el total arriba.
 * Con `onChange(roles)` se pueden añadir, editar y borrar entradas; sin él, solo se ve.
 * `joinedAt`: fecha de incorporación antigua, que se ofrece para los roles sin fecha de inicio.
 */
export default function TeamTrajectory({ profile, now, areas = [], joinedAt = '', onChange = null, title = 'Trayectoria en CESI' }) {
  const [editing, setEditing] = useState(null) // id del rol, 'new' o null
  const roles = sortRoles(rolesOf(profile))
  const editable = !!onChange

  const save = (entry) => {
    const next = editing === 'new' ? [...roles, { ...entry, id: newRoleId() }] : roles.map((r) => (r.id === entry.id ? entry : r))
    onChange(next)
    setEditing(null)
  }

  const remove = (role) => {
    const label = role.role || role.area || 'este rol'
    if (!window.confirm(`¿Borrar «${label}» de su trayectoria?`)) return
    onChange(roles.filter((r) => r.id !== role.id))
  }

  return (
    <section className="team-section trajectory">
      <div className="trajectory-head">
        <h3>{title}</h3>
        {editable && editing === null && (
          <button type="button" className="trajectory-add" onClick={() => setEditing('new')}>
            <Plus size={14} strokeWidth={2} />
            Añadir rol
          </button>
        )}
      </div>
      <TenureSummary profile={profile} now={now} />

      {editing === 'new' && (
        <RoleForm initial={{ role: '', area: '', start: '', end: null }} areas={areas} joinedAt={joinedAt} onSave={save} onCancel={() => setEditing(null)} />
      )}

      {roles.length === 0 && editing !== 'new' ? (
        <p className="team-empty">{editable ? 'Todavía no hay roles. Añade el primero.' : 'Sin roles apuntados.'}</p>
      ) : (
        <ol className="trajectory-list">
          {roles.map((r) =>
            editing === r.id ? (
              <li key={r.id} className="trajectory-item editing">
                <RoleForm initial={r} areas={areas} joinedAt={joinedAt} onSave={save} onCancel={() => setEditing(null)} />
              </li>
            ) : (
              <li key={r.id} className={`trajectory-item${r.end ? '' : ' current'}${r.start ? '' : ' undated'}`}>
                <div className="trajectory-main">
                  <span className="trajectory-role">
                    {r.role || 'Sin rol'}
                    {!r.end && <span className="trajectory-badge">Actual</span>}
                  </span>
                  {r.area && <span className="trajectory-area">{r.area}</span>}
                  <span className="trajectory-dates">
                    {roleDatesText(r)}
                    {roleDurationText(r, now) && <span className="trajectory-duration"> · {roleDurationText(r, now)}</span>}
                  </span>
                  {!r.start && <span className="trajectory-warning">Falta la fecha de inicio</span>}
                </div>
                {editable && editing === null && (
                  <div className="trajectory-actions">
                    <button type="button" onClick={() => setEditing(r.id)} aria-label={`Editar ${r.role || 'rol'}`} title="Editar">
                      <Pencil size={14} strokeWidth={1.75} />
                    </button>
                    <button type="button" className="danger" onClick={() => remove(r)} aria-label={`Borrar ${r.role || 'rol'}`} title="Borrar">
                      <Trash2 size={14} strokeWidth={1.75} />
                    </button>
                  </div>
                )}
              </li>
            ),
          )}
        </ol>
      )}
    </section>
  )
}
