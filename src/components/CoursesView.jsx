import { useMemo, useState } from 'react'
import { ArrowLeft, BookOpen, CalendarPlus, ClipboardCheck, Pencil, Plus, Search, Sparkles, Users } from 'lucide-react'
import AttendanceModal from './AttendanceModal.jsx'
import CourseFormModal from './CourseFormModal.jsx'
import ExtraClassModal from './ExtraClassModal.jsx'
import EnrollModal from './EnrollModal.jsx'
import ContactAvatar from './ContactAvatar.jsx'
import { useMinuteClock } from '../hooks/useMinuteClock'
import { attendanceCountOfCourse, classSummary, classWhen, courseClasses, groupClasses } from '../lib/attendance'
import { COURSE_STATUS_LABEL, durationLabel, normalizeCourse, seatsOf, studentsInCourse, teacherStatus } from '../lib/courses'
import { CLASS_STATUS_LABEL, attendanceTone, classStatus, courseMonthAttendance, shortSchedule, studentAttendance } from '../lib/courseOverview'
import { SPAIN_ZONE, countryLabel, zonePlace } from '../lib/timezones'
import { keyOf } from '../lib/sharedCalendar'
import './ContactsView.css'
import './StudentsView.css'
import './CoursesPage.css'

function summaryText(s) {
  if (s.present + s.late + s.absent === 0) return 'Sin pasar lista'
  const parts = []
  if (s.present) parts.push(`${s.present} presente${s.present === 1 ? '' : 's'}`)
  const justified = (n, word) => (n ? ` (${n} ${word}${n === 1 ? '' : 's'})` : '')
  if (s.late) parts.push(`${s.late} retraso${s.late === 1 ? '' : 's'}${justified(s.justifiedLate, 'justificado')}`)
  if (s.absent) parts.push(`${s.absent} falta${s.absent === 1 ? '' : 's'}${justified(s.justifiedAbsent, 'justificada')}`)
  if (s.unmarked) parts.push(`${s.unmarked} sin marcar`)
  return parts.join(' · ')
}

// Una clase con su resumen del pase de lista (también en Asistencia, con `courseName`). status:
// su estado en la ficha del curso (Lista pasada, Próxima…), si se quiere enseñar.
export function ClassRow({ cls, students, attendance, onOpen, courseName = '', status = null }) {
  const s = classSummary(cls, students, attendance)
  return (
    <li>
      <button type="button" className="course-class-row" onClick={() => onOpen(cls)}>
        <span className="course-class-when">
          {courseName && <strong className="course-class-course">{courseName}</strong>}
          {classWhen(cls, cls.timeZone)}
          {cls.note && <span className="course-class-note">{cls.note}</span>}
          {!cls.note && cls.extraId && <span className="course-class-note">Clase suelta</span>}
          {status && <span className={`cp-class-status ${status}`}>{CLASS_STATUS_LABEL[status]}</span>}
        </span>
        {cls.timeZone !== SPAIN_ZONE && <span className="student-muted">En tu hora: {classWhen(cls, SPAIN_ZONE)}</span>}
        <span className={`course-class-summary${s.present + s.late + s.absent === 0 ? ' empty' : ''}`}>{summaryText(s)}</span>
      </button>
    </li>
  )
}

const FILTERS = [
  { id: '', label: 'Todos' },
  { id: 'inscripcion', label: 'Inscripción' },
  { id: 'en_curso', label: 'En curso' },
  { id: 'terminado', label: 'Terminados' },
]

function StatusChip({ status }) {
  return <span className={`cp-status ${status}`}>{COURSE_STATUS_LABEL[status]}</span>
}

function dayText(key) {
  if (!key) return ''
  const [y, m, d] = key.split('-')
  return `${Number(d)}/${Number(m)}/${y}`
}

function plain(text) {
  return (text || '')
    .toString()
    .toLocaleLowerCase('es')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
}

