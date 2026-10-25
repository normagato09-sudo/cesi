import { useState } from 'react'
import { BookOpen, X } from 'lucide-react'
import {
  CLASS_DURATIONS,
  MAX_CLASSES_PER_WEEK,
  durationLabel,
  normalizeCourse,
  normalizeCourseName,
  scheduleRows,
  scheduleWithSince,
  sortScheduleSlots,
  teacherOptions,
  teacherStatus,
  validateCourse,
} from '../lib/courses'
import { SPAIN_ZONE, zonePlace } from '../lib/timezones'
import { WEEKDAY_DISPLAY_ORDER, WEEKDAY_LABELS } from '../lib/weeklySchedule'
import './EventFormModal.css'
import './StudentsView.css'

const PER_WEEK_OPTIONS = Array.from({ length: MAX_CLASSES_PER_WEEK }, (_, i) => i + 1)
const EMPTY_SLOT = { day: '', start: '' }

// Tantas filas como clases por semana (las que sobran se quitan; las que faltan, vacías).
function resizeSlots(slots, count) {
  return Array.from({ length: count }, (_, i) => slots[i] || EMPTY_SLOT)
}

const TEACHER_PROBLEMS = {
  missing: 'El profesor de este curso se ha borrado.',
  inactive: 'El profesor de este curso ya no está en el Equipo.',
}

