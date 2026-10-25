import { useState } from 'react'
import { BookOpen, Pencil, Plus, Trash2, X } from 'lucide-react'
import CourseFormModal from './CourseFormModal.jsx'
import { durationLabel, normalizeCourseName, scheduleRows, studentsInCourse, teacherStatus, validateCourseName } from '../lib/courses'
import { SPAIN_ZONE, zonePlace } from '../lib/timezones'
import { attendanceCountOfCourse } from '../lib/attendance'
import './GroupsModal.css'
import './StudentsView.css'

// Profesor, duración y horario del curso (en la zona del horario y en mi hora).
export function CourseSummary({ course, contacts }) {
  const { teacher, problem } = teacherStatus(course, contacts)
  const rows = scheduleRows(course, new Date())
  const zone = course.schedule?.timeZone
  const perWeek = `${course.classesPerWeek} clase${course.classesPerWeek === 1 ? '' : 's'} por semana`
  return (
    <div className="course-row-summary">
      <p>
        {teacher ? teacher.name : 'Sin profesor'}
        {problem === 'inactive' && <span className="course-form-warning"> · ya no está en el Equipo</span>}
        {problem === 'missing' && <span className="course-form-warning"> · el profesor se ha borrado</span>}
        {' · '}
        {durationLabel(course.classMinutes)} · {perWeek}
      </p>
      {rows.length === 0 ? (
        <p className="student-muted">Sin horario.</p>
      ) : (
        <ul className="course-schedule-list">
          {rows.map((r) => (
            <li key={r.key}>
              {r.own}
              {zone !== SPAIN_ZONE && (
                <span className="student-muted">
                  {' '}
                  ({zonePlace(zone)}) · en tu hora {r.mine}
                </span>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

function CourseRow({ course, courses, contacts, count, onRename, onEdit, onDelete }) {
  const [name, setName] = useState(course.name)
  const [error, setError] = useState(null)

  const commit = () => {
    const clean = normalizeCourseName(name)
    if (clean === course.name) {
      setName(clean)
      setError(null)
      return
    }
    const problem = validateCourseName(clean, courses, course.id)
    if (problem) {
      setError(problem)
      return
    }
    setError(null)
    setName(clean)
    onRename(course.id, clean)
  }

  const handleDelete = () => {
    const who = count === 0 ? 'No tiene alumnos.' : `Se quitará de sus ${count} alumno${count === 1 ? '' : 's'}, que se conservan.`
    const { records, extraClasses } = attendanceCountOfCourse(course.id)
    const lost = [
      records && `${records} registro${records === 1 ? '' : 's'} del pase de lista`,
      extraClasses && `${extraClasses} clase${extraClasses === 1 ? '' : 's'} suelta${extraClasses === 1 ? '' : 's'}`,
    ].filter(Boolean)
    const also = lost.length ? ` Se borrarán también ${lost.join(' y ')}.` : ''
    if (window.confirm(`¿Borrar el curso «${course.name}»? ${who}${also}`)) onDelete(course.id)
  }

  return (
    <li className="group-row">
      <div className="group-row-main">
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          onBlur={commit}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault()
              e.currentTarget.blur()
            }
          }}
          aria-label={`Nombre del curso ${course.name}`}
        />
        <span className="group-row-count">
          {count} alumno{count === 1 ? '' : 's'}
        </span>
        <button type="button" className="group-row-delete" onClick={() => onEdit(course)} aria-label={`Editar el curso ${course.name}`}>
          <Pencil size={15} strokeWidth={1.75} />
        </button>
        <button type="button" className="group-row-delete" onClick={handleDelete} aria-label={`Borrar el curso ${course.name}`}>
          <Trash2 size={15} strokeWidth={1.75} />
        </button>
      </div>
      {error && <p className="group-row-error">{error}</p>}
      <CourseSummary course={course} contacts={contacts} />
    </li>
  )
}

// Crear, renombrar, editar (profesor, duración y horario) y borrar cursos (al borrar uno se quita
// de sus alumnos).
export default function CoursesModal({ courses, students, contacts = [], onCreate, onRename, onUpdate, onDelete, onClose }) {
  const [name, setName] = useState('')
  const [error, setError] = useState(null)
  const [editing, setEditing] = useState(null)

  const handleCreate = (e) => {
    e.preventDefault()
    const problem = validateCourseName(name, courses)
    if (problem) {
      setError(problem)
      return
    }
    onCreate({ name: normalizeCourseName(name) })
    setName('')
    setError(null)
  }

  return (
    <div className="event-form-backdrop" onClick={onClose}>
      <div className="event-form groups-modal" onClick={(e) => e.stopPropagation()} role="dialog" aria-label="Cursos">
        <div className="event-form-header">
          <h2>
            <BookOpen size={17} strokeWidth={1.75} />
            Cursos
          </h2>
          <button type="button" className="event-form-close" onClick={onClose} aria-label="Cerrar">
            <X size={18} strokeWidth={1.75} />
          </button>
        </div>

        <div className="event-form-body">
          <form className="group-new" onSubmit={handleCreate}>
            <div className="group-new-row">
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Nuevo curso, p. ej. Locución inicial"
                aria-label="Nombre del nuevo curso"
                autoFocus
              />
              <button type="submit" className="event-form-submit">
                <Plus size={15} strokeWidth={2} />
                Crear
              </button>
            </div>
            {error && <p className="group-row-error">{error}</p>}
          </form>

          {courses.length === 0 ? (
            <p className="groups-empty">Todavía no tienes cursos. Crea uno y apúntale alumnos desde su ficha para poder filtrarlos.</p>
          ) : (
            <ul className="groups-list">
              {courses.map((c) => (
                <CourseRow
                  key={`${c.id}-${c.updatedAt}`}
                  course={c}
                  courses={courses}
                  contacts={contacts}
                  count={studentsInCourse(c.id, students).length}
                  onRename={onRename}
                  onEdit={setEditing}
                  onDelete={onDelete}
                />
              ))}
            </ul>
          )}
        </div>

        <div className="event-form-footer">
          <button type="button" className="event-form-submit" onClick={onClose}>
            Hecho
          </button>
        </div>
      </div>
      {editing && (
        <CourseFormModal
          course={editing}
          courses={courses}
          contacts={contacts}
          onClose={() => setEditing(null)}
          onSubmit={onUpdate}
        />
      )}
    </div>
  )
}
