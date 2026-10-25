import { useMemo, useState } from 'react'
import { format, parseISO } from 'date-fns'
import { es } from 'date-fns/locale'
import {
  ArrowLeft,
  AtSign,
  BookOpen,
  Cake,
  CalendarClock,
  CalendarDays,
  GraduationCap,
  Globe,
  Mail,
  MessageCircle,
  Pencil,
  Phone,
  Search,
  StickyNote,
  Trash2,
  UserPlus,
} from 'lucide-react'
import ContactAvatar from './ContactAvatar.jsx'
import StudentFormModal from './StudentFormModal.jsx'
import CoursesModal from './CoursesModal.jsx'
import { useMinuteClock } from '../hooks/useMinuteClock'
import { coursesOfStudent, studentsInCourse } from '../lib/courses'
import {
  DEFAULT_STUDENT_FILTER,
  ageLabel,
  ageOn,
  birthdayLabel,
  availabilityRows,
  filterStudents,
  hasStudentAvailability,
  studentCountries,
  whatsappUrl,
} from '../lib/students'
import { SPAIN_ZONE, countryFlag, countryLabel, formatOffsetDiff, formatTimeInZone, zoneLabel, zoneOffsetMinutes, zonePlace } from '../lib/timezones'
import './ContactsView.css'
import './GroupsModal.css'
import './StudentsView.css'

const COURSE_COLOR = 'var(--accent)'

function CourseChips({ student, courses }) {
  const list = coursesOfStudent(student, courses)
  if (list.length === 0) return null
  return (
    <span className="group-chips">
      {list.map((c) => (
        <span key={c.id} className="group-chip" style={{ '--group-color': COURSE_COLOR }}>
          {c.name}
        </span>
      ))}
    </span>
  )
}

// "México: Ciudad de México · ahora 04:32 (−8 h respecto a España)", al minuto.
function LiveZone({ timeZone }) {
  const now = useMinuteClock()
  const diff = zoneOffsetMinutes(now, timeZone) - zoneOffsetMinutes(now, SPAIN_ZONE)
  const diffText = diff === 0 ? 'misma hora que España' : `${formatOffsetDiff(diff)} respecto a España`
  return `${zoneLabel(timeZone)} · ahora ${formatTimeInZone(now, timeZone)} (${diffText})`
}

// Franjas en su hora y en la mía (España), una al lado de la otra.
function StudentAvailability({ student, now }) {
  const rows = availabilityRows(student, now)
  const sameAsMine = rows.every((r) => r.own === r.mine)
  const theirs = student.timeZone ? `hora de ${zonePlace(student.timeZone)}` : 'su hora'
  if (sameAsMine) {
    return (
      <>
        <span className="contact-availability-title">Disponibilidad ({theirs}, igual que tu hora)</span>
        <ul className="contact-availability">
          {rows.map((r) => (
            <li key={r.key}>{r.own}</li>
          ))}
        </ul>
      </>
    )
  }
  return (
    <>
      <span className="contact-availability-title">Disponibilidad</span>
      <table className="student-availability">
        <thead>
          <tr>
            <th scope="col">Su hora ({zonePlace(student.timeZone)})</th>
            <th scope="col">Tu hora (España)</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.key}>
              <td>{r.own}</td>
              <td className={r.otherDay ? 'other-day' : undefined}>{r.mine}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="student-availability-note">Convertida con el cambio de hora de esta semana.</p>
    </>
  )
}

function enrolledLabel(key) {
  return key ? format(parseISO(key), "d 'de' MMMM 'de' yyyy", { locale: es }) : ''
}

