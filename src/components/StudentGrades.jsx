import { useEffect, useState } from 'react'
import { Award } from 'lucide-react'
import { gradeDate, gradesByCourse, gradesErrorText, listMyGrades, scoreText, scoreTone } from '../lib/grades'
import './StudentCourses.css'
import './StudentAttendance.css'
import './CourseGrades.css'

/**
 * «Calificaciones» del portal del alumno: sus notas por curso, con su media (cesi_my_grades,
 * parte 36: solo las suyas). preview: «Ver como».
 */
export default function StudentGrades({ client, preview = false }) {
  const [courses, setCourses] = useState(null)
  const [error, setError] = useState(null)

  useEffect(() => {
    if (!client || preview) return
    let active = true
    listMyGrades(client).then(
      (rows) => {
        if (!active) return
        setCourses(gradesByCourse(rows))
        setError(null)
      },
      (err) => active && setError(gradesErrorText(err)),
    )
    return () => {
      active = false
    }
  }, [client, preview])

  if (preview) {
    return (
      <section className="sp-card stc-empty">
        <p>En «Ver como» no se muestran las notas del alumno: las ve desde su propia cuenta.</p>
      </section>
    )
  }

  return (
    <div className="stc-root">
      <h1 className="stc-title">Calificaciones</h1>
      {error ? (
        <p className="stc-error">{error}</p>
      ) : !courses ? (
        <p className="stc-muted">Cargando…</p>
      ) : courses.length === 0 ? (
        <section className="sp-card stc-empty">
          <p>Cuando tu profesor ponga notas, aquí las verás por curso.</p>
        </section>
      ) : (
        courses.map((c) => (
          <section key={c.courseId} className="sp-card sa-course" aria-label={`Notas de ${c.name}`}>
            <div className="stc-card-head">
              <Award size={18} strokeWidth={1.75} aria-hidden="true" />
              <h3>{c.name}</h3>
            </div>
            <p className="sa-summary">
              Tu media: <span className={`cg-score ${scoreTone(c.average)}`}>{scoreText(c.average)}</span>
            </p>
            <ul className="sa-list">
              {c.grades.map((g) => (
                <li key={g.id}>
                  <span>
                    <strong>{g.activity}</strong>
                    <span className="stc-muted"> · {gradeDate(g.day)}</span>
                    {g.comment && <span className="stc-muted sg-comment">{g.comment}</span>}
                  </span>
                  <span className={`cg-score ${scoreTone(Number(g.score))}`}>{scoreText(g.score)}</span>
                </li>
              ))}
            </ul>
          </section>
        ))
      )}
    </div>
  )
}
