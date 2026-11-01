import { useMemo, useState } from 'react'
import { format, parseISO } from 'date-fns'
import { es } from 'date-fns/locale'
import {
  ArrowLeft,
  AtSign,
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
import CoursesView from './CoursesView.jsx'
import StudentAccountSection from './StudentAccountSection.jsx'
import { portalDiffers } from '../lib/studentPortal'
import { STATUSES, attendanceCountOfStudent } from '../lib/attendance'
import { ACCOUNT_LABEL, accountState, attendanceTone, lastClasses, studentAttendance, studentHeadline } from '../lib/courseOverview'
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
import './CoursesPage.css'

const STATUS_LABEL = Object.fromEntries(STATUSES.map((s) => [s.value, s.label]))

// La asistencia con su barrita de color (verde, naranja o rojo).
function AttendanceBar({ percent }) {
  const tone = attendanceTone(percent)
  return (
    <span className={`cp-att ${tone}`}>
      <span className="cp-att-bar" aria-hidden="true">
        <span style={{ width: `${percent ?? 0}%` }} />
      </span>
      {percent === null ? '—' : `${percent} %`}
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
  attendance = [],
  extraClasses = [],
  attendanceActions,
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
  tab: tabProp = null, // 'students' | 'courses': lo elige el menú (Formación) y no salen las pestañas
  portals = null, // Map(id del alumno → su perfil del portal), si tiene cuenta unida (ver studentPortal.js)
  onCopyFromPortal = null,
  // Solo lectura (pantalla del equipo con permiso «Ver»): sin crear, editar, borrar ni pasar lista.
  readOnly = false,
  // Con readOnly, el profesor sí pasa lista en sus clases; client: para las confirmaciones.
  canMark = false,
  client = null,
  // Con readOnly, Directivo gestiona cursos (sin borrarlos), crea clases sueltas e inscribe alumnos.
  manageCourses = false,
  onEnroll = null,
}) {
  const [filter, setFilter] = useState(DEFAULT_STUDENT_FILTER)
  // Estado: '' | 'active' (con clases este mes) | 'linked' | 'pending' | 'none' (cuenta).
  const [state, setState] = useState('')
  const [formModal, setFormModal] = useState(null)
  const [coursesOpen, setCoursesOpen] = useState(false)
  const [ownTab, setTab] = useState('students') // 'students' | 'courses'
  const tab = tabProp || ownTab
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
  const rows = useMemo(() => {
    if (!state) return filtered
    if (state === 'active') {
      const month = format(now, 'yyyy-MM')
      const active = new Set(attendance.filter((r) => (r.classStart || '').slice(0, 7) === month).map((r) => r.studentId))
      return filtered.filter((s) => active.has(s.id))
    }
    return filtered.filter((s) => accountState(portals?.get(s.id)) === state)
  }, [filtered, state, attendance, portals, now])
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
    const records = attendanceCountOfStudent(selected.id)
    const also = records ? ` y su pase de lista (${records} registro${records === 1 ? '' : 's'})` : ''
    if (!window.confirm(`¿Eliminar a ${selected.name}? Se borrarán sus datos, su disponibilidad${also}.`)) return
    onRemoveStudent(selected.id)
    onSelectStudent(null)
  }

  const wa = selected ? whatsappUrl(selected.phone) : null

  const tabs = tabProp ? null : (
    <div className="students-tabs" role="tablist" aria-label="Alumnos o cursos">
      {[
        ['students', 'Alumnos'],
        ['courses', 'Cursos'],
      ].map(([id, label]) => (
        <button
          key={id}
          type="button"
          role="tab"
          aria-selected={tab === id}
          className={`contacts-group-filter-btn${tab === id ? ' on' : ''}`}
          onClick={() => setTab(id)}
        >
          {label}
        </button>
      ))}
    </div>
  )

  const coursesModal = coursesOpen && (
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
  )

  if (tab === 'courses') {
    return (
      <>
        <CoursesView
          tabs={tabs}
          students={students}
          courses={courses}
          contacts={contacts}
          attendance={attendance}
          extraClasses={extraClasses}
          actions={attendanceActions}
          onUpdateCourse={onUpdateCourse}
          onCreateCourse={onCreateCourse}
          onDeleteCourse={onDeleteCourse}
          readOnly={readOnly}
          canMark={canMark}
          client={client}
          manage={manageCourses}
          onEnroll={onEnroll}
        />
        {coursesModal}
      </>
    )
  }

  const today = format(now, 'yyyy-MM-dd')
  const headline = studentHeadline(students, attendance, today)
  const withAccounts = !!portals
  const courseName = (id) => courses.find((c) => c.id === id)?.name || 'Curso borrado'
  const selectedAtt = selected ? studentAttendance(attendance, selected.id).percent : null
  const selectedCourses = selected ? coursesOfStudent(selected, courses) : []

  return (
    <div className={`cp-root cp-students contacts-view${selected ? ' has-selection' : ''}`}>
      <div className="contacts-list-pane cp-list-pane">
        <div className="cp-list-head">
          <div className="cp-title-row">
            <div>
              <h1 className="contacts-title">Alumnos</h1>
              <p className="cp-headline">
                {headline.total} {headline.total === 1 ? 'alumno' : 'alumnos'} · {headline.activeMonth} activos este mes · {headline.newWeek}{' '}
                {headline.newWeek === 1 ? 'nuevo' : 'nuevos'} esta semana
              </p>
            </div>
            {!readOnly && (
              <button type="button" className="cp-btn primary" onClick={() => setFormModal({ student: null })} aria-label="Nuevo alumno" title="Nuevo alumno">
                <UserPlus size={15} strokeWidth={1.75} />
                <span>Nuevo alumno</span>
              </button>
            )}
          </div>
          {tabs}
          <label className="cp-search">
            <Search size={15} strokeWidth={1.75} />
            <input
              type="search"
              value={filter.query}
              onChange={(e) => set({ query: e.target.value })}
              placeholder="Buscar por nombre, Discord, email, teléfono..."
              aria-label="Buscar alumnos"
            />
          </label>
          <div className="cp-filters">
            <select value={activeCourse?.id || ''} onChange={(e) => set({ courseId: e.target.value || null })} aria-label="Filtrar por curso" disabled={courses.length === 0}>
              <option value="">Todos los cursos</option>
              {courses.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name} ({studentsInCourse(c.id, students).length})
                </option>
              ))}
            </select>
            <select value={activeCountry} onChange={(e) => set({ country: e.target.value })} disabled={countries.length === 0} aria-label="Filtrar por país">
              <option value="">Todos los países</option>
              {countries.map((code) => (
                <option key={code} value={code}>
                  {countryLabel(code)}
                </option>
              ))}
            </select>
            <select value={state} onChange={(e) => setState(e.target.value)} aria-label="Filtrar por estado">
              <option value="">Todos los estados</option>
              <option value="active">Activos este mes</option>
              {withAccounts && (
                <>
                  <option value="linked">Con cuenta</option>
                  <option value="pending">Pendiente</option>
                  <option value="none">Sin cuenta</option>
                </>
              )}
            </select>
          </div>
        </div>

        {students.length === 0 ? (
          <div className="contacts-empty">
            <GraduationCap size={32} strokeWidth={1.5} />
            <p className="contacts-empty-title">{readOnly ? 'Todavía no hay alumnos' : 'Todavía no tienes alumnos'}</p>
            {!readOnly && (
              <>
                <p>Guarda aquí a tus alumnos con sus cursos, su país y las horas en las que pueden.</p>
                <button type="button" className="contacts-new-btn" onClick={() => setFormModal({ student: null })}>
                  <UserPlus size={15} strokeWidth={1.75} />
                  <span>Crear mi primer alumno</span>
                </button>
              </>
            )}
          </div>
        ) : rows.length === 0 ? (
          <div className="contacts-empty">
            <p>No hay alumnos que coincidan con la búsqueda y los filtros.</p>
            {(filtering || state) && (
              <button
                type="button"
                className="contacts-groups-btn"
                onClick={() => {
                  setFilter(DEFAULT_STUDENT_FILTER)
                  setState('')
                }}
              >
                Quitar filtros
              </button>
            )}
          </div>
        ) : (
          <div className="cp-table-wrap">
            <table className="cp-table">
              <thead>
                <tr>
                  <th>Alumno</th>
                  <th>Cursos</th>
                  <th>País · zona</th>
                  <th>Asistencia</th>
                  <th className="num">Media</th>
                  {withAccounts && <th>Cuenta</th>}
                </tr>
              </thead>
              <tbody>
                {rows.map((s) => {
                  const account = accountState(portals?.get(s.id))
                  return (
                    <tr
                      key={s.id}
                      className={`clickable${s.id === selectedStudentId ? ' on' : ''}`}
                      onClick={() => onSelectStudent(s.id)}
                      onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && (e.preventDefault(), onSelectStudent(s.id))}
                      tabIndex={0}
                      aria-label={`Abrir la ficha de ${s.name}`}
                    >
                      <td>
                        <span className="cp-person">
                          <ContactAvatar name={s.name} size="sm" />
                          <span className="cp-person-text">
                            <strong>
                              {s.name}
                              {portalDiffers(portals?.get(s.id), s) && (
                                <span className="student-changed-badge" title="El alumno ha cambiado sus datos">
                                  Cambios
                                </span>
                              )}
                            </strong>
                            {s.discord && <span className="cp-muted">@{s.discord}</span>}
                          </span>
                        </span>
                      </td>
                      <td>
                        <span className="cp-chips">
                          {coursesOfStudent(s, courses).map((c) => (
                            <span key={c.id} className="cp-chip">
                              {c.name}
                            </span>
                          ))}
                        </span>
                      </td>
                      <td className="cp-muted">{[countryLabel(s.country), s.timeZone ? zonePlace(s.timeZone) : ''].filter(Boolean).join(' · ')}</td>
                      <td>
                        <AttendanceBar percent={studentAttendance(attendance, s.id).percent} />
                      </td>
                      <td className="num cp-muted">—</td>
                      {withAccounts && (
                        <td>
                          <span className={`cp-account ${account}`}>{ACCOUNT_LABEL[account]}</span>
                        </td>
                      )}
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div className="contacts-detail-pane cp-detail-pane">
        {!selected ? (
          <div className="contacts-empty">
            <p>Selecciona un alumno para ver su ficha.</p>
          </div>
        ) : (
          <div className="cp-detail">
            <button type="button" className="contact-back-btn" onClick={() => onSelectStudent(null)}>
              <ArrowLeft size={16} strokeWidth={1.75} />
              Alumnos
            </button>

            <div className="cp-profile">
              <ContactAvatar name={selected.name} size="xl" />
              <h2>{selected.name}</h2>
              <p className="cp-muted">
                {[countryLabel(selected.country), selected.discord ? `@${selected.discord}` : ''].filter(Boolean).join(' · ')}
              </p>
              {!readOnly && (
                <div className="cp-detail-actions">
                  <button type="button" className="cp-btn" onClick={() => setFormModal({ student: selected })}>
                    <Pencil size={14} strokeWidth={1.75} />
                    Editar
                  </button>
                  <button type="button" className="cp-btn" onClick={handleDelete}>
                    <Trash2 size={14} strokeWidth={1.75} />
                    Eliminar
                  </button>
                </div>
              )}
            </div>

            <div className="cp-stats">
              <div className={`cp-stat ${attendanceTone(selectedAtt)}`}>
                <span className="cp-stat-label">Asistencia</span>
                <strong>{selectedAtt === null ? '—' : `${selectedAtt} %`}</strong>
              </div>
              <div className="cp-stat">
                <span className="cp-stat-label">Media</span>
                <strong>—</strong>
              </div>
              <div className="cp-stat">
                <span className="cp-stat-label">Cursos</span>
                <strong>{selectedCourses.length}</strong>
              </div>
            </div>

            <section className="cp-section">
              <h3>Cursos</h3>
              {selectedCourses.length === 0 ? (
                <p className="student-muted">No está en ningún curso.</p>
              ) : (
                <span className="cp-chips">
                  {selectedCourses.map((c) => (
                    <span key={c.id} className="cp-chip">
                      {c.name}
                    </span>
                  ))}
                </span>
              )}
            </section>

            <section className="cp-section">
              <h3>Datos</h3>
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
              </dl>
            </section>

            <section className="cp-section">
              <h3>
                <CalendarClock size={14} strokeWidth={1.75} /> Disponibilidad
              </h3>
              {hasStudentAvailability(selected) ? <StudentAvailability student={selected} now={now} /> : <span className="student-muted">Sin disponibilidad indicada.</span>}
            </section>

            <section className="cp-section">
              <h3>Últimas clases</h3>
              {lastClasses(attendance, selected.id).length === 0 ? (
                <p className="student-muted">Todavía no hay pase de lista.</p>
              ) : (
                <table className="cp-slots">
                  <tbody>
                    {lastClasses(attendance, selected.id).map((r) => (
                      <tr key={`${r.courseId}|${r.classKey}`}>
                        <td>{courseName(r.courseId)}</td>
                        <td className="cp-muted">{r.classStart ? format(new Date(r.classStart), "d MMM yyyy", { locale: es }) : ''}</td>
                        <td>
                          <span className={`cp-class-status ${r.status === 'absent' ? 'unlisted' : 'listed'}`}>{STATUS_LABEL[r.status] || r.status}</span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </section>

            {!readOnly && portals?.get(selected.id) && (
              <StudentAccountSection
                portal={portals.get(selected.id)}
                student={selected}
                onCopy={() => onCopyFromPortal?.(selected.id)}
              />
            )}
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

      {coursesModal}
    </div>
  )
}
