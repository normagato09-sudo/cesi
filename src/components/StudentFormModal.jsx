import { useState } from 'react'
import { GraduationCap, X } from 'lucide-react'
import TimeZoneSelect from './TimeZoneSelect.jsx'
import WeeklyScheduleEditor from './WeeklyScheduleEditor.jsx'
import { todayKey, validateStudent } from '../lib/students'
import { defaultContactZone, zonePlace, zoneValue } from '../lib/timezones'
import { cleanWeek, emptyWeek, normalizeWeek } from '../lib/weeklySchedule'
import './EventFormModal.css'
import './GroupsModal.css'
import './StudentsView.css'

const COURSE_COLOR = 'var(--accent)'

// Crear o editar un alumno: datos, país (zona horaria), cursos, alta, disponibilidad y notas.
export default function StudentFormModal({ initialStudent, courses = [], onManageCourses, onClose, onSubmit }) {
  const isEditing = !!initialStudent
  const seed = initialStudent || {}
  const [name, setName] = useState(seed.name || '')
  const [email, setEmail] = useState(seed.email || '')
  const [phone, setPhone] = useState(seed.phone || '')
  // País obligatorio; los alumnos nuevos empiezan con España, como los contactos.
  const [zone, setZone] = useState(() => zoneValue(seed.timeZone, seed.country) || defaultContactZone())
  // Solo cursos que siguen existiendo.
  const [courseIds, setCourseIds] = useState(() => (seed.courseIds || []).filter((id) => courses.some((c) => c.id === id)))
  const [enrolledAt, setEnrolledAt] = useState(seed.enrolledAt || todayKey())
  const [availability, setAvailability] = useState(() => normalizeWeek(seed.availability, emptyWeek()))
  const [notes, setNotes] = useState(seed.notes || '')
  const [formError, setFormError] = useState(null)

  const toggleCourse = (id) => setCourseIds((ids) => (ids.includes(id) ? ids.filter((x) => x !== id) : [...ids, id]))

  const handleSubmit = (e) => {
    e.preventDefault()
    const week = cleanWeek(availability)
    const data = {
      name: name.trim(),
      email: email.trim(),
      phone: phone.trim(),
      country: zone?.country || '',
      timeZone: zone?.timeZone || '',
      // Por si se ha borrado algún curso con el formulario abierto.
      courseIds: courseIds.filter((id) => courses.some((c) => c.id === id)),
      enrolledAt,
      // Sin ningún día con franjas no hay disponibilidad.
      availability: week.some((d) => d.enabled) ? week : null,
      notes: notes.trim(),
    }
    const problem = validateStudent(data)
    if (problem) {
      setFormError(problem)
      return
    }
    try {
      onSubmit(data)
      onClose()
    } catch (err) {
      setFormError(err.message || 'No se pudo guardar. Inténtalo de nuevo.')
    }
  }

  return (
    <div className="event-form-backdrop" onClick={onClose}>
      <form className="event-form contact-form" onClick={(e) => e.stopPropagation()} onSubmit={handleSubmit} noValidate>
        <div className="event-form-header">
          <h2>
            <GraduationCap size={17} strokeWidth={1.75} />
            {isEditing ? 'Editar alumno' : 'Nuevo alumno'}
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
              <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="ana@correo.com" />
            </label>
            <label className="event-form-field">
              <span>Teléfono / WhatsApp (opcional)</span>
              <input type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="+52 55 1234 5678" />
            </label>
          </div>

          <div className="event-form-field">
            <TimeZoneSelect label="País" value={zone} onChange={setZone} requireZoneChoice />
          </div>

          <div className="event-form-field">
            <span id="student-form-courses">Cursos (opcional)</span>
            {courses.length === 0 ? (
              <p className="contact-form-hint">
                Todavía no hay cursos.{' '}
                {onManageCourses && (
                  <button type="button" className="student-form-link" onClick={onManageCourses}>
                    Crear cursos
                  </button>
                )}
              </p>
            ) : (
              <div className="group-chips" role="group" aria-labelledby="student-form-courses">
                {courses.map((c) => {
                  const on = courseIds.includes(c.id)
                  return (
                    <button
                      key={c.id}
                      type="button"
                      className={`group-chip${on ? ' on' : ''}`}
                      style={{ '--group-color': COURSE_COLOR }}
                      aria-pressed={on}
                      onClick={() => toggleCourse(c.id)}
                    >
                      {c.name}
                    </button>
                  )
                })}
              </div>
            )}
          </div>

          <div className="event-form-row">
            <label className="event-form-field">
              <span>Fecha de alta</span>
              <input type="date" value={enrolledAt} onChange={(e) => setEnrolledAt(e.target.value)} />
            </label>
          </div>

          <div className="contact-form-availability">
            <span className="student-form-title">Disponibilidad semanal (opcional)</span>
            <p className="contact-form-hint">
              Franjas en las que puede, en su hora local
              {zone?.timeZone ? ` (hora de ${zonePlace(zone.timeZone)})` : ''}. En su ficha se ven también en tu hora.
            </p>
            <WeeklyScheduleEditor value={availability} onChange={setAvailability} copyable />
          </div>

          <label className="event-form-field">
            <span>Notas (opcional)</span>
            <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={3} placeholder="Información útil sobre este alumno..." />
          </label>

          {formError && <div className="event-form-error">{formError}</div>}
        </div>

        <div className="event-form-footer">
          <button type="button" className="event-form-cancel" onClick={onClose}>
            Cancelar
          </button>
          <button type="submit" className="event-form-submit">
            {isEditing ? 'Guardar cambios' : 'Crear alumno'}
          </button>
        </div>
      </form>
    </div>
  )
}
