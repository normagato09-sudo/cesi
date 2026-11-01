import { useEffect, useMemo, useState } from 'react'
import Modal from '../shared/Modal.jsx'
import { CATEGORIES, KINDS, METHODS, deleteMovement, emptyMovementForm, financeContacts, formFromMovement, saveMovement, validateMovementForm } from '../../lib/finance'
import '../shared/SharedCalendar.css'

// Nuevo movimiento o editar uno (Finanzas y la ceo). Sin permiso (Directivo o «Ver como»), solo se
// ve. areas: [{ id, name }]. today: 'AAAA-MM-DD'.
export default function MovementModal({ client, movement = null, areas, canEdit, today, onClose, onSaved }) {
  const [form, setForm] = useState(() => (movement ? formFromMovement(movement) : emptyMovementForm(today)))
  const [contacts, setContacts] = useState([])
  const [tried, setTried] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)
  const errors = useMemo(() => (tried ? validateMovementForm(form) : {}), [tried, form])
  const set = (patch) => setForm((f) => ({ ...f, ...patch }))

  // Contactos externos con seguimiento de Alianzas (solo el nombre), para los ingresos.
  useEffect(() => {
    if (!canEdit) return
    let active = true
    financeContacts(client).then(
      (rows) => active && setContacts(rows || []),
      () => active && setContacts([]),
    )
    return () => {
      active = false
    }
  }, [client, canEdit])
  const contactOptions = [...contacts]
  if (movement?.contact_id && !contactOptions.some((c) => c.id === movement.contact_id)) contactOptions.push({ id: movement.contact_id, name: movement.contact_name })

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
    if (Object.keys(validateMovementForm(form)).length > 0) return
    run(() => saveMovement(client, movement?.id || null, form))
  }

  const field = (name) => `sc-field${errors[name] ? ' invalid' : ''}`
  const err = (name) => errors[name] && <span className="sc-error">{errors[name]}</span>

  return (
    <Modal title={movement ? (canEdit ? 'Editar movimiento' : 'Movimiento') : 'Nuevo movimiento'} onClose={onClose}>
      <form className="sc-form" onSubmit={submit} noValidate>
        <fieldset disabled={!canEdit} style={{ display: 'contents' }}>
          <div className="tw-filters" role="radiogroup" aria-label="Tipo">
            {KINDS.map((k) => (
              <button
                key={k.id}
                type="button"
                role="radio"
                aria-checked={form.kind === k.id}
                className={`tw-filter${form.kind === k.id ? ' on' : ''}`}
                onClick={() => set({ kind: k.id, category: CATEGORIES[k.id][0].id, contact: k.id === 'ingreso' ? form.contact : '' })}
              >
                {k.label}
              </button>
            ))}
          </div>
          <label className={field('concept')}>
            <span>Concepto</span>
            <input type="text" value={form.concept} maxLength={200} onChange={(e) => set({ concept: e.target.value })} autoFocus={canEdit && !movement} />
            {err('concept')}
          </label>
          <div className="sc-row">
            <label className={field('amount')}>
              <span>Cantidad (€)</span>
              <input type="text" inputMode="decimal" value={form.amount} onChange={(e) => set({ amount: e.target.value })} placeholder="25,50" />
              {err('amount')}
            </label>
            <label className={field('day')}>
              <span>Fecha</span>
              <input type="date" value={form.day} onChange={(e) => set({ day: e.target.value })} />
              {err('day')}
            </label>
          </div>
          <div className="sc-row">
            <label className={field('category')}>
              <span>Categoría</span>
              <select value={form.category} onChange={(e) => set({ category: e.target.value })}>
                {CATEGORIES[form.kind].map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.label}
                  </option>
                ))}
              </select>
              {err('category')}
            </label>
            <label className="sc-field">
              <span>Área relacionada (opcional)</span>
              <select value={form.area} onChange={(e) => set({ area: e.target.value })}>
                <option value="">Ninguna</option>
                {areas.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="sc-field">
              <span>Método</span>
              <select value={form.method} onChange={(e) => set({ method: e.target.value })}>
                {METHODS.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.label}
                  </option>
                ))}
              </select>
            </label>
          </div>
          {form.kind === 'ingreso' && (
            <label className="sc-field">
              <span>De una alianza (opcional)</span>
              <select value={form.contact} onChange={(e) => set({ contact: e.target.value })}>
                <option value="">Ninguna</option>
                {contactOptions.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </label>
          )}
          <label className={field('receiptUrl')}>
            <span>Enlace al justificante (opcional)</span>
            <input type="url" value={form.receiptUrl} onChange={(e) => set({ receiptUrl: e.target.value })} placeholder="https://" />
            {!canEdit && form.receiptUrl && (
              <a href={form.receiptUrl} target="_blank" rel="noreferrer noopener">
                Abrir el justificante
              </a>
            )}
            {err('receiptUrl')}
          </label>
          <label className={field('notes')}>
            <span>Notas (opcional)</span>
            <textarea value={form.notes} maxLength={2000} onChange={(e) => set({ notes: e.target.value })} />
            {err('notes')}
          </label>
        </fieldset>

        {movement && (
          <p className="sc-zone">
            Creado por {movement.created_by_name || '—'}
            {movement.updated_by_name && movement.updated_at !== movement.created_at ? ` · Cambiado por ${movement.updated_by_name}` : ''}
          </p>
        )}
        {error && <p className="sc-message error">{error}</p>}

        <div className="sc-actions">
          {movement && canEdit && (
            <button
              type="button"
              className="sc-btn-danger"
              disabled={busy}
              onClick={() => window.confirm(`¿Borrar «${movement.concept}»? Quedará en el historial.`) && run(() => deleteMovement(client, movement.id))}
            >
              Borrar
            </button>
          )}
          <button type="button" className="sc-btn" onClick={onClose}>
            {canEdit ? 'Cancelar' : 'Cerrar'}
          </button>
          {canEdit && (
            <button type="submit" className="sc-btn-primary" disabled={busy}>
              {busy ? 'Guardando…' : movement ? 'Guardar cambios' : 'Crear'}
            </button>
          )}
        </div>
      </form>
    </Modal>
  )
}
