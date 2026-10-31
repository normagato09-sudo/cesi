import { useEffect, useMemo, useState } from 'react'
import { ShieldAlert, Trash2 } from 'lucide-react'
import Modal from '../shared/Modal.jsx'
import {
  addBoardComment,
  deleteBoardComment,
  deleteBoardItem,
  emptyItemForm,
  formFromItem,
  formText,
  listBoardComments,
  looksLikePassword,
  reviewState,
  saveBoardItem,
  validateItemForm,
} from '../../lib/boards'
import '../shared/SharedCalendar.css'
import './Boards.css'

function when(iso) {
  const d = new Date(iso)
  return Number.isNaN(d.getTime()) ? '' : d.toLocaleString('es-ES', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })
}

// Comentarios de un elemento (con fecha y autor). canComment: las personas del área, Directivo y la ceo.
function Comments({ client, itemId, canComment, asId, onChanged }) {
  const [rows, setRows] = useState(null)
  const [text, setText] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)
  const [reload, setReload] = useState(0)

  useEffect(() => {
    let active = true
    listBoardComments(client, itemId, asId).then(
      (data) => active && setRows(data || []),
      (err) => active && setError(err.message),
    )
    return () => {
      active = false
    }
  }, [client, itemId, asId, reload])

  const run = async (fn) => {
    setBusy(true)
    setError(null)
    try {
      await fn()
      setReload((n) => n + 1)
      onChanged?.()
      return true
    } catch (err) {
      setError(err.message)
      return false
    } finally {
      setBusy(false)
    }
  }

  return (
    <section className="bd-comments" aria-label="Comentarios">
      <h3>Comentarios</h3>
      {!rows ? (
        <p className="sc-zone">{error || 'Cargando…'}</p>
      ) : rows.length === 0 ? (
        <p className="sc-zone">Todavía no hay comentarios.</p>
      ) : (
        <ul>
          {rows.map((c) => (
            <li key={c.id}>
              <span className="bd-comment-meta">
                {c.author_name || '—'} · {when(c.created_at)}
              </span>
              <span className="bd-pre">{c.text}</span>
              {c.can_delete && (
                <button
                  type="button"
                  className="bd-comment-remove"
                  aria-label="Borrar el comentario"
                  title="Borrar el comentario"
                  disabled={busy}
                  onClick={() => window.confirm('¿Borrar este comentario?') && run(() => deleteBoardComment(client, c.id))}
                >
                  <Trash2 size={13} strokeWidth={1.75} />
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
      {canComment && (
        <form
          className="bd-comment-form"
          onSubmit={async (e) => {
            e.preventDefault()
            if (await run(() => addBoardComment(client, itemId, text))) setText('')
          }}
        >
          <textarea rows={2} value={text} maxLength={2000} onChange={(e) => setText(e.target.value)} placeholder="Escribe un comentario…" aria-label="Nuevo comentario" />
          <button type="submit" className="sc-btn" disabled={busy || !text.trim()}>
            Comentar
          </button>
        </form>
      )}
      {rows && error && <p className="sc-message error">{error}</p>}
    </section>
  )
}

/**
 * Nuevo elemento o ficha de uno: los campos del tablero de su área y sus comentarios. canEdit:
 * las personas del área y la ceo (Directivo y «Ver como», solo ver; Directivo, también comentar).
 * people: responsables posibles (las personas del área). today: 'AAAA-MM-DD' en mi zona.
 */
export default function BoardItemModal({ client, cfg, item = null, people = [], meId, canEdit, canComment, asId = null, today, onClose, onSaved, onChanged }) {
  const [form, setForm] = useState(() => (item ? formFromItem(cfg, item) : emptyItemForm(cfg, people.some((p) => p.id === meId) ? meId : '')))
  const [tried, setTried] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)
  const errors = useMemo(() => (tried ? validateItemForm(cfg, form) : {}), [tried, cfg, form])
  const set = (patch) => setForm((f) => ({ ...f, ...patch }))
  const setField = (id, value) => setForm((f) => ({ ...f, fields: { ...f.fields, [id]: value } }))
  const review = item ? reviewState(cfg, { due_date: form.dueDate }, today) : null
  // El responsable aunque ya no esté en el área.
  const owners = [...people]
  if (item?.owner_id && !owners.some((p) => p.id === item.owner_id)) owners.push({ id: item.owner_id, name: item.owner_name || 'Responsable' })

  const run = async (action) => {
    setBusy(true)
    setError(null)
    try {
      await action()
      onSaved()
    } catch (err) {
      setError(err.message)
      setBusy(false)
    }
  }

  const submit = (e) => {
    e.preventDefault()
    if (!canEdit) return
    setTried(true)
    if (Object.keys(validateItemForm(cfg, form)).length > 0) return
    // Ciberseguridad: se avisa, pero se puede seguir.
    if (cfg.passwordWarning && looksLikePassword(formText(form)) && !window.confirm('Parece que has escrito una contraseña o una clave. ¿Seguro que quieres guardarlo?')) return
    run(() => saveBoardItem(client, cfg, item?.id || null, form))
  }

  const field = (name) => `sc-field${errors[name] ? ' invalid' : ''}`

  return (
    <Modal title={item ? (canEdit ? 'Editar' : item.title) : cfg.newLabel} onClose={onClose} wide>
      <form className="sc-form" onSubmit={submit} noValidate>
        {cfg.passwordWarning && canEdit && (
          <p className="bd-warning" role="note">
            <ShieldAlert size={16} strokeWidth={1.75} />
            No escribas contraseñas ni claves aquí.
          </p>
        )}
        <fieldset disabled={!canEdit} style={{ display: 'contents' }}>
          <label className={field('title')}>
            <span>Título</span>
            <input type="text" value={form.title} maxLength={200} onChange={(e) => set({ title: e.target.value })} autoFocus={canEdit && !item} />
            {errors.title && <span className="sc-error">{errors.title}</span>}
          </label>
          <div className="sc-row">
            {cfg.fields
              .filter((f) => f.options)
              .map((f) => (
                <label key={f.id} className="sc-field">
                  <span>{f.label}</span>
                  <select value={form.fields[f.id]} onChange={(e) => setField(f.id, e.target.value)}>
                    <option value="">—</option>
                    {f.options.map((o) => (
                      <option key={o.id} value={o.id}>
                        {o.label}
                      </option>
                    ))}
                  </select>
                </label>
              ))}
            {cfg.priority && (
              <label className="sc-field">
                <span>{cfg.priority.label}</span>
                <select value={form.priority} onChange={(e) => set({ priority: e.target.value })}>
                  <option value="">—</option>
                  {cfg.priority.options.map((o) => (
                    <option key={o.id} value={o.id}>
                      {o.label}
                    </option>
                  ))}
                </select>
              </label>
            )}
            <label className="sc-field">
              <span>Estado</span>
              <select value={form.status} onChange={(e) => set({ status: e.target.value })}>
                {cfg.statuses.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.label}
                  </option>
                ))}
              </select>
            </label>
          </div>
          {cfg.fields
            .filter((f) => !f.options)
            .map((f) => (
              <label key={f.id} className={field(`field:${f.id}`)}>
                <span>{f.label}</span>
                {f.multiline ? (
                  <textarea value={form.fields[f.id]} maxLength={1000} onChange={(e) => setField(f.id, e.target.value)} />
                ) : (
                  <input type={f.link ? 'url' : 'text'} value={form.fields[f.id]} maxLength={1000} onChange={(e) => setField(f.id, e.target.value)} placeholder={f.link ? 'https://' : undefined} />
                )}
                {f.link && !canEdit && form.fields[f.id] && (
                  <a href={form.fields[f.id]} target="_blank" rel="noreferrer noopener">
                    Abrir el enlace
                  </a>
                )}
                {errors[`field:${f.id}`] && <span className="sc-error">{errors[`field:${f.id}`]}</span>}
              </label>
            ))}
          <label className="sc-field">
            <span>{cfg.descriptionLabel} (opcional)</span>
            <textarea value={form.description} maxLength={4000} onChange={(e) => set({ description: e.target.value })} />
          </label>
          <div className="sc-row">
            <label className="sc-field">
              <span>Responsable</span>
              <select value={form.owner} onChange={(e) => set({ owner: e.target.value })}>
                <option value="">Sin responsable</option>
                {owners.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            </label>
            <label className={field('dueDate')}>
              <span>{cfg.date.label}</span>
              <input type="date" value={form.dueDate} onChange={(e) => set({ dueDate: e.target.value })} />
              {review && <span className={`bd-review ${review}`}>{review === 'late' ? 'La revisión ya ha pasado.' : 'Hay que revisarlo en menos de 30 días.'}</span>}
              {errors.dueDate && <span className="sc-error">{errors.dueDate}</span>}
            </label>
            {cfg.date.withTime && (
              <label className="sc-field">
                <span>Hora</span>
                <input type="time" value={form.dueTime} onChange={(e) => set({ dueTime: e.target.value })} />
              </label>
            )}
          </div>
        </fieldset>

        {item && (
          <p className="sc-zone">
            Creado por {item.created_by_name || '—'} · {when(item.created_at)}
          </p>
        )}
        {error && <p className="sc-message error">{error}</p>}

        <div className="sc-actions">
          {item && canEdit && (
            <button
              type="button"
              className="sc-btn-danger"
              disabled={busy}
              onClick={() => window.confirm(`¿Borrar «${item.title}» y sus comentarios?`) && run(() => deleteBoardItem(client, item.id))}
            >
              Borrar
            </button>
          )}
          <button type="button" className="sc-btn" onClick={onClose}>
            {canEdit ? 'Cancelar' : 'Cerrar'}
          </button>
          {canEdit && (
            <button type="submit" className="sc-btn-primary" disabled={busy}>
              {busy ? 'Guardando…' : item ? 'Guardar cambios' : 'Crear'}
            </button>
          )}
        </div>
      </form>

      {item && <Comments client={client} itemId={item.id} canComment={canComment} asId={asId} onChanged={onChanged} />}
    </Modal>
  )
}
