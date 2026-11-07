import { useEffect, useMemo, useState } from 'react'
import { Award, CheckCircle2, FileDown, Plus, Search, Sparkles, Upload } from 'lucide-react'
import { certFileError, certificateGroups, certificatesErrorText, listCertificates, openCertificate, removeCertificate, saveCertificate } from '../lib/certificates'
import { gradeSummary, scoreText, scoreTone } from '../lib/grades'
import { normalizeCourse } from '../lib/courses'
import { dayText } from '../lib/courseRoom'
import CertificateGenerator from './CertificateGenerator.jsx'
import CertificateAssets from './CertificateAssets.jsx'
import { assetsErrorText, certificatePeople, defaultChoice, issueGeneratedCertificate, listCourseSettings, listLogos, listSignatures } from '../lib/certificateAssets'
import { certificateInfo, makeCertificatePdf } from '../lib/certificateMake'
import { listProfiles } from '../lib/profiles'
import { listPortalsByAccount } from '../lib/studentPortal'
import './CourseGrades.css'
import './Certificates.css'

const todayKey = () => {
  const d = new Date()
  const p = (n) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`
}

// Una fila: alumno, media, asistencia y su certificado (marcar, fecha, PDF).
function CertRow({ client, courseId, row, onChanged, onGenerate = null }) {
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
          {cert.code && <span className="cert-muted">{cert.code}</span>}
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
          {onGenerate && (
            <button type="button" className="cert-link" onClick={onGenerate} disabled={busy}>
              <Sparkles size={13} strokeWidth={1.75} /> Generar de nuevo
            </button>
          )}
          <button type="button" className="cert-link danger" onClick={unmark} disabled={busy}>
            Quitar
          </button>
        </div>
      ) : (
        <div className="cert-state">
          {onGenerate && (
            <button type="button" className="cert-btn primary" onClick={onGenerate}>
              <Sparkles size={14} strokeWidth={1.75} /> Generar certificado
            </button>
          )}
          <button type="button" className={onGenerate ? 'cert-btn' : 'cert-btn primary'} onClick={() => setEditing(true)}>
            <Award size={14} strokeWidth={1.75} /> Marcar y subir PDF
          </button>
        </div>
      )}
      {error && <p className="cert-error">{error}</p>}
    </li>
  )
}

/**
 * «Certificados» (partes 43 y 44), solo la ceo: por cada curso terminado, sus alumnos con su media
 * y su asistencia, y «Certificado emitido» (fecha y PDF). Parte 44: «Generar certificado» con el
 * diseño de CIFA (en cada alumno, «Nuevo certificado» y «Generar todos» por curso), y las zonas
 * «Firmas» y «Logos». Buscar por alumno y por curso.
 * courses, students, attendance, extraClasses, contacts: los de su app. client: Supabase.
 */
export default function CertificatesView({ client, courses, students, attendance, extraClasses = [], contacts = [] }) {
  const [certs, setCerts] = useState(null)
  const [grades, setGrades] = useState(null)
  const [error, setError] = useState(null)
  const [reload, setReload] = useState(0)
  const [query, setQuery] = useState('')
  const [course, setCourse] = useState('')
  const [tab, setTab] = useState('list')
  // Parte 44: firmas, logos, ajustes por curso y personas (sin el SQL de la 44, sin generar).
  const [loaded, setLoaded] = useState({ signatures: [], logos: [], settings: new Map(), profiles: [], portals: new Map() })
  const [assetsError, setAssetsError] = useState(null)
  const [generator, setGenerator] = useState(null) // { fixed } (null: cerrado)
  const [batch, setBatch] = useState(null) // { courseId, done, total, error }
  const today = todayKey()
  const refresh = () => setReload((n) => n + 1)

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
    Promise.all([listSignatures(client), listLogos(client), listCourseSettings(client), listProfiles(client), listPortalsByAccount(client)]).then(
      ([signatures, logos, settings, profiles, portals]) => {
        if (!active) return
        setLoaded({ signatures, logos, settings, profiles, portals })
        setAssetsError(null)
      },
      (err) => active && setAssetsError(assetsErrorText(err)),
    )
    return () => {
      active = false
    }
  }, [client, reload])
  const people = useMemo(() => certificatePeople(loaded.profiles, loaded.portals, students), [loaded, students])
  const assets = { signatures: loaded.signatures, logos: loaded.logos, settings: loaded.settings, people }

  const finished = certificateGroups({ courses, students, attendance, today })
  const groups = certs ? certificateGroups({ courses, students, attendance, grades, certs, today, course, query }) : []
  const canGenerate = !!client && !assetsError && !!certs
  const ctx = { client, courses, students, attendance, extraClasses, grades, certs: certs || new Map(), ...assets }
  // Profesores (para unir una firma a uno): los de los cursos.
  const teacherIds = new Set(courses.map((c) => c.teacherId).filter(Boolean))
  const teachers = contacts.filter((c) => teacherIds.has(c.id)).map((c) => ({ id: c.id, name: c.name || 'Profesor' }))

  // Nombre de una persona para el certificado: el de su perfil (si tiene cuenta) o el de su ficha.
  const nameOf = (student) => assets.people.find((p) => p.studentId === student.id)?.name || student.name || ''

  // «Generar todos»: los que aún no tienen certificado, con las firmas y el logo del curso.
  const generateAll = async (g) => {
    const pending = g.rows.filter((r) => !r.cert)
    if (!pending.length) return
    const choice = defaultChoice(g.course, assets.signatures, assets.settings.get(g.course.id))
    const left = assets.signatures.find((s) => s.id === choice.leftId)?.name || 'sin firma'
    const right = assets.signatures.find((s) => s.id === choice.rightId)?.name || 'sin firma'
    const question = `¿Generar ${pending.length} ${pending.length === 1 ? 'certificado' : 'certificados'} de «${g.course.name}»?\nFirmas: ${left} y ${right}.${choice.logoId ? ' Con logo.' : ''} ${choice.showStats ? 'Con' : 'Sin'} media y asistencia.`
    if (!window.confirm(question)) return
    const local = new Map(certs)
    const cache = new Map()
    setBatch({ courseId: g.course.id, done: 0, total: pending.length, error: null })
    let done = 0
    for (const r of pending) {
      try {
        const info = certificateInfo({ course: g.course, studentId: r.student.id, personName: nameOf(r.student), ctx: { ...ctx, certs: local }, issuedOn: today, choice })
        const pdf = await makeCertificatePdf(client, info, assets, cache)
        await issueGeneratedCertificate(client, { courseId: g.course.id, studentId: r.student.id, personName: info.personName, issuedOn: today, code: info.code, choice }, pdf, null)
        local.set(`${g.course.id}|${r.student.id}`, { code: info.code })
        done++
        setBatch({ courseId: g.course.id, done, total: pending.length, error: null })
      } catch (err) {
        setBatch({ courseId: g.course.id, done, total: pending.length, error: `${r.student.name}: ${assetsErrorText(err)}` })
        refresh()
        return
      }
    }
    setBatch(null)
    refresh()
  }

  return (
    <div className="cert-root">
      <header className="cert-head cert-head-row">
        <div>
          <h1>Certificados</h1>
          <p className="cert-muted">Los cursos terminados con sus alumnos. Solo los ves tú.</p>
        </div>
        {canGenerate && tab === 'list' && (
          <button type="button" className="cert-btn primary" onClick={() => setGenerator({ fixed: null })}>
            <Plus size={15} strokeWidth={2} /> Nuevo certificado
          </button>
        )}
      </header>

      <div className="cert-tabs" role="tablist" aria-label="Certificados">
        {[
          ['list', 'Certificados'],
          ['sig', `Firmas (${assets.signatures.length})`],
          ['logo', `Logos (${assets.logos.length})`],
        ].map(([id, label]) => (
          <button key={id} type="button" role="tab" aria-selected={tab === id} className={tab === id ? 'on' : ''} onClick={() => setTab(id)}>
            {label}
          </button>
        ))}
      </div>
      {assetsError && client && <p className="cert-error">{assetsError}</p>}

      {tab === 'sig' || tab === 'logo' ? (
        client && !assetsError && <CertificateAssets client={client} kind={tab} items={tab === 'sig' ? assets.signatures : assets.logos} teachers={teachers} onChanged={refresh} />
      ) : (
        <>
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
          ) : groups.length === 0 ? (
            <p className="cert-muted">{finished.length === 0 ? 'Todavía no hay cursos terminados (con el estado «Terminado» o con la fecha de fin ya pasada).' : 'Ningún alumno ni curso con esa búsqueda.'}</p>
          ) : (
            groups.map((g) => {
              const done = g.rows.filter((r) => r.cert).length
              const running = batch?.courseId === g.course.id
              return (
                <section key={g.course.id} className="cert-course">
                  <div className="cert-course-head">
                    <div>
                      <h2>{g.course.name}</h2>
                      <span className="cert-muted">
                        {g.finished ? (g.course.endDate ? `Terminó el ${dayText(g.course.endDate)} · ` : '') : 'Sin terminar · '}
                        {done} de {g.rows.length} emitidos
                      </span>
                    </div>
                    {canGenerate && g.finished && done < g.rows.length && (
                      <button type="button" className="cert-btn" onClick={() => generateAll(g)} disabled={!!batch}>
                        <Sparkles size={14} strokeWidth={1.75} /> {running ? `Generando ${Math.min(batch.done + 1, batch.total)} de ${batch.total}…` : 'Generar todos'}
                      </button>
                    )}
                  </div>
                  {running && batch.error && <p className="cert-error cert-pad">{batch.error}</p>}
                  <ul className="cert-list">
                    {g.rows.map((r) => (
                      <CertRow
                        key={`${g.course.id}|${r.student.id}|${r.cert?.updated_at || ''}`}
                        client={client}
                        courseId={g.course.id}
                        row={r}
                        onChanged={refresh}
                        onGenerate={canGenerate && !batch ? () => setGenerator({ fixed: { course: g.course, student: { ...r.student, name: nameOf(r.student) } } }) : null}
                      />
                    ))}
                  </ul>
                </section>
              )
            })
          )}
        </>
      )}

      {generator && (
        <CertificateGenerator
          ctx={ctx}
          fixed={generator.fixed}
          onClose={() => setGenerator(null)}
          onDone={() => {
            setGenerator(null)
            refresh()
          }}
        />
      )}
    </div>
  )
}