// Datos de un curso: nombre, descripción, profesor (del Equipo), duración, clases por semana y
// horario fijo puesto a mano. Las clases no se crean en mi calendario.
export default function CourseFormModal({ course, courses, contacts, onClose, onSubmit }) {
  const seed = normalizeCourse(course)
  const [name, setName] = useState(seed.name)
  const [description, setDescription] = useState(seed.description)
  const [teacherId, setTeacherId] = useState(seed.teacherId || '')
  const [classMinutes, setClassMinutes] = useState(seed.classMinutes)
  const [classesPerWeek, setClassesPerWeek] = useState(seed.classesPerWeek)
  const [slots, setSlots] = useState(() => resizeSlots(seed.schedule?.slots || [], seed.classesPerWeek))
  const [formError, setFormError] = useState(null)

  const { teachers, others } = teacherOptions(contacts)
  const { teacher, problem } = teacherStatus({ teacherId }, contacts)
  const listed = [...teachers, ...others].some((c) => c.id === teacherId)
  // El horario guardado sigue en su zona; uno nuevo va en la del profesor (o en la mía si no hay).
  const zone = seed.schedule?.timeZone || teacher?.timeZone || SPAIN_ZONE
  const filled = slots.filter((s) => s.day !== '' && s.start).map((s) => ({ day: Number(s.day), start: s.start }))
  const preview = scheduleRows({ schedule: { timeZone: zone, slots: filled }, classMinutes }, new Date())
  const durations = CLASS_DURATIONS.includes(classMinutes) ? CLASS_DURATIONS : [...CLASS_DURATIONS, classMinutes].sort((a, b) => a - b)

  const setSlot = (index, patch) => setSlots((list) => list.map((s, i) => (i === index ? { ...s, ...patch } : s)))
  const changePerWeek = (count) => {
    setClassesPerWeek(count)
    setSlots((list) => resizeSlots(list, count))
  }

  const handleSubmit = (e) => {
    e.preventDefault()
    if (filled.length > 0 && filled.length < slots.length) {
      setFormError('Pon el día y la hora de cada clase, o deja el horario vacío.')
      return
    }
    const data = {
      name: normalizeCourseName(name),
      description: description.trim(),
      teacherId: teacherId || null,
      classMinutes,
      classesPerWeek,
      schedule: scheduleWithSince(filled.length ? { timeZone: zone, slots: sortScheduleSlots(filled) } : null, seed.schedule),
    }
    const invalid = validateCourse(data, courses, course.id)
    if (invalid) {
      setFormError(invalid)
      return
    }
    try {
      onSubmit(course.id, data)
      onClose()
    } catch (err) {
      setFormError(err.message || 'No se pudo guardar. Inténtalo de nuevo.')
    }
  }

  return (
    <div className="event-form-backdrop" onClick={onClose}>
      <form className="event-form" onClick={(e) => e.stopPropagation()} onSubmit={handleSubmit} noValidate>
        <div className="event-form-header">
          <h2>
            <BookOpen size={17} strokeWidth={1.75} />
            Editar curso
          </h2>
          <button type="button" className="event-form-close" onClick={onClose} aria-label="Cerrar">
            <X size={18} strokeWidth={1.75} />
          </button>
        </div>

        <div className="event-form-body">
          <label className="event-form-field">
            <span>Nombre</span>
            <input type="text" value={name} onChange={(e) => setName(e.target.value)} autoFocus />
          </label>

          <label className="event-form-field">
            <span>Descripción (opcional)</span>
            <textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={2} placeholder="De qué trata el curso..." />
          </label>

          <label className="event-form-field">
            <span>Profesor (opcional)</span>
            <select value={teacherId} onChange={(e) => setTeacherId(e.target.value)}>
              <option value="">Sin profesor</option>
              {teacherId && !listed && <option value={teacherId}>{teacher ? `${teacher.name} (ya no está en el Equipo)` : 'Profesor borrado'}</option>}
              {teachers.length > 0 && (
                <optgroup label="Profesores">
                  {teachers.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </optgroup>
              )}
              {others.length > 0 && (
                <optgroup label={teachers.length > 0 ? 'Resto del Equipo' : 'Equipo'}>
                  {others.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </optgroup>
              )}
            </select>
          </label>
          {TEACHER_PROBLEMS[problem] && <p className="contact-form-hint course-form-warning">{TEACHER_PROBLEMS[problem]}</p>}
          {teachers.length + others.length === 0 && (
            <p className="contact-form-hint">No hay nadie en el Equipo. Los profesores se eligen entre los miembros del Equipo.</p>
          )}

          <div className="event-form-row">
            <label className="event-form-field">
              <span>Duración de cada clase</span>
              <select value={classMinutes} onChange={(e) => setClassMinutes(Number(e.target.value))}>
                {durations.map((m) => (
                  <option key={m} value={m}>
                    {durationLabel(m)}
                  </option>
                ))}
              </select>
            </label>
            <label className="event-form-field">
              <span>Clases por semana</span>
              <select value={classesPerWeek} onChange={(e) => changePerWeek(Number(e.target.value))}>
                {PER_WEEK_OPTIONS.map((n) => (
                  <option key={n} value={n}>
                    {n}
                  </option>
                ))}
              </select>
            </label>
          </div>

          <div className="event-form-field">
            <span className="student-form-title">Horario (opcional)</span>
            <p className="contact-form-hint">
              En hora de {zonePlace(zone)}
              {seed.schedule ? ' (la del horario guardado)' : teacher ? ' (la del profesor)' : ''}. Las clases no salen en tu calendario.
            </p>
            {slots.map((slot, i) => (
              <div className="course-form-slot" key={i}>
                <select value={slot.day} onChange={(e) => setSlot(i, { day: e.target.value })} aria-label={`Día de la clase ${i + 1}`}>
                  <option value="">Día…</option>
                  {WEEKDAY_DISPLAY_ORDER.map((d) => (
                    <option key={d} value={d}>
                      {WEEKDAY_LABELS[d]}
                    </option>
                  ))}
                </select>
                <input type="time" value={slot.start} onChange={(e) => setSlot(i, { start: e.target.value })} aria-label={`Hora de la clase ${i + 1}`} />
              </div>
            ))}
            {preview.length > 0 && zone !== SPAIN_ZONE && (
              <ul className="course-schedule-list">
                {preview.map((r) => (
                  <li key={r.key}>
                    {r.own} <span className="student-muted">· en tu hora {r.mine}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>

          {formError && <div className="event-form-error">{formError}</div>}
        </div>

        <div className="event-form-footer">
          <button type="button" className="event-form-cancel" onClick={onClose}>
            Cancelar
          </button>
          <button type="submit" className="event-form-submit">
            Guardar curso
          </button>
        </div>
      </form>
    </div>
  )
}
