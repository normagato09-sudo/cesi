import { useEffect, useState } from 'react'
import { listTestimonialCourses } from '../lib/testimonials'
import {
  BODY_MAX,
  KINDS,
  KIND_LABEL,
  REPLY_MAX,
  STATUSES,
  STATUS_LABEL,
  answerMailbox,
  filterMailbox,
  listMailbox,
  mailDate,
  mailboxErrorText,
  sendMailbox,
  statusCounts,
  validateMailbox,
} from '../lib/mailbox'
import './Mailbox.css'

// Un mensaje del buzón visto por la ceo: quién, cuándo, el texto, el estado y la respuesta.
function CeoItem({ client, item, onChanged }) {
  const [reply, setReply] = useState(item.reply || '')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)

  const save = async (patch) => {
    setBusy(true)
    setError(null)
    try {
      await answerMailbox(client, item.id, patch)
      onChanged()
    } catch (err) {
      setError(mailboxErrorText(err))
    }
    setBusy(false)
  }

  return (
    <article className={`mb-card mb-item ${item.status}`}>
      <div className="mb-item-top">
        <span className={`mb-kind ${item.kind}`}>{KIND_LABEL[item.kind]}</span>
        <span className={`mb-status ${item.status}`}>{STATUS_LABEL[item.status]}</span>
        <span className="mb-muted">{mailDate(item.created_at)}</span>
      </div>
      <p className="mb-who">
        <strong>{item.author_name}</strong> · {item.author_role}
        {item.course_name ? ` · ${item.course_name}` : ''}
      </p>
      <p className="mb-text">{item.body}</p>
      {item.reported && (
        <blockquote className="mb-reported">
          <span className="mb-muted">Mensaje reportado de {item.reported.author_name || 'alguien'}:</span>
          {item.reported.body}
        </blockquote>
      )}
      <label className="mb-sr" htmlFor={`mb-reply-${item.id}`}>
        Respuesta
      </label>
      <textarea id={`mb-reply-${item.id}`} rows={2} maxLength={REPLY_MAX} value={reply} placeholder="Escribe tu respuesta (la verá quien lo envió)" onChange={(e) => setReply(e.target.value)} />
      <div className="mb-actions">
        <label className="mb-status-pick">
          Estado
          <select value={item.status} disabled={busy} onChange={(e) => save({ status: e.target.value })}>
            {STATUSES.map((s) => (
              <option key={s.id} value={s.id}>
                {s.label}
              </option>
            ))}
          </select>
        </label>
        <button
          type="button"
          className="mb-primary"
          disabled={busy || reply.trim() === (item.reply || '').trim()}
          onClick={() => save({ reply, status: item.status === 'nueva' ? 'vista' : null })}
        >
          {item.reply ? 'Guardar respuesta' : 'Responder'}
        </button>
      </div>
      {error && <p className="mb-error">{error}</p>}
    </article>
  )
}

/**
 * Buzón (parte 35). Alumnos, profesores y equipo envían una sugerencia o queja (texto y, si
 * quieren, uno de sus cursos) y ven solo las suyas con su estado y la respuesta. La ceo (isCeo)
 * las ve todas, con filtros por estado y tipo, cambia el estado y responde. readOnly («Ver
 * como»): sin enviar.
 */
