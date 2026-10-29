import { useMemo, useState } from 'react'
import { ClipboardCheck } from 'lucide-react'
import AttendanceModal from './AttendanceModal.jsx'
import { ClassRow } from './CoursesView.jsx'
import { useMinuteClock } from '../hooks/useMinuteClock'
import { courseClasses, groupClasses } from '../lib/attendance'
import './ContactsView.css'
import './StudentsView.css'
import './SectionPage.css'

// Formación → Asistencia: las clases de hoy y las que quedan sin pasar lista, de todos los cursos.
// Al pulsar una se pasa lista, como desde su curso.
export default function AttendanceView({ courses = [], students = [], contacts = [], attendance = [], extraClasses = [], actions }) {
  const now = useMinuteClock()
  const [open, setOpen] = useState(null) // { courseId, key }

  const { today, pending } = useMemo(() => {
    const out = { today: [], pending: [] }
    for (const course of courses) {
      const groups = groupClasses(courseClasses(course, { extraClasses, records: attendance, now }), attendance, now)
      for (const cls of groups.today) out.today.push({ cls, course })
      for (const cls of groups.pending) out.pending.push({ cls, course })
    }
    out.today.sort((a, b) => a.cls.start - b.cls.start)
    out.pending.sort((a, b) => b.cls.start - a.cls.start)
    return out
  }, [courses, extraClasses, attendance, now])

  const openItem = open ? [...today, ...pending].find((i) => i.course.id === open.courseId && i.cls.key === open.key) : null

  const renderGroup = (title, items) =>
    items.length > 0 && (
      <section className="course-section">
        <h3>
          {title} ({items.length})
        </h3>
        <ul className="course-class-list">
          {items.map(({ cls, course }) => (
            <ClassRow
              key={`${course.id}|${cls.key}`}
              cls={cls}
              courseName={course.name}
              students={students}
              attendance={attendance}
              onOpen={() => setOpen({ courseId: course.id, key: cls.key })}
            />
          ))}
        </ul>
      </section>
    )

  return (
    <div className="section-page">
      <div className="contacts-header">
        <h1 className="contacts-title">Asistencia</h1>
        <p className="section-page-hint">Clases de hoy y las que quedan sin pasar lista, de todos los cursos. El resto, en cada curso.</p>
      </div>
      <div className="section-page-body section-page-padded">
        {today.length === 0 && pending.length === 0 ? (
          <div className="contacts-empty">
            <ClipboardCheck size={28} strokeWidth={1.5} />
            <p className="contacts-empty-title">Todo al día</p>
            <p>No hay clases hoy ni clases sin pasar lista.</p>
          </div>
        ) : (
          <>
            {renderGroup('Hoy', today)}
            {renderGroup('Sin pasar lista', pending)}
          </>
        )}
      </div>

      {openItem && (
        <AttendanceModal
          cls={openItem.cls}
          course={openItem.course}
          contacts={contacts}
          students={students}
          attendance={attendance}
          actions={actions}
          onEditExtra={null}
          onClose={() => setOpen(null)}
        />
      )}
    </div>
  )
}
