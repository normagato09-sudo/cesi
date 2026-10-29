import { useMemo, useState } from 'react'
import { ArrowLeft, BookOpen, CalendarPlus, ClipboardCheck, Pencil, Settings2 } from 'lucide-react'
import AttendanceModal from './AttendanceModal.jsx'
import CourseFormModal from './CourseFormModal.jsx'
import ExtraClassModal from './ExtraClassModal.jsx'
import { CourseSummary } from './CoursesModal.jsx'
import { useMinuteClock } from '../hooks/useMinuteClock'
import { classSummary, classWhen, courseClasses, groupClasses } from '../lib/attendance'
import { studentsInCourse, teacherStatus } from '../lib/courses'
import { SPAIN_ZONE } from '../lib/timezones'
import './ContactsView.css'
import './StudentsView.css'

const GROUPS = [
  { id: 'today', title: 'Hoy' },
  { id: 'pending', title: 'Sin pasar lista' },
  { id: 'upcoming', title: 'Próximas' },
  { id: 'past', title: 'Pasadas' },
]

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

// Una clase con su resumen del pase de lista (también en Asistencia, con `courseName`).
export function ClassRow({ cls, students, attendance, onOpen, courseName = '' }) {
  const s = classSummary(cls, students, attendance)
  return (
    <li>
      <button type="button" className="course-class-row" onClick={() => onOpen(cls)}>
        <span className="course-class-when">
          {courseName && <strong className="course-class-course">{courseName}</strong>}
          {classWhen(cls, cls.timeZone)}
          {cls.note && <span className="course-class-note">{cls.note}</span>}
          {!cls.note && cls.extraId && <span className="course-class-note">Clase suelta</span>}
        </span>
        {cls.timeZone !== SPAIN_ZONE && <span className="student-muted">En tu hora: {classWhen(cls, SPAIN_ZONE)}</span>}
        <span className={`course-class-summary${s.present + s.late + s.absent === 0 ? ' empty' : ''}`}>{summaryText(s)}</span>
      </button>
    </li>
  )
}

