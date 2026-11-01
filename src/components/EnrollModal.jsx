import { useMemo, useState } from 'react'
import { Search, Users, X } from 'lucide-react'
import './EventFormModal.css'
import './StudentsView.css'

function normalize(text) {
  return (text || '')
    .toString()
    .toLocaleLowerCase('es')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .trim()
}

// Inscribir y desinscribir alumnos de un curso (Directivo): se marcan los que quedan inscritos.
// onSave(studentIds) puede devolver una promesa (se espera y, si falla, se avisa).
export default function EnrollModal({ course, students, onSave, onClose }) {
  const [chosen, setChosen] = useState(() => new Set(students.filter((s) => (s.courseIds || []).includes(course.id)).map((s) => s.id)))
  const [query, setQuery] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)
  const shown = useMemo(() => {
    const q = normalize(query)
    return q ? students.filter((s) => normalize(s.name).includes(q)) : students
  }, [students, query])

  const toggle = (id) =>
    setChosen((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })

  const save = async () => {
    setBusy(true)
    setError(null)
    try {
      await onSave([...chosen])
      onClose()
    } catch (err) {
      setError(err.message || 'No se pudo guardar.')
      setBusy(false)
    }
  }

  return (
    <div className="event-form-backdrop" onClick={onClose}>
      <div className="event-form" onClick={(e) => e.stopPropagation()} role="dialog" aria-label={`Alumnos de ${course.name}`}>
        <div className="event-form-header">
          <h2>
            <Users size={17} strokeWidth={1.75} />
            Alumnos de {course.name}
          </h2>
          <button type="button" className="event-form-close" onClick={onClose} aria-label="Cerrar">
            <X size={18} strokeWidth={1.75} />
          </button>
        </div>
        <div className="event-form-body">
          <label className="event-form-field">
            <span>
              <Search size={13} strokeWidth={1.75} /> Buscar alumno
            </span>
            <input type="search" value={query} onChange={(e) => setQuery(e.target.value)} />
          </label>
          {shown.length === 0 ? (
            <p className="student-muted">Ningún alumno con ese nombre.</p>
          ) : (
            <ul className="enroll-list">
              {shown.map((s) => (
                <li key={s.id}>
                  <label>
                    <input type="checkbox" checked={chosen.has(s.id)} onChange={() => toggle(s.id)} />
                    <span>{s.name || 'Sin nombre'}</span>
                  </label>
                </li>
              ))}
            </ul>
          )}
          <p className="contact-form-hint">{chosen.size} inscritos. Solo cambia en qué cursos está cada alumno.</p>
          {error && <div className="event-form-error">{error}</div>}
        </div>
        <div className="event-form-footer">
          <button type="button" className="event-form-cancel" onClick={onClose} disabled={busy}>
            Cancelar
          </button>
          <button type="button" className="event-form-submit" onClick={save} disabled={busy}>
            {busy ? 'Guardando…' : 'Guardar'}
          </button>
        </div>
      </div>
    </div>
  )
}
