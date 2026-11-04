import { useEffect, useRef, useState } from 'react'
import { ArrowLeft, Bold, Italic, Link2, List, ListOrdered } from 'lucide-react'
import RichText from './RichText.jsx'
import { deleteNewsletter, listNewsletter, markNewsletterRead, newsletterErrorText, postDate, readsText, saveNewsletter, validateNewsletter, TITLE_MAX } from '../lib/newsletter'
import { linkSelection, listLines, plainText, wrapSelection } from '../lib/richText'
import './Newsletter.css'

const EMPTY = { id: null, title: '', body: '' }

// Editor de la ceo (artboard 17, sin portada ni archivos): título, texto con botones de formato,
// «Guardar borrador» y «Publicar».
function Editor({ client, draft, onDone, onCancel }) {
  const [form, setForm] = useState(draft)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)
  const area = useRef(null)

  const apply = (fn) => {
    const el = area.current
    if (!el) return
    const next = fn(form.body, el.selectionStart, el.selectionEnd)
    if (!next) return
    setForm((f) => ({ ...f, body: next.value }))
    requestAnimationFrame(() => {
      el.focus()
      el.setSelectionRange(next.start, next.end)
    })
  }
  const addLink = () => {
    const url = window.prompt('Dirección del enlace (https://…)')
    if (!url) return
    const el = area.current
    const next = el && linkSelection(form.body, el.selectionStart, el.selectionEnd, url.trim())
    if (!next) {
      setError('El enlace tiene que empezar por https:// o http://')
      return
    }
    setError(null)
    apply(() => next)
  }

  const save = async (publish) => {
    const problem = validateNewsletter(form)
    if (problem) {
      setError(problem)
      return
    }
    setBusy(true)
    setError(null)
    try {
      await saveNewsletter(client, form, publish)
      onDone()
    } catch (err) {
      setError(newsletterErrorText(err))
      setBusy(false)
    }
  }

  return (
    <form className="nl-card nl-form" onSubmit={(e) => e.preventDefault()}>
      <span className="nl-form-title">{form.id ? 'Editar publicación' : 'Nueva publicación'}</span>
      <label className="nl-field">
        <span>Título</span>
        <input type="text" maxLength={TITLE_MAX} value={form.title} placeholder="Ej.: Noviembre en CIFA" onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))} />
      </label>
      <div className="nl-field">
        <label htmlFor="nl-text">Texto</label>
        <div className="nl-tools" role="toolbar" aria-label="Formato">
          <button type="button" onClick={() => apply((v, s, e) => wrapSelection(v, s, e, '**', '**', 'negrita'))} aria-label="Negrita" title="Negrita">
            <Bold size={16} strokeWidth={2} />
          </button>
          <button type="button" onClick={() => apply((v, s, e) => wrapSelection(v, s, e, '*', '*', 'cursiva'))} aria-label="Cursiva" title="Cursiva">
            <Italic size={16} strokeWidth={2} />
          </button>
          <button type="button" onClick={() => apply((v, s, e) => listLines(v, s, e, false))} aria-label="Lista con puntos" title="Lista con puntos">
            <List size={16} strokeWidth={2} />
          </button>
          <button type="button" onClick={() => apply((v, s, e) => listLines(v, s, e, true))} aria-label="Lista numerada" title="Lista numerada">
            <ListOrdered size={16} strokeWidth={2} />
          </button>
          <button type="button" onClick={addLink} aria-label="Enlace" title="Enlace">
            <Link2 size={16} strokeWidth={2} />
          </button>
        </div>
        <textarea id="nl-text" ref={area} rows={9} value={form.body} placeholder="Escribe la noticia…" onChange={(e) => setForm((f) => ({ ...f, body: e.target.value }))} />
      </div>
      {form.body.trim() && (
        <div className="nl-preview">
          <span className="nl-label">Así se verá</span>
          <RichText text={form.body} />
        </div>
      )}
      {error && <p className="nl-error">{error}</p>}
      <div className="nl-form-actions">
        {form.id && (
          <button type="button" className="nl-btn" onClick={onCancel} disabled={busy}>
            Cancelar
          </button>
        )}
        <button type="button" className="nl-btn" onClick={() => save(false)} disabled={busy}>
          {draft.id && draft.status === 'published' ? 'Guardar cambios' : 'Guardar borrador'}
        </button>
        {!(draft.id && draft.status === 'published') && (
          <button type="button" className="nl-btn primary" onClick={() => save(true)} disabled={busy}>
            Publicar
          </button>
        )}
      </div>
    </form>
  )
}