// Cursos: la ficha de cada curso con sus clases (del horario y sueltas) y el pase de lista. Las
// clases no salen en mi calendario.
export default function CoursesView({ tabs, students, courses, contacts, attendance, extraClasses, actions, onManageCourses, onUpdateCourse }) {
  const now = useMinuteClock()
  const [selectedId, setSelectedId] = useState(null)
  const [editingCourse, setEditingCourse] = useState(false)
  const [extraModal, setExtraModal] = useState(null) // { extra } (null: nueva)
  const [openClassKey, setOpenClassKey] = useState(null)
  const selected = courses.find((c) => c.id === selectedId) || null

  const classesByCourse = useMemo(() => {
    const out = new Map()
    for (const c of courses) out.set(c.id, courseClasses(c, { extraClasses, records: attendance, now }))
    return out
  }, [courses, extraClasses, attendance, now])

  const classes = selected ? classesByCourse.get(selected.id) : []
  const groups = selected ? groupClasses(classes, attendance, now) : null
  const openClass = classes.find((c) => c.key === openClassKey) || null
  const enrolled = selected ? studentsInCourse(selected.id, students) : []

  return (
    <div className={`contacts-view${selected ? ' has-selection' : ''}`}>
      <div className="contacts-list-pane">
        <div className="contacts-header">
          <h1 className="contacts-title">{tabs ? 'Alumnos' : 'Cursos'}</h1>
          {tabs}
          <div className="contacts-header-actions">
            <button type="button" className="contacts-groups-btn" onClick={onManageCourses} title="Crear, renombrar, editar o borrar cursos">
              <Settings2 size={14} strokeWidth={1.75} />
              Gestionar cursos
            </button>
          </div>
        </div>

        {courses.length === 0 ? (
          <div className="contacts-empty">
            <BookOpen size={32} strokeWidth={1.5} />
            <p className="contacts-empty-title">Todavía no tienes cursos</p>
            <p>Crea un curso, ponle profesor y horario, y aquí podrás pasar lista en cada clase.</p>
            <button type="button" className="contacts-new-btn" onClick={onManageCourses}>
              <Settings2 size={15} strokeWidth={1.75} />
              <span>Crear cursos</span>
            </button>
          </div>
        ) : (
          <ul className="contacts-list">
            {courses.map((c) => {
              const { teacher } = teacherStatus(c, contacts)
              const count = studentsInCourse(c.id, students).length
              const pending = groupClasses(classesByCourse.get(c.id), attendance, now).pending.length
              return (
                <li key={c.id} className={`contact-row${c.id === selectedId ? ' active' : ''}`}>
                  <button type="button" className="contact-row-main" onClick={() => setSelectedId(c.id)}>
                    <span className="contact-row-text">
                      <span className="contact-row-name">{c.name}</span>
                      <span className="contact-row-country">
                        {teacher ? teacher.name : 'Sin profesor'} · {count} alumno{count === 1 ? '' : 's'}
                        {pending > 0 && <span className="course-pending-badge">{pending} sin pasar lista</span>}
                      </span>
                    </span>
                  </button>
                </li>
              )
            })}
          </ul>
        )}
      </div>

      <div className="contacts-detail-pane">
        {!selected ? (
          <div className="contacts-empty">
            <p>Selecciona un curso para ver sus clases y pasar lista.</p>
          </div>
        ) : (
          <div className="contact-detail">
            <button type="button" className="contact-back-btn" onClick={() => setSelectedId(null)}>
              <ArrowLeft size={16} strokeWidth={1.75} />
              Cursos
            </button>

            <div className="contact-detail-head">
              <div>
                <h2>{selected.name}</h2>
                {selected.description && <p>{selected.description}</p>}
              </div>
            </div>

            <div className="contact-detail-actions">
              <button type="button" className="contact-action-btn" onClick={() => setEditingCourse(true)}>
                <Pencil size={14} strokeWidth={1.75} />
                Editar curso
              </button>
              <button type="button" className="contact-action-btn" onClick={() => setExtraModal({ extra: null })}>
                <CalendarPlus size={14} strokeWidth={1.75} />
                Clase suelta
              </button>
            </div>

            <CourseSummary course={selected} contacts={contacts} />

            <section className="course-section">
              <h3>Alumnos inscritos ({enrolled.length})</h3>
              {enrolled.length === 0 ? (
                <p className="student-muted">Nadie todavía. Se inscriben desde la ficha de cada alumno.</p>
              ) : (
                <p className="course-enrolled">{enrolled.map((s) => s.name).join(', ')}</p>
              )}
            </section>

            {classes.length === 0 ? (
              <section className="course-section">
                <h3>
                  <ClipboardCheck size={15} strokeWidth={1.75} /> Clases
                </h3>
                <p className="student-muted">
                  {selected.schedule ? 'No hay clases en las próximas semanas.' : 'Sin horario: ponle uno en «Editar curso» o añade una clase suelta.'}
                </p>
              </section>
            ) : (
              GROUPS.filter((g) => groups[g.id].length > 0).map((g) => (
                <section key={g.id} className="course-section">
                  <h3>
                    {g.title} ({groups[g.id].length})
                  </h3>
                  <ul className="course-class-list">
                    {groups[g.id].map((cls) => (
                      <ClassRow key={cls.key} cls={cls} students={students} attendance={attendance} onOpen={(c) => setOpenClassKey(c.key)} />
                    ))}
                  </ul>
                </section>
              ))
            )}
          </div>
        )}
      </div>

      {editingCourse && selected && (
        <CourseFormModal course={selected} courses={courses} contacts={contacts} onClose={() => setEditingCourse(false)} onSubmit={onUpdateCourse} />
      )}

      {openClass && selected && (
        <AttendanceModal
          cls={openClass}
          course={selected}
          contacts={contacts}
          students={students}
          attendance={attendance}
          actions={actions}
          onEditExtra={openClass.extraId ? () => setExtraModal({ extra: extraClasses.find((x) => x.id === openClass.extraId) }) : null}
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
    </div>
  )
}
