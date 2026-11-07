import { useEffect, useState } from 'react'
import { Award, CheckCircle2, FileDown, Search, Upload } from 'lucide-react'
import { certFileError, certificateGroups, certificatesErrorText, listCertificates, openCertificate, removeCertificate, saveCertificate } from '../lib/certificates'
import { gradeSummary, scoreText, scoreTone } from '../lib/grades'
import { normalizeCourse } from '../lib/courses'
import { dayText } from '../lib/courseRoom'
import './CourseGrades.css'
import './Certificates.css'

const todayKey = () => {
  const d = new Date()
  const p = (n) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`
}

// Una fila: alumno, media, asistencia y su certificado (marcar, fecha, PDF).
function CertRow({ client, courseId, row, onChanged }) {
  const { student, average, attendance, cert } = row
  const [editing, setEditing] = useState(false)
  const [day, setDay] = useState(cert?.issued_on || todayKey())
  const [file, setFile] = useState(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)

  const save = async (e) => {
    e.preventDefault()
    if (!day) return setError('Pon la fecha.')
    const problem = certFileError(file)
    if (problem) return setError(problem)
    setBusy(true)
    setError(null)
    try {
      await saveCertificate(client, { courseId, studentId: student.id, issuedOn: day, file, previous: cert })
      setEditing(false)
      setFile(null)
      onChanged()
    } catch (err) {
      setError(certificatesErrorText(err))
    }
    setBusy(false)
  }
  const unmark = async () => {
    if (!window.confirm(`¿Quitar el certificado de ${student.name}? Se borra también su PDF.`)) return
    setBusy(true)
    try {
      await removeCertificate(client, cert)
      onChanged()
    } catch (err) {
      setError(certificatesErrorText(err))
    }
    setBusy(false)
  }
  const open = () => openCertificate(client, cert).catch((err) => setError(certificatesErrorText(err)))

  return (
    <li className="cert-row">
      <div className="cert-who">
        <strong>{student.name}</strong>
        <span className="cert-stats">
          Media: {average === null ? '—' : <span className={`cg-score ${scoreTone(average)}`}>{scoreText(average)}</span>}
          {' · '}Asistencia: {attendance === null ? '—' : `${attendance} %`}
        </span>
      </div>
      {editing ? (
        <form className="cert-form" onSubmit={save}>
          <label>
            <span>Fecha</span>
            <input type="date" value={day} onChange={(e) => setDay(e.target.value)} />
          </label>
          <label>
            <span>PDF {cert?.file_path ? '(cambiar)' : '(opcional)'}</span>
            <input type="file" accept=".pdf,application/pdf" onChange={(e) => (setFile(e.target.files?.[0] || null), setError(certFileError(e.target.files?.[0])))} />
          </label>
          <div className="cert-actions">
            <button type="button" className="cert-btn" onClick={() => setEditing(false)} disabled={busy}>
              Cancelar
            </button>
            <button type="submit" className="cert-btn primary" disabled={busy}>
              {busy ? 'Guardando…' : 'Guardar'}
            </button>
          </div>
        </form>
      ) : cert ? (
        <div className="cert-state">
          <span className="cert-done">
            <CheckCircle2 size={15} strokeWidth={2} /> Emitido el {dayText(cert.issued_on)}
          </span>
          {cert.file_path ? (
            <button type="button" className="cert-btn" onClick={open}>
              <FileDown size={14} strokeWidth={1.75} /> Ver PDF
            </button>
          ) : (
            <span className="cert-muted">Sin PDF</span>
          )}
          <button type="button" className="cert-link" onClick={() => setEditing(true)} disabled={busy}>
            <Upload size={13} strokeWidth={1.75} /> {cert.file_path ? 'Cambiar' : 'Subir PDF'}
          </button>
          <button type="button" className="cert-link danger" onClick={unmark} disabled={busy}>
            Quitar
          </button>
        </div>
      ) : (
        <button type="button" className="cert-btn primary" onClick={() => setEditing(true)}>
          <Award size={14} strokeWidth={1.75} /> Marcar «Certificado emitido»
        </button>
      )}
      {error && <p className="cert-error">{error}</p>}
    </li>
  )
}

/**
 * «Certificados» (parte 43), solo la ceo: por cada curso terminado, sus alumnos con su media y su
 * asistencia, y «Certificado emitido» (fecha y PDF subido a mano). Buscar por alumno y por curso.
 * courses, students, attendance: los de su app. client: Supabase.
 */
export default function CertificatesView({ client, courses, students, attendance }) {
  const [certs, setCerts] = useState(null)
  const [grades, setGrades] = useState(null)
  const [error, setError] = useState(null)
  const [reload, setReload] = useState(0)
  const [query, setQuery] = useState('')
  const [course, setCourse] = useState('')
  const today = todayKey()

  useEffect(() => {
    if (!client) return
    let active = true
    listCertificates(client).then(
      (m) => {
        if (!active) return
        setCerts(m)
        setError(null)
      },
      (err) => active && setError(certificatesErrorText(err)),
    )
    gradeSummary(client).then((m) => active && setGrades(m), () => {})
    return () => {
      active = false
    }
  }, [client, reload])

  const finished = certificateGroups({ courses, students, attendance, today })
  const groups = certs ? certificateGroups({ courses, students, attendance, grades, certs, today, course, query }) : []

  return (
    <div className="cert-root">
      <header className="cert-head">
        <h1>Certificados</h1>
        <p className="cert-muted">Los cursos terminados con sus alumnos. Solo los ves tú.</p>
      </header>
      <div className="cert-filters">
        <label className="cert-search">
          <Search size={15} strokeWidth={1.75} />
          <input type="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Buscar alumno o curso" aria-label="Buscar alumno o curso" />
        </label>
        <select value={course} onChange={(e) => setCourse(e.target.value)} aria-label="Filtrar por curso">
          <option value="">Todos los cursos terminados</option>
          {finished.map((g) => (
            <option key={g.course.id} value={g.course.id}>
              {normalizeCourse(g.course).name}
            </option>
          ))}
        </select>
      </div>

      {!client ? (
        <p className="cert-muted">Activa la sincronización para usar los certificados.</p>
      ) : error ? (
        <p className="cert-error">{error}</p>
      ) : !certs ? (
        <p className="cert-muted">Cargando…</p>
      ) : finished.length === 0 ? (
        <p className="cert-muted">Todavía no hay cursos terminados (con el estado «Terminado» o con la fecha de fin ya pasada).</p>
      ) : groups.length === 0 ? (
        <p className="cert-muted">Ningún alumno ni curso con esa búsqueda.</p>
      ) : (
        groups.map((g) => {
          const done = g.rows.filter((r) => r.cert).length
          return (
            <section key={g.course.id} className="cert-course">
              <div className="cert-course-head">
                <h2>{g.course.name}</h2>
                <span className="cert-muted">
                  {g.course.endDate ? `Terminó el ${dayText(g.course.endDate)} · ` : ''}
                  {done} de {g.rows.length} emitidos
                </span>
              </div>
              <ul className="cert-list">
                {g.rows.map((r) => (
                  <CertRow key={`${g.course.id}|${r.student.id}|${r.cert?.updated_at || ''}`} client={client} courseId={g.course.id} row={r} onChanged={() => setReload((n) => n + 1)} />
                ))}
              </ul>
            </section>
          )
        })
      )}
    </div>
  )
}
