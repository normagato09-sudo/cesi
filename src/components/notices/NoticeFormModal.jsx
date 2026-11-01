import { useMemo, useState } from 'react'
import Modal from '../shared/Modal.jsx'
import { MAX_BODY, MAX_TITLE, deleteNotice, emptyNoticeForm, formFromNotice, saveNotice, validateNoticeForm } from '../../lib/notices'
import '../shared/SharedCalendar.css'
import './Notices.css'

// Publicar un aviso o editarlo (quien lo publicó y la ceo). areas: [{ id, name }].
export default function NoticeFormModal({ client, notice = null, areas, onClose, onSaved }) {
  const [form, setForm] = useState(() => (notice ? formFromNotice(notice) : emptyNoticeForm()))
  const [tried, setTried] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)
  const errors = useMemo(() => (tried ? validateNoticeForm(form) : {}), [tried, form])
  const set = (patch) => setForm((f) => ({ ...f, ...patch }))

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
    setTried(true)
    if (Object.keys(validateNoticeForm(form)).length > 0) return
    run(() => saveNotice(client, notice?.id || null, form))
  }

  const field = (name) => `sc-field${errors[name] ? ' invalid' : ''}`

  return (
    <Modal title={notice ? 'Editar aviso' : 'Nuevo aviso'} onClose={onClose}>
      <form className="sc-form" onSubmit={submit} noValidate>
        <label className={field('title')}>
          <span>Título</span>
          <input type="text" value={form.title} maxLength={MAX_TITLE} onChange={(e) => set({ title: e.target.value })} autoFocus />
          {errors.title && <span className="sc-error">{errors.title}</span>}
        </label>
        <label className={field('body')}>
          <span>Texto</span>
          <textarea rows={5} value={form.body} maxLength={MAX_BODY} onChange={(e) => set({ body: e.target.value })} />
          {errors.body && <span className="sc-error">{errors.body}</span>}
        </label>
        <div className="sc-row">
          <label className="sc-field">
            <span>Para quién</span>
            <select value={form.area} onChange={(e) => set({ area: e.target.value })}>
              <option value="">Todo el equipo</option>
              {areas.map((a) => (
                <option key={a.id} value={a.id}>
                  Área {a.name}
                </option>
              ))}
            </select>
          </label>
          <label className={field('showUntil')}>
            <span>Se muestra hasta (opcional)</span>
            <input type="date" value={form.showUntil} onChange={(e) => set({ showUntil: e.target.value })} />
            {errors.showUntil && <span className="sc-error">{errors.showUntil}</span>}
          </label>
        </div>
        <label className="nt-check">
          <input type="checkbox" checked={form.important} onChange={(e) => set({ important: e.target.checked })} />
          <span>Importante (sale destacado en rojo)</span>
        </label>
        {error && <p className="sc-message error">{error}</p>}
        <div className="sc-actions">
          {notice && (
            <button
              type="button"
              className="sc-btn-danger"
              disabled={busy}
              onClick={() => window.confirm(`¿Borrar el aviso «${notice.title}»?`) && run(() => deleteNotice(client, notice.id))}
            >
              Borrar
            </button>
          )}
          <button type="button" className="sc-btn" onClick={onClose}>
            Cancelar
          </button>
          <button type="submit" className="sc-btn-primary" disabled={busy}>
            {busy ? 'Guardando…' : notice ? 'Guardar cambios' : 'Publicar'}
          </button>
        </div>
      </form>
    </Modal>
  )
}
