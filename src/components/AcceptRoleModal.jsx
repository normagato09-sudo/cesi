import { useState } from 'react'
import { BadgeCheck, X } from 'lucide-react'
import { todayKey } from '../lib/team'
import { acceptRole, currentRoles, memberSummary, roleDatesText, roleLabel } from '../lib/trajectory'
import './EventFormModal.css'
import './VacanciesView.css'

/**
 * Aceptar en una vacante a alguien que ya es (o fue) del equipo: su nuevo rol se añade a su
 * trayectoria. Si tiene roles actuales, siempre se pregunta si el nuevo rol se suma a ellos o los
 * sustituye, y cuáles se cierran (con la fecha de inicio del nuevo; siguen en su trayectoria).
 * onSave({ contactPatch, teamProfile }).
 */
export default function AcceptRoleModal({ contact, vacancy, areas = [], now = new Date(), onSave, onClose }) {
  const profile = contact.teamProfile
  const current = currentRoles(profile)
  const [role, setRole] = useState(vacancy?.title || '')
  const [area, setArea] = useState(vacancy?.area || '')
  const [start, setStart] = useState(todayKey(now))
  const [choice, setChoice] = useState(null) // 'add' | 'replace'
  const [closeIds, setCloseIds] = useState([])
  const [error, setError] = useState(null)
  const areaOptions = area && !areas.includes(area) ? [...areas, area] : areas
  const summary = memberSummary(contact, now)

  const toggleClose = (id) => setCloseIds((ids) => (ids.includes(id) ? ids.filter((x) => x !== id) : [...ids, id]))

  const handleSubmit = (e) => {
    e.preventDefault()
    setError(null)
    if (!role.trim()) return setError('Escribe el rol.')
    if (!start) return setError('Indica la fecha de inicio del nuevo rol.')
    if (current.length > 0 && !choice) return setError('Elige si el nuevo rol se suma a sus roles actuales o los sustituye.')
    if (choice === 'replace' && closeIds.length === 0) return setError('Marca qué roles deja.')
    const teamProfile = acceptRole(profile, { role: role.trim(), area, closeIds: choice === 'replace' ? closeIds : [], today: start })
    onSave({ contactPatch: {}, teamProfile })
  }

  return (
    <div className="event-form-backdrop" onClick={onClose}>
      <form className="event-form" onClick={(e) => e.stopPropagation()} onSubmit={handleSubmit} noValidate>
        <div className="event-form-header">
          <h2>
            <BadgeCheck size={17} strokeWidth={1.75} />
            Nuevo rol de {contact.name}
          </h2>
          <button type="button" className="event-form-close" onClick={onClose} aria-label="Cerrar">
            <X size={18} strokeWidth={1.75} />
          </button>
        </div>

        <div className="event-form-body">
          {summary && <p className="candidate-form-vacancy">{summary.text}</p>}

          <div className="event-form-row">
            <label className="event-form-field">
              <span>Rol</span>
              <input type="text" value={role} onChange={(e) => setRole(e.target.value)} autoFocus />
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

          <label className="event-form-field">
            <span>Fecha de inicio</span>
            <input type="date" value={start} onChange={(e) => setStart(e.target.value)} />
          </label>

          {current.length > 0 ? (
            <fieldset className="accept-role-choice">
              <legend>¿Qué pasa con sus roles actuales?</legend>
              <label>
                <input type="radio" name="accept-role" checked={choice === 'add'} onChange={() => setChoice('add')} />
                Se suma: sigue también con {current.length === 1 ? 'su rol actual' : 'sus roles actuales'}
              </label>
              <label>
                <input type="radio" name="accept-role" checked={choice === 'replace'} onChange={() => setChoice('replace')} />
                Sustituye: deja alguno de sus roles actuales
              </label>
              {choice === 'replace' && (
                <div className="accept-role-close">
                  {current.map((r) => (
                    <label key={r.id}>
                      <input type="checkbox" checked={closeIds.includes(r.id)} onChange={() => toggleClose(r.id)} />
                      {roleLabel(r) || 'Sin rol'} ({roleDatesText(r)})
                    </label>
                  ))}
                  <em className="team-fieldset-hint">Los que marques terminan el día que empieza el nuevo y siguen en su trayectoria.</em>
                </div>
              )}
            </fieldset>
          ) : (
            <p className="team-fieldset-hint">Vuelve al equipo: sus roles anteriores se conservan en su trayectoria.</p>
          )}

          {error && <div className="event-form-error">{error}</div>}
        </div>

        <div className="event-form-footer">
          <button type="button" className="event-form-cancel" onClick={onClose}>
            Cancelar
          </button>
          <button type="submit" className="event-form-submit">
            Aceptar e incorporar
          </button>
        </div>
      </form>
    </div>
  )
}