/**
 * Newsletter (parte 34). La ceo (canPublish) escribe, guarda borradores, publica, edita y borra
 * (artboard 17); alumnos y equipo leen las publicadas, la más nueva arriba, con «Nueva» hasta que
 * la abren (artboard 8, sin imágenes). readOnly («Ver como»): solo leer, sin marcar como leída.
 */
export default function NewsletterView({ client, canPublish = false, readOnly = false }) {
  const [posts, setPosts] = useState(null)
  const [error, setError] = useState(null)
  const [reload, setReload] = useState(0)
  const [editing, setEditing] = useState(null) // la que se edita (null: una nueva)
  const [editorKey, setEditorKey] = useState(0)
  const [openId, setOpenId] = useState(null)

  useEffect(() => {
    if (!client) return
    let active = true
    listNewsletter(client).then(
      (rows) => {
        if (!active) return
        setPosts(rows)
        setError(null)
      },
      (err) => active && setError(newsletterErrorText(err)),
    )
    return () => {
      active = false
    }
  }, [client, reload])

  const refresh = () => setReload((n) => n + 1)
  const open = posts?.find((p) => p.id === openId) || null

  const openPost = (post) => {
    setOpenId(post.id)
    window.scrollTo?.(0, 0)
    if (!post.is_read && !readOnly && !canPublish) {
      setPosts((list) => list.map((p) => (p.id === post.id ? { ...p, is_read: true } : p)))
      markNewsletterRead(client, post.id).catch(() => {})
    }
  }

  const remove = async (post) => {
    if (!window.confirm(`¿Borrar «${post.title}»?`)) return
    try {
      await deleteNewsletter(client, post.id)
      if (editing?.id === post.id) setEditing(null)
      refresh()
    } catch (err) {
      setError(newsletterErrorText(err))
    }
  }

  return (
    <div className="nl-root">
      <header className="nl-head">
        <h1>Newsletter</h1>
        <p>{canPublish ? 'Solo tú publicas. Alumnos y equipo la leen.' : 'Novedades de CIFA'}</p>
      </header>
      {error && <p className="nl-error">{error}</p>}

      {!posts ? (
        !error && <p className="nl-muted">Cargando…</p>
      ) : canPublish ? (
        <div className="nl-ceo">
          <Editor
            key={`${editing?.id || 'new'}-${editorKey}`}
            client={client}
            draft={editing || EMPTY}
            onDone={() => {
              setEditing(null)
              setEditorKey((n) => n + 1)
              refresh()
            }}
            onCancel={() => setEditing(null)}
          />
          <section className="nl-card nl-posts" aria-label="Publicaciones">
            <span className="nl-form-title">Publicaciones</span>
            {posts.length === 0 && <p className="nl-muted">Todavía no hay publicaciones.</p>}
            {posts.map((p) => (
              <article key={p.id} className="nl-post-row">
                <div className="nl-post-meta">
                  <span className={`nl-tag ${p.status}`}>{p.status === 'published' ? 'Publicada' : 'Borrador'}</span>
                  <span className="nl-muted">{postDate(p)}</span>
                </div>
                <strong>{p.title}</strong>
                <div className="nl-post-foot">
                  <span className="nl-muted">{readsText(p)}</span>
                  <span>
                    <button type="button" className="nl-link" onClick={() => setEditing(p)}>
                      Editar
                    </button>
                    <button type="button" className="nl-link danger" onClick={() => remove(p)}>
                      Borrar
                    </button>
                  </span>
                </div>
              </article>
            ))}
          </section>
        </div>
      ) : open ? (
        <article className="nl-card nl-reader">
          <button type="button" className="nl-back" onClick={() => setOpenId(null)}>
            <ArrowLeft size={16} strokeWidth={2} />
            Newsletter
          </button>
          <span className="nl-muted">{postDate(open)}</span>
          <h2>{open.title}</h2>
          <RichText text={open.body} />
        </article>
      ) : posts.length === 0 ? (
        <p className="nl-card nl-muted">Todavía no hay publicaciones.</p>
      ) : (
        <div className="nl-list">
          {posts.map((p) => (
            <button key={p.id} type="button" className="nl-card nl-item" onClick={() => openPost(p)}>
              <span className="nl-post-meta">
                {!p.is_read && <span className="nl-tag new">Nueva</span>}
                <span className="nl-muted">{postDate(p)}</span>
              </span>
              <strong>{p.title}</strong>
              <span className="nl-excerpt">{plainText(p.body)}</span>
              <span className="nl-read">Leer</span>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
