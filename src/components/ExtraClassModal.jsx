import { useState } from 'react'
import { CalendarPlus, Trash2, X } from 'lucide-react'
import { classWhen, courseZone, extraClassFormValues, extraClassKey, extraClassTimes, validateExtraClass } from '../lib/attendance'
import { CLASS_DURATIONS, durationLabel } from '../lib/courses'
import { SPAIN_ZONE, zonePlace } from '../lib/timezones'
import './EventFormModal.css'
import './StudentsView.css'

// Crear, cambiar o borrar una clase suelta (p. ej. de recuperación). La hora se escribe en la zona
// del curso, como el horario, y se ve también en mi hora.
export default function ExtraClassModal({ course, contacts, extra, attendance, onSave, onDelete, onClose }) {
  const zone = extra?.timeZone || courseZone(course, contacts)
  const initial = extra ? extraClassFormValues(extra) : { date: '', start: '', minutes: course.classMinutes, note: '' }
  const [date, setDate] = useState(initial.date)
  const [start, setStart] = useState(initial.start)
  const [minutes, setMinutes] = useState(initial.minutes)
  const [note, setNote] = useState(initial.note)
  const [formError, setFormError] = useState(null)

  const values = { date, start, minutes, note }
  const times = extraClassTimes(values, zone)
  const durations = CLASS_DURATIONS.includes(minutes) ? CLASS_DURATIONS : [...CLASS_DURATIONS, minutes].sort((a, b) => a - b)

  const handleSubmit = (e) => {
    e.preventDefault()
    const problem = validateExtraClass(values, zone)
    if (problem) {
      setFormError(problem)
      return
    }
    try {
      onSave(course.id, values, zone, extra?.id || null)
      onClose()
    } catch (err) {
      setFormError(err.message || 'No se pudo guardar. Inténtalo de nuevo.')
    }
  }

  const handleDelete = () => {
    const count = attendance.filter((r) => r.classKey === extraClassKey(extra.id)).length
    const what = count ? ` Se borrará también su pase de lista (${count} alumno${count === 1 ? '' : 's'}).` : ''
    if (!window.confirm(`¿Borrar esta clase suelta?${what}`)) return
    onDelete(extra.id)
    onClose()
  }

  return (
    <div className="event-form-backdrop" onClick={onClose}>
      <form className="event-form" onClick={(e) => e.stopPropagation()} onSubmit={handleSubmit} noValidate>
        <div className="event-form-header">
          <h2>
            <CalendarPlus size={17} strokeWidth={1.75} />
            {extra ? 'Clase suelta' : 'Nueva clase suelta'} · {course.name}
          </h2>
          <button type="button" className="event-form-close" onClick={onClose} aria-label="Cerrar">
            <X size={18} strokeWidth={1.75} />
          </button>
        </div>

        <div className="event-form-body">
          <p className="contact-form-hint">
            En hora de {zonePlace(zone)}. No sale en tu calendario.
          </p>
          <div className="event-form-row">
            <label className="event-form-field">
              <span>Fecha</span>
              <input type="date" value={date} onChange={(e) => setDate(e.target.value)} autoFocus />
            </label>
            <label className="event-form-field">
              <span>Hora</span>
              <input type="time" value={start} onChange={(e) => setStart(e.target.value)} />
            </label>
          </div>
          <div className="event-form-row">
            <label className="event-form-field">
              <span>Duración</span>
              <select value={minutes} onChange={(e) => setMinutes(Number(e.target.value))}>
                {durations.map((m) => (
                  <option key={m} value={m}>
                    {durationLabel(m)}
                  </option>
                ))}
              </select>
            </label>
            <label className="event-form-field">
              <span>Nota (opcional)</span>
              <input type="text" value={note} onChange={(e) => setNote(e.target.value)} placeholder="Recuperación" />
            </label>
          </div>
          {times && zone !== SPAIN_ZONE && <p className="contact-form-hint">En tu hora: {classWhen(times, SPAIN_ZONE)}</p>}

          {formError && <div className="event-form-error">{formError}</div>}
        </div>

        <div className="event-form-footer">
          {extra && (
            <button type="button" className="event-form-cancel extra-class-delete" onClick={handleDelete}>
              <Trash2 size={14} strokeWidth={1.75} />
              Borrar
            </button>
          )}
          <button type="button" className="event-form-cancel" onClick={onClose}>
            Cancelar
          </button>
          <button type="submit" className="event-form-submit">
            {extra ? 'Guardar' : 'Añadir clase'}
          </button>
        </div>
      </form>
    </div>
  )
}