export default function StudentsView({
  students,
  courses,
  contacts = [],
  now,
  selectedStudentId,
  onSelectStudent,
  onAddStudent,
  onEditStudent,
  onRemoveStudent,
  onCreateCourse,
  onRenameCourse,
  onUpdateCourse,
  onDeleteCourse,
}) {
  const [filter, setFilter] = useState(DEFAULT_STUDENT_FILTER)
  const [formModal, setFormModal] = useState(null)
  const [coursesOpen, setCoursesOpen] = useState(false)
  const set = (patch) => setFilter((f) => ({ ...f, ...patch }))

  // Si se borra el curso del filtro, o ya no queda ningún alumno de ese país, se deja de filtrar.
  const activeCourse = courses.find((c) => c.id === filter.courseId) || null
  const countries = useMemo(() => studentCountries(students), [students])
  const activeCountry = countries.includes(filter.country) ? filter.country : ''
  const filtered = useMemo(
    () => filterStudents(students, { ...filter, courseId: activeCourse?.id || null, country: activeCountry }),
    [students, filter, activeCourse, activeCountry],
  )
  const filtering = !!(filter.query.trim() || activeCourse || activeCountry)
  const selected = students.find((s) => s.id === selectedStudentId) || null

  const handleFormSubmit = (values) => {
    if (formModal?.student) {
      onEditStudent(formModal.student.id, values)
    } else {
      const created = onAddStudent(values)
      onSelectStudent(created.id)
    }
  }

  const handleDelete = () => {
    if (!window.confirm(`¿Eliminar a ${selected.name}? Se borrarán sus datos y su disponibilidad.`)) return
    onRemoveStudent(selected.id)
    onSelectStudent(null)
  }

  const wa = selected ? whatsappUrl(selected.phone) : null

  return (
    <div className={`contacts-view${selected ? ' has-selection' : ''}`}>
      <div className="contacts-list-pane">
        <div className="contacts-header">
          <h1 className="contacts-title">Alumnos</h1>
          <div className="contacts-header-actions">
            <label className="contacts-search">
              <Search size={15} strokeWidth={1.75} />
              <input
                type="search"
                value={filter.query}
                onChange={(e) => set({ query: e.target.value })}
                placeholder="Buscar por nombre, Discord, email, teléfono..."
                aria-label="Buscar alumnos"
              />
            </label>
            <button
              type="button"
              className="contacts-new-btn"
              onClick={() => setFormModal({ student: null })}
              aria-label="Nuevo alumno"
              title="Nuevo alumno"
            >
              <UserPlus size={15} strokeWidth={1.75} />
              <span>Nuevo alumno</span>
            </button>
          </div>

          <div className="contacts-group-filter" role="group" aria-label="Filtrar por curso">
            {courses.length > 0 && (
              <button
                type="button"
                className={`contacts-group-filter-btn${activeCourse ? '' : ' on'}`}
                onClick={() => set({ courseId: null })}
                aria-pressed={!activeCourse}
              >
                Todos los cursos
              </button>
            )}
            {courses.map((c) => (
              <button
                key={c.id}
                type="button"
                className={`group-chip${activeCourse?.id === c.id ? ' on' : ''}`}
                style={{ '--group-color': COURSE_COLOR }}
                onClick={() => set({ courseId: activeCourse?.id === c.id ? null : c.id })}
                aria-pressed={activeCourse?.id === c.id}
              >
                {c.name} ({studentsInCourse(c.id, students).length})
              </button>
            ))}
            <button type="button" className="contacts-groups-btn" onClick={() => setCoursesOpen(true)} title="Crear, renombrar o borrar cursos">
              <BookOpen size={13} strokeWidth={1.75} />
              {courses.length > 0 ? 'Gestionar cursos' : 'Crear cursos'}
            </button>
          </div>

          <div className="students-filters">
            <label className="students-country-filter">
              <span className="sr-only">Filtrar por país</span>
              <select value={activeCountry} onChange={(e) => set({ country: e.target.value })} disabled={countries.length === 0}>
                <option value="">Todos los países</option>
                {countries.map((code) => (
                  <option key={code} value={code}>
                    {countryLabel(code)}
                  </option>
                ))}
              </select>
            </label>
          </div>
        </div>

        {students.length === 0 ? (
          <div className="contacts-empty">
            <GraduationCap size={32} strokeWidth={1.5} />
            <p className="contacts-empty-title">Todavía no tienes alumnos</p>
            <p>Guarda aquí a tus alumnos con sus cursos, su país y las horas en las que pueden.</p>
            <button type="button" className="contacts-new-btn" onClick={() => setFormModal({ student: null })}>
              <UserPlus size={15} strokeWidth={1.75} />
              <span>Crear mi primer alumno</span>
            </button>
          </div>
        ) : filtered.length === 0 ? (
          <div className="contacts-empty">
            <p>No hay alumnos que coincidan con la búsqueda y los filtros.</p>
            {filtering && (
              <button type="button" className="contacts-groups-btn" onClick={() => setFilter(DEFAULT_STUDENT_FILTER)}>
                Quitar filtros
              </button>
            )}
          </div>
        ) : (
          <ul className="contacts-list">
            {filtered.map((s) => (
              <li key={s.id} className={`contact-row${s.id === selectedStudentId ? ' active' : ''}`}>
                <button type="button" className="contact-row-main" onClick={() => onSelectStudent(s.id)}>
                  <ContactAvatar name={s.name} />
                  <span className="contact-row-text">
                    <span className="contact-row-name">{s.name}</span>
                    <CourseChips student={s} courses={courses} />
                    <span className="contact-row-country">{countryLabel(s.country)}</span>
                  </span>
                </button>
                {(s.email || s.phone) && (
                  <div className="contact-row-links">
                    {s.email && (
                      <a href={`mailto:${s.email}`} title={s.email}>
                        <Mail size={13} strokeWidth={1.75} />
                        <span>{s.email}</span>
                      </a>
                    )}
                    {s.phone && (
                      <a href={`tel:${s.phone.replace(/\s+/g, '')}`} title={s.phone}>
                        <Phone size={13} strokeWidth={1.75} />
                        <span>{s.phone}</span>
                      </a>
                    )}
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="contacts-detail-pane">
        {!selected ? (
          <div className="contacts-empty">
            <p>Selecciona un alumno para ver su ficha.</p>
          </div>
        ) : (
          <div className="contact-detail">
            <button type="button" className="contact-back-btn" onClick={() => onSelectStudent(null)}>
              <ArrowLeft size={16} strokeWidth={1.75} />
              Alumnos
            </button>

            <div className="contact-detail-head">
              <ContactAvatar name={selected.name} size="lg" />
              <div>
                <h2>{selected.name}</h2>
                <CourseChips student={selected} courses={courses} />
              </div>
            </div>

            <div className="contact-detail-actions">
              <button type="button" className="contact-action-btn" onClick={() => setFormModal({ student: selected })}>
                <Pencil size={14} strokeWidth={1.75} />
                Editar
              </button>
              <button type="button" className="contact-action-btn danger" onClick={handleDelete}>
                <Trash2 size={14} strokeWidth={1.75} />
                Eliminar
              </button>
            </div>

            <dl className="contact-fields">
              {selected.discord && (
                <div>
                  <dt><AtSign size={15} strokeWidth={1.75} /><span className="sr-only">Usuario de Discord</span></dt>
                  <dd>{selected.discord} <span className="student-muted">(Discord)</span></dd>
                </div>
              )}
              {birthdayLabel(selected.birthday) && (
                <div>
                  <dt><Cake size={15} strokeWidth={1.75} /><span className="sr-only">Cumpleaños</span></dt>
                  <dd>
                    {ageOn(selected.birthday, now) !== null && `${ageLabel(ageOn(selected.birthday, now))} · `}
                    Cumpleaños: {birthdayLabel(selected.birthday)}
                  </dd>
                </div>
              )}
              {selected.email && (
                <div>
                  <dt><Mail size={15} strokeWidth={1.75} /><span className="sr-only">Email</span></dt>
                  <dd><a href={`mailto:${selected.email}`}>{selected.email}</a></dd>
                </div>
              )}
              {selected.phone && (
                <div>
                  <dt><Phone size={15} strokeWidth={1.75} /><span className="sr-only">Teléfono / WhatsApp</span></dt>
                  <dd>
                    <a href={`tel:${selected.phone.replace(/\s+/g, '')}`}>{selected.phone}</a>
                    {wa && (
                      <a className="student-whatsapp" href={wa} target="_blank" rel="noreferrer">
                        <MessageCircle size={13} strokeWidth={1.75} />
                        WhatsApp
                      </a>
                    )}
                  </dd>
                </div>
              )}
              {selected.timeZone && (
                <div>
                  <dt><Globe size={15} strokeWidth={1.75} /><span className="sr-only">País y zona horaria</span></dt>
                  <dd>
                    {selected.country && selected.country !== 'ES' && `${countryFlag(selected.country)} `}
                    <LiveZone timeZone={selected.timeZone} />
                  </dd>
                </div>
              )}
              {selected.enrolledAt && (
                <div>
                  <dt><CalendarDays size={15} strokeWidth={1.75} /><span className="sr-only">Fecha de alta</span></dt>
                  <dd>Alta el {enrolledLabel(selected.enrolledAt)}</dd>
                </div>
              )}
              {selected.notes && (
                <div className="align-top">
                  <dt><StickyNote size={15} strokeWidth={1.75} /><span className="sr-only">Notas</span></dt>
                  <dd className="contact-notes">{selected.notes}</dd>
                </div>
              )}
              <div className="align-top">
                <dt><CalendarClock size={15} strokeWidth={1.75} /><span className="sr-only">Disponibilidad</span></dt>
                <dd>
                  {hasStudentAvailability(selected) ? (
                    <StudentAvailability student={selected} now={now} />
                  ) : (
                    <span className="student-muted">Sin disponibilidad indicada.</span>
                  )}
                </dd>
              </div>
            </dl>
          </div>
        )}
      </div>

      {formModal && (
        <StudentFormModal
          initialStudent={formModal.student}
          courses={courses}
          onManageCourses={() => setCoursesOpen(true)}
          onClose={() => setFormModal(null)}
          onSubmit={handleFormSubmit}
        />
      )}

      {coursesOpen && (
        <CoursesModal
          courses={courses}
          students={students}
          contacts={contacts}
          onCreate={onCreateCourse}
          onRename={onRenameCourse}
          onUpdate={onUpdateCourse}
          onDelete={onDeleteCourse}
          onClose={() => setCoursesOpen(false)}
        />
      )}
    </div>
  )
}
