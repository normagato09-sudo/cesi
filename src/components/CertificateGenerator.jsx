import { useEffect, useMemo, useState } from 'react'
import { AlertTriangle, Eye, FileCheck2, Search, X } from 'lucide-react'
import { courseFinished } from '../lib/certificates'
import { certificateInfo, todayKey } from '../lib/certificateMake'
import { assetsErrorText, certificateWarnings, defaultChoice, issueGeneratedCertificate, personCourseIds, saveCourseSettings } from '../lib/certificateAssets'
import { makeCertificatePdf } from '../lib/certificateMake'
import { normalizeCourse } from '../lib/courses'

/**
 * Generar un certificado (parte 44). Con `fixed` ({ course, student }) desde la fila de un alumno;
 * sin él, «Nuevo certificado»: elegir la persona (cuentas de Accesos con ficha) y después el curso.
 * ctx: { client, courses, students, attendance, extraClasses, grades, certs, signatures, logos,
 * settings, people }. onDone(): al emitir.
 */
export default function CertificateGenerator({ ctx, fixed = null, onClose, onDone }) {
  const [person, setPerson] = useState(() => (fixed ? ctx.people.find((p) => p.studentId === fixed.student.id) || { studentId: fixed.student.id, name: fixed.student.name } : null))
  const [courseId, setCourseId] = useState(fixed?.course.id || '')
  const [query, setQuery] = useState('')
  const course = ctx.courses.find((c) => c.id === courseId) || null
  const [name, setName] = useState(() => person?.name || '')
  const [issuedOn, setIssuedOn] = useState(todayKey)
  const [choice, setChoice] = useState(() => (course ? defaultChoice(normalizeCourse(course), ctx.signatures, ctx.settings.get(course.id)) : defaultChoice(null, ctx.signatures)))
  const [preview, setPreview] = useState(null) // URL del PDF
  const [busy, setBusy] = useState(null) // 'preview' | 'issue'
  const [error, setError] = useState(null)

  useEffect(() => () => preview && URL.revokeObjectURL(preview), [preview])

  const myCourses = useMemo(() => {
    if (!person) return []
    const ids = new Set(personCourseIds(person.studentId, ctx))
    return ctx.courses.filter((c) => ids.has(c.id)).map(normalizeCourse)
  }, [person, ctx])

  const pickPerson = (p) => {
    setPerson(p)
    setName(p.name)
    setCourseId('')
    setPreview(null)
  }
  const pickCourse = (id) => {
    setCourseId(id)
    const c = ctx.courses.find((x) => x.id === id)
    if (c) setChoice(defaultChoice(normalizeCourse(c), ctx.signatures, ctx.settings.get(id)))
    setPreview(null)
  }
  const set = (patch) => {
    setChoice((c) => ({ ...c, ...patch }))
    setPreview(null)
  }

  const info = person && course && issuedOn ? certificateInfo({ course, studentId: person.studentId, personName: name.trim(), ctx, issuedOn, choice }) : null
  const warnings = info ? certificateWarnings({ course, today: todayKey(), average: info.average }) : []

  const build = () => makeCertificatePdf(ctx.client, info, { signatures: ctx.signatures, logos: ctx.logos })

  const showPreview = async () => {
    if (!name.trim()) return setError('Escribe el nombre que sale en el certificado.')
    setBusy('preview')
    setError(null)
    try {
      setPreview(URL.createObjectURL(await build()))
    } catch (err) {
      setError(assetsErrorText(err))
    }
    setBusy(null)
  }
  const issue = async () => {
    if (!name.trim()) return setError('Escribe el nombre que sale en el certificado.')
    if (info.previous?.file_path && !window.confirm('Esta persona ya tiene certificado de este curso. ¿Generarlo otra vez? Se sustituye el PDF (el código se mantiene).')) return
    setBusy('issue')
    setError(null)
    try {
      const pdf = await build()
      await issueGeneratedCertificate(ctx.client, { courseId: course.id, studentId: person.studentId, personName: name.trim(), issuedOn, code: info.code, choice }, pdf, info.previous)
      await saveCourseSettings(ctx.client, course.id, choice).catch(() => {})
      onDone()
    } catch (err) {
      setError(/duplicate key|course_certificates_code/i.test(err?.message || '') ? 'Ese código ya existe: vuelve a intentarlo.' : assetsErrorText(err))
      setBusy(null)
    }
  }

  const q = query.trim().toLocaleLowerCase('es')
  const people = ctx.people.filter((p) => !q || `${p.name} ${p.email}`.toLocaleLowerCase('es').includes(q)).slice(0, 50)
  const sigOptions = ctx.signatures.map((s) => (
    <option key={s.id} value={s.id}>
      {s.name}
      {s.title ? ` · ${s.title}` : ''}
    </option>
  ))

  return (
    <div className="cert-modal" role="dialog" aria-modal="true" aria-label="Generar certificado">
      <div className="cert-modal-card">
        <header className="cert-modal-head">
          <h2>{fixed ? 'Generar certificado' : 'Nuevo certificado'}</h2>
          <button type="button" className="cert-icon" onClick={onClose} aria-label="Cerrar">
            <X size={18} strokeWidth={1.75} />
          </button>
        </header>

        {!person ? (
          <div className="cert-step">
            <p className="cert-label">1. Elige la persona (cuentas de Accesos: alumnos y equipo)</p>
            <label className="cert-search">
              <Search size={15} strokeWidth={1.75} />
              <input type="search" autoFocus value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Buscar por nombre o correo" aria-label="Buscar persona" />
            </label>
            {ctx.people.length === 0 ? (
              <p className="cert-muted">No hay cuentas de alumnos ni de equipo con ficha de alumno.</p>
            ) : (
              <ul className="cert-pick">
                {people.map((p) => (
                  <li key={p.accountId}>
                    <button type="button" onClick={() => pickPerson(p)}>
                      <strong>{p.name}</strong>
                      <span className="cert-muted">
                        {p.role === 'equipo' ? 'Equipo' : 'Alumno'}
                        {p.email ? ` · ${p.email}` : ''}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        ) : (
          <div className="cert-step">
            {!fixed && (
              <p className="cert-label">
                Persona: <strong>{person.name}</strong>{' '}
                <button type="button" className="cert-link" onClick={() => setPerson(null)}>
                  Cambiar
                </button>
              </p>
            )}
            {!fixed && (
              <label className="cert-field">
                <span>2. Curso (los suyos, actuales o pasados)</span>
                <select value={courseId} onChange={(e) => pickCourse(e.target.value)}>
                  <option value="">Elige el curso…</option>
                  {myCourses.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                      {courseFinished(c, todayKey()) ? '' : ' (sin terminar)'}
                    </option>
                  ))}
                </select>
                {myCourses.length === 0 && <em className="cert-muted">Esta persona no tiene cursos.</em>}
              </label>
            )}

            {course && info && (
              <>
                {warnings.length > 0 && (
                  <div className="cert-warn" role="status">
                    <AlertTriangle size={16} strokeWidth={1.75} />
                    <span>{warnings.join(' ')} Se puede emitir igualmente.</span>
                  </div>
                )}
                <div className="cert-grid">
                  <label className="cert-field">
                    <span>Nombre en el certificado</span>
                    <input type="text" maxLength={160} value={name} onChange={(e) => (setName(e.target.value), setPreview(null))} />
                  </label>
                  <label className="cert-field">
                    <span>Fecha de emisión</span>
                    <input type="date" value={issuedOn} onChange={(e) => (setIssuedOn(e.target.value), setPreview(null))} />
                  </label>
                  <label className="cert-field">
                    <span>Firma izquierda</span>
                    <select value={choice.leftId || ''} onChange={(e) => set({ leftId: e.target.value || null })}>
                      <option value="">Sin firma</option>
                      {sigOptions}
                    </select>
                  </label>
                  <label className="cert-field">
                    <span>Firma derecha</span>
                    <select value={choice.rightId || ''} onChange={(e) => set({ rightId: e.target.value || null })}>
                      <option value="">Sin firma</option>
                      {sigOptions}
                    </select>
                  </label>
                  <label className="cert-field">
                    <span>Logo de empresa (opcional)</span>
                    <select value={choice.logoId || ''} onChange={(e) => set({ logoId: e.target.value || null })}>
                      <option value="">Sin logo</option>
                      {ctx.logos.map((l) => (
                        <option key={l.id} value={l.id}>
                          {l.name}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="cert-check">
                    <input type="checkbox" checked={choice.showStats} onChange={(e) => set({ showStats: e.target.checked })} />
                    <span>Mostrar nota media y asistencia</span>
                  </label>
                </div>
                <p className="cert-muted">
                  Código: <strong>{info.code}</strong>
                  {' · '}Media: {info.average === null ? '—' : String(info.average).replace('.', ',')}
                  {' · '}Asistencia: {info.attendance === null ? '—' : `${info.attendance} %`}
                  {' · '}
                  {String(info.hours).replace('.', ',')} horas
                </p>
                {preview && <iframe className="cert-preview" src={preview} title="Vista previa del certificado" />}
              </>
            )}
          </div>
        )}

        {error && <p className="cert-error">{error}</p>}
        <footer className="cert-modal-foot">
          <button type="button" className="cert-btn" onClick={onClose} disabled={!!busy}>
            Cancelar
          </button>
          {info && (
            <>
              <button type="button" className="cert-btn" onClick={showPreview} disabled={!!busy}>
                <Eye size={14} strokeWidth={1.75} /> {busy === 'preview' ? 'Preparando…' : 'Vista previa'}
              </button>
              <button type="button" className="cert-btn primary" onClick={issue} disabled={!!busy}>
                <FileCheck2 size={14} strokeWidth={1.75} /> {busy === 'issue' ? 'Emitiendo…' : 'Emitir certificado'}
              </button>
            </>
          )}
        </footer>
      </div>
    </div>
  )
}
