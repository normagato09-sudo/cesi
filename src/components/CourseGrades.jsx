import { useEffect, useState } from 'react'
import { Pencil, Plus, Trash2 } from 'lucide-react'
import { ACTIVITY_MAX, COMMENT_MAX, deleteGrade, gradeDate, gradesErrorText, listCourseGrades, saveGrade, scoreText, scoreTone, validateGrade } from '../lib/grades'
import './CourseGrades.css'

const today = () => new Date().toISOString().slice(0, 10)
const emptyForm = () => ({ id: null, student: '', activity: '', day: today(), score: '', comment: '' })

/**
 * Pestaña «Calificaciones» de un curso (parte 36): las notas de sus alumnos. Solo su profesor las
 * pone, cambia y borra (canEdit: el profesor con su cuenta, como el pase de lista; la base de datos
 * lo vuelve a comprobar); la ceo y Directivo solo las ven. students: los inscritos. onChanged: tras
 * guardar o borrar (para las medias).
 */
export default function CourseGrades({ client, course, students, canEdit = false, onChanged = null }) {
  const [rows, setRows] = useState(null)
  const [error, setError] = useState(null)
  const [reload, setReload] = useState(0)
  const [form, setForm] = useState(null)
  const [busy, setBusy] = useState(false)
  const [formError, setFormError] = useState(null)

  useEffect(() => {
    if (!client) return
    let active = true
    listCourseGrades(client, course.id).then(
      (list) => {
        if (!active) return
        setRows(list)
        setError(null)
      },
      (err) => active && setError(gradesErrorText(err)),
    )
    return () => {
      active = false
    }
  }, [client, course.id, reload])

  if (!client) return <p className="student-muted">Las calificaciones se ven con la sincronización activa.</p>
  if (error) return <p className="cg-error">{error}</p>
  if (!rows) return <p className="student-muted">Cargando…</p>

  const save = async (e) => {
    e.preventDefault()
    const problem = validateGrade(form)
    if (problem) {
      setFormError(problem)
      return
    }
    setBusy(true)
    setFormError(null)
    try {
      await saveGrade(client, course.id, form)
      setForm(null)
      setReload((n) => n + 1)
      onChanged?.()
    } catch (err) {
      setFormError(gradesErrorText(err))
    }
    setBusy(false)
  }

  const remove = async (g) => {
    if (!window.confirm(`¿Borrar la nota de ${g.student_name} en «${g.activity}»?`)) return
    try {
      await deleteGrade(client, g.id)
      setReload((n) => n + 1)
      onChanged?.()
    } catch (err) {
      setError(gradesErrorText(err))
    }
  }

  return (
    <div className="cg-root">
      {canEdit && !form && (
        <div className="cp-panel-actions">
          <button type="button" className="cp-btn" onClick={() => setForm(emptyForm())} disabled={students.length === 0}>
            <Plus size={14} strokeWidth={1.75} />
            Poner nota
          </button>
        </div>
      )}
      {!canEdit && <p className="student-muted">Solo el profesor de este curso pone y cambia las calificaciones.</p>}

      {form && (
        <form className="cg-form" onSubmit={save}>
          <label>
            <span>Alumno</span>
            <select value={form.student} onChange={(e) => setForm((f) => ({ ...f, student: e.target.value }))}>
              <option value="">Elige…</option>
              {students.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          </label>
          <label>
            <span>Actividad</span>
            <input type="text" maxLength={ACTIVITY_MAX} value={form.activity} placeholder="Ej.: Examen 1" onChange={(e) => setForm((f) => ({ ...f, activity: e.target.value }))} />
          </label>
          <label>
            <span>Fecha</span>
            <input type="date" value={form.day} onChange={(e) => setForm((f) => ({ ...f, day: e.target.value }))} />
          </label>
          <label>
            <span>Nota (0 a 10)</span>
            <input type="text" inputMode="decimal" value={form.score} placeholder="Ej.: 7,5" onChange={(e) => setForm((f) => ({ ...f, score: e.target.value }))} />
          </label>
          <label className="cg-wide">
            <span>Comentario (opcional)</span>
            <input type="text" maxLength={COMMENT_MAX} value={form.comment} onChange={(e) => setForm((f) => ({ ...f, comment: e.target.value }))} />
          </label>
          <div className="cg-wide cg-form-actions">
            {formError && <p className="cg-error">{formError}</p>}
            <button type="button" className="cp-btn" onClick={() => setForm(null)} disabled={busy}>
              Cancelar
            </button>
            <button type="submit" className="cp-btn primary" disabled={busy}>
              {busy ? 'Guardando…' : 'Guardar nota'}
            </button>
          </div>
        </form>
      )}

      {rows.length === 0 ? (
        <p className="student-muted">Todavía no hay calificaciones en este curso.</p>
      ) : (
        <table className="cp-table">
          <thead>
            <tr>
              <th>Alumno</th>
              <th>Actividad</th>
              <th>Fecha</th>
              <th className="num">Nota</th>
              <th>Comentario</th>
              {canEdit && <th aria-label="Acciones" />}
            </tr>
          </thead>
          <tbody>
            {rows.map((g) => (
              <tr key={g.id}>
                <td>
                  <strong>{g.student_name}</strong>
                </td>
                <td>{g.activity}</td>
                <td className="cp-muted">{gradeDate(g.day)}</td>
                <td className="num">
                  <span className={`cg-score ${scoreTone(Number(g.score))}`}>{scoreText(g.score)}</span>
                </td>
                <td className="cp-muted">{g.comment || '—'}</td>
                {canEdit && g.can_edit === false && (
                  <td className="cp-muted" title="Nota de una tarea o examen: se cambia al corregir la entrega en el Aula">
                    Del aula
                  </td>
                )}
                {canEdit && g.can_edit !== false && (
                  <td className="cg-row-actions">
                    <button type="button" className="cg-icon" aria-label="Cambiar la nota" title="Cambiar" onClick={() => setForm({ id: g.id, student: g.student_id, activity: g.activity, day: g.day, score: scoreText(g.score), comment: g.comment || '' })}>
                      <Pencil size={14} strokeWidth={1.75} />
                    </button>
                    <button type="button" className="cg-icon danger" aria-label="Borrar la nota" title="Borrar" onClick={() => remove(g)}>
                      <Trash2 size={14} strokeWidth={1.75} />
                    </button>
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  )
}