function Stat({ label, value, sub = '', tone = '' }) {
  return (
    <div className={`cp-stat ${tone}`}>
      <span className="cp-stat-label">{label}</span>
      <strong>{value}</strong>
      {sub && <span className="cp-stat-sub">{sub}</span>}
    </div>
  )
}

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

// Cursos: a la izquierda los cursos en tarjetas (estado, plazas), con buscador y filtros; a la
// derecha la ficha del curso con sus cifras y pestañas (alumnos, clases y asistencia,
// calificaciones). Las clases no salen en mi calendario.
// readOnly: solo se ve (pantalla del equipo con permiso «Ver»): sin gestionar, editar ni pasar lista.
// canMark (con readOnly): el profesor sí pasa lista en sus clases. client: para las confirmaciones.
// manage (con readOnly): Directivo gestiona cursos (sin borrarlos) y crea clases sueltas; con
// onEnroll(courseId, studentIds), inscribe y desinscribe alumnos.
// onCreateCourse(datos) y onDeleteCourse(id) (este, solo la ceo): «Nuevo curso» y «Borrar curso».
export default function CoursesView({
  tabs,
  students,
  courses,
  contacts,
  attendance,
  extraClasses,
  actions,
  onUpdateCourse,
  onCreateCourse = null,
  onDeleteCourse = null,
  readOnly = false,
  canMark = false,
  client = null,
  manage = false,
  onEnroll = null,
}) {
  const canManage = !readOnly || manage
  const [enrolling, setEnrolling] = useState(false)
  const now = useMinuteClock()
  const [selectedId, setSelectedId] = useState(null)
  const [courseForm, setCourseForm] = useState(null) // { course } (null: nuevo)
  const [extraModal, setExtraModal] = useState(null) // { extra } (null: nueva)
  const [openClassKey, setOpenClassKey] = useState(null)
  const [query, setQuery] = useState('')
  const [statusFilter, setStatusFilter] = useState('')
  const [tab, setTab] = useState('students')
  const selected = courses.find((c) => c.id === selectedId) || null
  const month = keyOf(now, SPAIN_ZONE).slice(0, 7)

  const classesByCourse = useMemo(() => {
    const out = new Map()
    for (const c of courses) out.set(c.id, courseClasses(c, { extraClasses, records: attendance, now }))
    return out
  }, [courses, extraClasses, attendance, now])

  const shown = useMemo(() => {
    const q = plain(query.trim())
    return courses.filter((c) => {
      const course = normalizeCourse(c)
      if (statusFilter && course.status !== statusFilter) return false
      if (!q) return true
      const { teacher } = teacherStatus(c, contacts)
      return plain(`${c.name} ${teacher?.name || ''}`).includes(q)
    })
  }, [courses, contacts, query, statusFilter])

  const classes = selected ? classesByCourse.get(selected.id) : []
  const openClass = classes.find((c) => c.key === openClassKey) || null
  const enrolled = selected ? studentsInCourse(selected.id, students) : []
  const upcoming = classes.filter((c) => c.end > now)
  const past = classes.filter((c) => c.end <= now).reverse()
  const nextKey = upcoming[0]?.key || null

  const deleteCourse = (course) => {
    const count = studentsInCourse(course.id, students).length
    const who = count === 0 ? 'No tiene alumnos.' : `Se quitará de sus ${count} alumno${count === 1 ? '' : 's'}, que se conservan.`
    const { records, extraClasses: extras } = attendanceCountOfCourse(course.id)
    const lost = [
      records && `${records} registro${records === 1 ? '' : 's'} del pase de lista`,
      extras && `${extras} clase${extras === 1 ? '' : 's'} suelta${extras === 1 ? '' : 's'}`,
    ].filter(Boolean)
    const also = lost.length ? ` Se borrarán también ${lost.join(' y ')}.` : ''
    if (!window.confirm(`¿Borrar el curso «${course.name}»? ${who}${also}`)) return
    onDeleteCourse(course.id)
    setCourseForm(null)
    setSelectedId(null)
  }

  const seats = selected ? seatsOf(selected, students) : null
  const monthAtt = selected ? courseMonthAttendance(attendance, selected.id, month) : null
  const detail = selected ? normalizeCourse(selected) : null
  const teacher = selected ? teacherStatus(selected, contacts).teacher : null

  return (
    <div className={`cp-root contacts-view${selected ? ' has-selection' : ''}`}>
      <div className="contacts-list-pane cp-list-pane">
        <div className="cp-list-head">
          <div className="cp-title-row">
            <h1 className="contacts-title">{tabs ? 'Alumnos' : 'Cursos'}</h1>
            {canManage && onCreateCourse && (
              <button type="button" className="cp-btn primary" onClick={() => setCourseForm({ course: null })}>
                <Plus size={15} strokeWidth={2} />
                Nuevo curso
              </button>
            )}
          </div>
          {tabs}
          <label className="cp-search">
            <Search size={15} strokeWidth={1.75} />
            <input type="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Buscar curso o profesor" aria-label="Buscar cursos" />
          </label>
          <div className="cp-filters" role="group" aria-label="Filtrar por estado">
            {FILTERS.map((f) => (
              <button key={f.id || 'all'} type="button" className={`cp-filter${statusFilter === f.id ? ' on' : ''}`} aria-pressed={statusFilter === f.id} onClick={() => setStatusFilter(f.id)}>
                {f.label}
              </button>
            ))}
          </div>
        </div>

        {courses.length === 0 ? (
          <div className="contacts-empty">
            <BookOpen size={32} strokeWidth={1.5} />
            <p className="contacts-empty-title">{readOnly ? 'Todavía no hay cursos' : 'Todavía no tienes cursos'}</p>
            {canManage && onCreateCourse && <p>Crea un curso, ponle profesor y horario, y aquí podrás pasar lista en cada clase.</p>}
          </div>
        ) : shown.length === 0 ? (
          <div className="contacts-empty">
            <p>Ningún curso con esa búsqueda o ese estado.</p>
          </div>
        ) : (
          <ul className="cp-cards">
            {shown.map((c) => {
              const course = normalizeCourse(c)
              const { teacher: t } = teacherStatus(c, contacts)
              const s = seatsOf(c, students)
              const pending = groupClasses(classesByCourse.get(c.id), attendance, now).pending.length
              return (
                <li key={c.id}>
                  <button type="button" className={`cp-card${c.id === selectedId ? ' on' : ''}`} onClick={() => setSelectedId(c.id)}>
                    <span className="cp-card-top">
                      <strong>{c.name}</strong>
                      <StatusChip status={course.status} />
                    </span>
                    <span className="cp-card-meta">
                      {t ? t.name : 'Sin profesor'} · {shortSchedule(c)}
                    </span>
                    <span className="cp-seats">
                      <span className="cp-seats-bar" aria-hidden="true">
                        <span style={{ width: `${s.max ? Math.min(100, Math.round((s.enrolled / s.max) * 100)) : s.enrolled ? 100 : 0}%` }} />
                      </span>
                      <span>{s.max ? `${s.enrolled} / ${s.max} plazas` : `${s.enrolled} alumno${s.enrolled === 1 ? '' : 's'}`}</span>
                    </span>
                    {pending > 0 && <span className="course-pending-badge">{pending} sin pasar lista</span>}
                  </button>
                </li>
              )
            })}
          </ul>
        )}
      </div>

      <div className="contacts-detail-pane cp-detail-pane">
        {!selected ? (
          <div className="contacts-empty">
            <p>Selecciona un curso para ver sus alumnos, sus clases y pasar lista.</p>
          </div>
        ) : (
          <div className="cp-detail">
            <button type="button" className="contact-back-btn" onClick={() => setSelectedId(null)}>
              <ArrowLeft size={16} strokeWidth={1.75} />
              Cursos
            </button>

            <header className="cp-detail-head">
              <div>
                <div className="cp-detail-title">
                  <h2>{selected.name}</h2>
                  <StatusChip status={detail.status} />
                </div>
                <p className="cp-detail-line">
                  {[
                    teacher ? teacher.name : 'Sin profesor',
                    shortSchedule(selected),
                    durationLabel(detail.classMinutes),
                    detail.schedule ? `hora de ${zonePlace(detail.schedule.timeZone)}` : '',
                    detail.startDate || detail.endDate ? `${detail.startDate ? `del ${dayText(detail.startDate)}` : ''}${detail.endDate ? ` al ${dayText(detail.endDate)}` : ''}`.trim() : '',
                  ]
                    .filter(Boolean)
                    .join(' · ')}
                </p>
                {selected.description && <p className="cp-detail-desc">{selected.description}</p>}
              </div>
              <div className="cp-detail-actions">
                <button type="button" className="cp-btn" disabled title="Próximamente: cruzar la disponibilidad del profesor y de los alumnos">
                  <Sparkles size={14} strokeWidth={1.75} />
                  Organizar horario
                  <em>Próximamente</em>
                </button>
                {canManage && (
                  <button type="button" className="cp-btn primary" onClick={() => setCourseForm({ course: selected })}>
                    <Pencil size={14} strokeWidth={1.75} />
                    Editar curso
                  </button>
                )}
              </div>
            </header>

            <div className="cp-stats">
              <Stat
                label="Alumnos"
                value={seats.max ? `${seats.enrolled} / ${seats.max}` : seats.enrolled}
                sub={seats.max ? `${seats.free} ${seats.free === 1 ? 'plaza libre' : 'plazas libres'}` : 'Plazas sin límite'}
              />
              <Stat
                label="Asistencia media del mes"
                value={monthAtt.percent === null ? '—' : `${monthAtt.percent} %`}
                sub={monthAtt.delta === null ? 'Sin datos del mes anterior' : `${monthAtt.delta >= 0 ? '+' : '−'}${Math.abs(monthAtt.delta)} puntos que el mes anterior`}
                tone={attendanceTone(monthAtt.percent)}
              />
              <Stat label="Faltas sin justificar del mes" value={monthAtt.unjustified} tone={monthAtt.unjustified ? 'bad' : ''} />
              <Stat label="Media de notas" value="—" sub="Cuando haya calificaciones" />
            </div>

            <div className="cp-tabs" role="tablist" aria-label="Ficha del curso">
              {[
                ['students', `Alumnos inscritos (${enrolled.length})`],
                ['classes', 'Clases y asistencia'],
                ['grades', 'Calificaciones'],
              ].map(([id, label]) => (
                <button key={id} type="button" role="tab" aria-selected={tab === id} className={`cp-tab${tab === id ? ' on' : ''}`} onClick={() => setTab(id)}>
                  {label}
                </button>
              ))}
            </div>

            {tab === 'students' && (
              <section className="cp-panel">
                {onEnroll && (
                  <div className="cp-panel-actions">
                    <button type="button" className="cp-btn" onClick={() => setEnrolling(true)}>
                      <Users size={14} strokeWidth={1.75} />
                      Inscribir alumnos
                    </button>
                  </div>
                )}
                {enrolled.length === 0 ? (
                  <p className="student-muted">Nadie todavía. {onEnroll ? 'Usa «Inscribir alumnos».' : 'Se inscriben desde la ficha de cada alumno o desde su portal.'}</p>
                ) : (
                  <table className="cp-table">
                    <thead>
                      <tr>
                        <th>Alumno</th>
                        <th>País · zona</th>
                        <th>Inscripción</th>
                        <th>Asistencia</th>
                        <th className="num">Media</th>
                      </tr>
                    </thead>
                    <tbody>
                      {enrolled.map((s) => (
                        <tr key={s.id}>
                          <td>
                            <span className="cp-person">
                              <ContactAvatar name={s.name} size="sm" />
                              <strong>{s.name}</strong>
                            </span>
                          </td>
                          <td className="cp-muted">{[countryLabel(s.country), s.timeZone ? zonePlace(s.timeZone) : ''].filter(Boolean).join(' · ')}</td>
                          <td className="cp-muted">{dayText(s.courseJoinedAt?.[selected.id] || s.enrolledAt) || '—'}</td>
                          <td>
                            <AttendanceBar percent={studentAttendance(attendance, s.id, selected.id).percent} />
                          </td>
                          <td className="num cp-muted">—</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </section>
            )}

            {tab === 'classes' && (
              <section className="cp-panel">
                {canManage && (
                  <div className="cp-panel-actions">
                    <button type="button" className="cp-btn" onClick={() => setExtraModal({ extra: null })}>
                      <CalendarPlus size={14} strokeWidth={1.75} />
                      Clase suelta
                    </button>
                  </div>
                )}
                {classes.length === 0 ? (
                  <p className="student-muted">
                    <ClipboardCheck size={15} strokeWidth={1.75} />{' '}
                    {detail.schedule ? 'No hay clases en las próximas semanas.' : 'Sin horario: ponle uno en «Editar curso» o añade una clase suelta.'}
                  </p>
                ) : (
                  <>
                    {upcoming.length > 0 && (
                      <div className="course-section">
                        <h3>Próximas ({upcoming.length})</h3>
                        <ul className="course-class-list">
                          {upcoming.map((cls) => (
                            <ClassRow key={cls.key} cls={cls} students={students} attendance={attendance} onOpen={(c) => setOpenClassKey(c.key)} status={classStatus(cls, attendance, nextKey, now)} />
                          ))}
                        </ul>
                      </div>
                    )}
                    {past.length > 0 && (
                      <div className="course-section">
                        <h3>Pasadas ({past.length})</h3>
                        <ul className="course-class-list">
                          {past.map((cls) => (
                            <ClassRow key={cls.key} cls={cls} students={students} attendance={attendance} onOpen={(c) => setOpenClassKey(c.key)} status={classStatus(cls, attendance, nextKey, now)} />
                          ))}
                        </ul>
                      </div>
                    )}
                  </>
                )}
              </section>
            )}

            {tab === 'grades' && (
              <section className="cp-panel cp-grades">
                <p>Solo el profesor de este curso puede poner y cambiar calificaciones.</p>
                <p className="student-muted">Llegarán en la fase de calificaciones.</p>
              </section>
            )}
          </div>
        )}
      </div>

      {courseForm && (
        <CourseFormModal
          course={courseForm.course}
          courses={courses}
          contacts={contacts}
          onClose={() => setCourseForm(null)}
          onSubmit={(id, data) => (id ? onUpdateCourse(id, data) : onCreateCourse(data))}
          onDelete={onDeleteCourse ? deleteCourse : null}
        />
      )}

      {openClass && selected && (
        <AttendanceModal
          cls={openClass}
          course={selected}
          contacts={contacts}
          students={students}
          attendance={attendance}
          actions={actions}
          readOnly={readOnly && !canMark}
          client={client}
          onEditExtra={openClass.extraId && !readOnly ? () => setExtraModal({ extra: extraClasses.find((x) => x.id === openClass.extraId) }) : null}
          onClose={() => setOpenClassKey(null)}
        />
      )}

      {/* Después del pase de lista: se abre encima al cambiar una clase suelta desde él. */}
      {extraModal && selected && (
        <ExtraClassModal
          course={selected}
          contacts={contacts}
          extra={extraModal.extra}
          attendance={attendance}
          onSave={actions.saveExtraClass}
          onDelete={(id) => {
            actions.deleteExtraClass(id)
            setOpenClassKey(null)
          }}
          onClose={() => setExtraModal(null)}
        />
      )}

      {enrolling && selected && onEnroll && (
        <EnrollModal course={selected} students={students} onSave={(ids) => onEnroll(selected.id, ids)} onClose={() => setEnrolling(false)} />
      )}
    </div>
  )
}