export default function MailboxView({ client, isCeo = false, readOnly = false }) {
  const [list, setList] = useState(null)
  const [courses, setCourses] = useState([])
  const [error, setError] = useState(null)
  const [reload, setReload] = useState(0)
  const [form, setForm] = useState({ kind: 'sugerencia', body: '', course: '' })
  const [busy, setBusy] = useState(false)
  const [formError, setFormError] = useState(null)
  const [sent, setSent] = useState(false)
  const [status, setStatus] = useState('')
  const [kind, setKind] = useState('')

  useEffect(() => {
    if (!client) return
    let active = true
    Promise.all([listMailbox(client), isCeo ? Promise.resolve([]) : listTestimonialCourses(client).catch(() => [])]).then(
      ([rows, mine]) => {
        if (!active) return
        setList(rows)
        setCourses(mine)
        setError(null)
      },
      (err) => active && setError(mailboxErrorText(err)),
    )
    return () => {
      active = false
    }
  }, [client, isCeo, reload])

  const send = async (e) => {
    e.preventDefault()
    const problem = validateMailbox(form)
    if (problem) {
      setFormError(problem)
      return
    }
    setBusy(true)
    setFormError(null)
    try {
      await sendMailbox(client, form)
      setForm((f) => ({ ...f, body: '' }))
      setSent(true)
      setReload((n) => n + 1)
    } catch (err) {
      setFormError(mailboxErrorText(err))
    }
    setBusy(false)
  }

  const counts = statusCounts(list || [])
  const shown = isCeo ? filterMailbox(list || [], { status, kind }) : list || []

  return (
    <div className="mb-root">
      <header className="mb-head">
        <h1>Buzón</h1>
        <p>{isCeo ? 'Sugerencias, quejas y reportes de alumnos y equipo. Solo los ves tú.' : 'Envía una sugerencia o una queja. Solo la verá la dirección.'}</p>
      </header>
      {error && <p className="mb-error">{error}</p>}

      {!isCeo && !readOnly && (
        <form className="mb-card mb-form" onSubmit={send}>
          <div className="mb-chips" role="radiogroup" aria-label="Tipo">
            {KINDS.map((k) => (
              <button
                key={k.id}
                type="button"
                role="radio"
                aria-checked={form.kind === k.id}
                className={form.kind === k.id ? 'on' : undefined}
                onClick={() => {
                  setForm((f) => ({ ...f, kind: k.id }))
                  setSent(false)
                }}
              >
                {k.label}
              </button>
            ))}
          </div>
          {courses.length > 0 && (
            <label className="mb-field">
              <span>Curso (opcional)</span>
              <select value={form.course} onChange={(e) => setForm((f) => ({ ...f, course: e.target.value }))}>
                <option value="">Sin curso</option>
                {courses.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </label>
          )}
          <label className="mb-field">
            <span>{form.kind === 'queja' ? 'Tu queja' : 'Tu sugerencia'}</span>
            <textarea
              rows={4}
              maxLength={BODY_MAX}
              value={form.body}
              placeholder="Cuéntanos con detalle…"
              onChange={(e) => {
                setForm((f) => ({ ...f, body: e.target.value }))
                setSent(false)
              }}
            />
          </label>
          <div className="mb-actions">
            <span className="mb-muted">
              {form.body.length} / {BODY_MAX}
            </span>
            <button type="submit" className="mb-primary" disabled={busy}>
              {busy ? 'Enviando…' : 'Enviar'}
            </button>
          </div>
          {formError && <p className="mb-error">{formError}</p>}
          {sent && !formError && <p className="mb-ok">Enviado. Aquí abajo verás su estado y la respuesta.</p>}
        </form>
      )}

      {isCeo && list && (
        <div className="mb-filters">
          <div className="mb-chips" role="group" aria-label="Estado">
            {[{ id: '', label: 'Todos' }, ...STATUSES].map((s) => (
              <button key={s.id || 'all'} type="button" aria-pressed={status === s.id} className={status === s.id ? 'on' : undefined} onClick={() => setStatus(s.id)}>
                {s.label} ({counts[s.id] || 0})
              </button>
            ))}
          </div>
          <label className="mb-status-pick">
            Tipo
            <select value={kind} onChange={(e) => setKind(e.target.value)}>
              <option value="">Todos</option>
              {Object.entries(KIND_LABEL).map(([id, label]) => (
                <option key={id} value={id}>
                  {label}
                </option>
              ))}
            </select>
          </label>
        </div>
      )}

      {!isCeo && <h2 className="mb-subtitle">Lo que has enviado</h2>}
      {!list ? (
        !error && <p className="mb-muted">Cargando…</p>
      ) : shown.length === 0 ? (
        <p className="mb-card mb-muted">{isCeo ? (list.length ? 'No hay nada con esos filtros.' : 'Todavía no ha llegado nada.') : 'Todavía no has enviado nada.'}</p>
      ) : (
        <div className="mb-list">
          {shown.map((m) =>
            isCeo ? (
              <CeoItem key={`${m.id}-${m.status}-${m.reply}`} client={client} item={m} onChanged={() => setReload((n) => n + 1)} />
            ) : (
              <article key={m.id} className="mb-card mb-item">
                <div className="mb-item-top">
                  <span className={`mb-kind ${m.kind}`}>{KIND_LABEL[m.kind]}</span>
                  <span className={`mb-status ${m.status}`}>{STATUS_LABEL[m.status]}</span>
                  <span className="mb-muted">{mailDate(m.created_at)}</span>
                </div>
                {m.course_name && <p className="mb-who">{m.course_name}</p>}
                <p className="mb-text">{m.body}</p>
                {m.reply && (
                  <div className="mb-reply">
                    <span className="mb-muted">Respuesta de la dirección{m.replied_at ? ` · ${mailDate(m.replied_at)}` : ''}</span>
                    <p className="mb-text">{m.reply}</p>
                  </div>
                )}
              </article>
            ),
          )}
        </div>
      )}
    </div>
  )
}
