import { useState } from 'react'
import { Pencil, Video } from 'lucide-react'
import { validCallLink } from '../lib/studentCourses'

/**
 * Link de la llamada de un curso («Mi clase»): el link con «Entrar» y, si se puede (el profesor,
 * la ceo y Directivo), «Cambiar». onSave(link) puede devolver una promesa; null: solo verlo.
 */
export default function CallLinkBox({ link = '', onSave = null }) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(link)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)

  const save = async () => {
    if (!validCallLink(draft)) {
      setError('El link tiene que empezar por https://')
      return
    }
    setBusy(true)
    setError(null)
    try {
      await onSave(draft.trim())
      setEditing(false)
    } catch (err) {
      setError(err.message || 'No se pudo guardar.')
    }
    setBusy(false)
  }

  return (
    <section className="cp-section cp-call">
      <h3>
        <Video size={14} strokeWidth={1.75} /> Link de la llamada
      </h3>
      {editing ? (
        <div className="cp-call-edit">
          <input type="url" value={draft} onChange={(e) => setDraft(e.target.value)} placeholder="https://meet.google.com/… o https://discord.gg/…" aria-label="Link de la llamada" />
          <button type="button" className="cp-btn" onClick={() => setEditing(false)} disabled={busy}>
            Cancelar
          </button>
          <button type="button" className="cp-btn primary" onClick={save} disabled={busy}>
            Guardar
          </button>
        </div>
      ) : (
        <div className="cp-call-edit">
          {link ? (
            <a className="cp-btn primary" href={link} target="_blank" rel="noreferrer noopener">
              <Video size={14} strokeWidth={1.75} />
              Entrar
            </a>
          ) : (
            <span className="cp-muted">Todavía no hay link.</span>
          )}
          {link && <span className="cp-muted cp-call-url">{link}</span>}
          {onSave && (
            <button
              type="button"
              className="cp-btn"
              onClick={() => {
                setDraft(link)
                setEditing(true)
              }}
            >
              <Pencil size={14} strokeWidth={1.75} />
              {link ? 'Cambiar' : 'Poner link'}
            </button>
          )}
        </div>
      )}
      {error && <p className="cp-muted">{error}</p>}
    </section>
  )
}
