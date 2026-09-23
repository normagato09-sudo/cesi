import { useState } from 'react'
import { X, UserPlus, UserPen } from 'lucide-react'
import TimeZoneSelect from './TimeZoneSelect.jsx'
import WeeklyScheduleEditor from './WeeklyScheduleEditor.jsx'
import { isEmail, validateContactCountry } from '../lib/contacts'
import { defaultContactZone, zonePlace, zoneValue } from '../lib/timezones'
import { cleanWeek, emptyWeek, normalizeWeek, validateWeek } from '../lib/weeklySchedule'
import './EventFormModal.css'

// Punto de partida al activar la disponibilidad: lunes a viernes de 09:00 a 18:00.
function defaultAvailability() {
  return emptyWeek().map((e) => (e.day >= 1 && e.day <= 5 ? { ...e, enabled: true, slots: [{ start: '09:00', end: '18:00' }] } : e))
}

export default function ContactFormModal({ initialContact, onClose, onSubmit }) {
  const isEditing = !!initialContact
  const seed = initialContact || {}

  const [name, setName] = useState(seed.name || '')
  const [email, setEmail] = useState(seed.email || '')
  const [phone, setPhone] = useState(seed.phone || '')
  const [organization, setOrganization] = useState(seed.organization || '')
  const [role, setRole] = useState(seed.role || '')
  const [notes, setNotes] = useState(seed.notes || '')
  // País obligatorio; los contactos nuevos empiezan con España (península y Baleares).
  const [zone, setZone] = useState(() => zoneValue(seed.timeZone, seed.country) || defaultContactZone())
  const [hasAvailability, setHasAvailability] = useState(!!seed.availability)
  const [availability, setAvailability] = useState(() =>
    seed.availability ? normalizeWeek(seed.availability, defaultAvailability()) : defaultAvailability(),
  )
  const [formError, setFormError] = useState(null)
  const [submitting, setSubmitting] = useState(false)

  const handleSubmit = async (e) => {
    e.preventDefault()
    setFormError(null)

    if (!name.trim()) {
      setFormError('El nombre es obligatorio.')
      return
    }
    if (email.trim() && !isEmail(email)) {
      setFormError('El email no tiene un formato válido.')
      return
    }
    const countryProblem = validateContactCountry(zone || {})
    if (countryProblem) {
      setFormError(countryProblem)
      return
    }
    if (hasAvailability) {
      const problem = validateWeek(availability)
      if (problem) {
        setFormError(`Disponibilidad: ${problem}`)
        return
      }
    }

    setSubmitting(true)
    try {
      await onSubmit({
        name: name.trim(),
        email: email.trim(),
        phone: phone.trim(),
        organization: organization.trim(),
        role: role.trim(),
        notes: notes.trim(),
        country: zone.country,
        timeZone: zone.timeZone,
        // Al guardar desde el formulario el país queda revisado.
        countryUnreviewed: false,
        availability: hasAvailability ? cleanWeek(availability) : null,
      })
      onClose()
    } catch (err) {
      setFormError(err.message || 'No se pudo guardar. Inténtalo de nuevo.')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="event-form-backdrop" onClick={onClose}>
      <form className="event-form contact-form" onClick={(e) => e.stopPropagation()} onSubmit={handleSubmit} noValidate>
        <div className="event-form-header">
          <h2>
            {isEditing ? <UserPen size={17} strokeWidth={1.75} /> : <UserPlus size={17} strokeWidth={1.75} />}
            {isEditing ? 'Editar contacto' : 'Nuevo contacto'}
          </h2>
          <button type="button" className="event-form-close" onClick={onClose} aria-label="Cerrar">
            <X size={18} strokeWidth={1.75} />
          </button>
        </div>

        <div className="event-form-body">
          <label className="event-form-field">
            <span>Nombre</span>
            <input type="text" value={name} onChange={(e) => setName(e.target.value)} placeholder="Nombre y apellidos" autoFocus />
          </label>

          <div className="event-form-row">
            <label className="event-form-field">
              <span>Email (opcional)</span>
              <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="ana@empresa.com" />
            </label>
            <label className="event-form-field">
              <span>Teléfono (opcional)</span>
              <input type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="+34 600 000 000" />
            </label>
          </div>

          <div className="event-form-row">
            <label className="event-form-field">
              <span>Organización (opcional)</span>
              <input type="text" value={organization} onChange={(e) => setOrganization(e.target.value)} placeholder="Empresa" />
            </label>
            <label className="event-form-field">
              <span>Cargo (opcional)</span>
              <input type="text" value={role} onChange={(e) => setRole(e.target.value)} placeholder="Directora comercial" />
            </label>
          </div>

          <div className="event-form-field">
            <TimeZoneSelect label="País" value={zone} onChange={setZone} requireZoneChoice />
            {seed.countryUnreviewed && (
              <p className="contact-form-hint warn">
                País sin revisar: se le asignó España automáticamente. Comprueba que es correcto y guarda.
              </p>
            )}
          </div>

          <div className="contact-form-availability">
            <label className="event-form-checkbox">
              <input type="checkbox" checked={hasAvailability} onChange={(e) => setHasAvailability(e.target.checked)} />
              <span>Disponibilidad habitual (opcional)</span>
            </label>
            {hasAvailability && (
              <>
                <p className="contact-form-hint">
                  Franjas en las que suele poder reunirse, en {zone?.timeZone ? `hora de ${zonePlace(zone.timeZone)}` : 'hora de España'}.
                  "Buscar hueco" solo propone horas que le vengan bien.
                </p>
                <WeeklyScheduleEditor value={availability} onChange={setAvailability} />
              </>
            )}
          </div>

          <label className="event-form-field">
            <span>Notas (opcional)</span>
            <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={3} placeholder="Información útil sobre este contacto..." />
          </label>

          {formError && <div className="event-form-error">{formError}</div>}
        </div>

        <div className="event-form-footer">
          <button type="button" className="event-form-cancel" onClick={onClose} disabled={submitting}>
            Cancelar
          </button>
          <button type="submit" className="event-form-submit" disabled={submitting}>
            {submitting ? 'Guardando...' : isEditing ? 'Guardar cambios' : 'Crear contacto'}
          </button>
        </div>
      </form>
    </div>
  )
}
