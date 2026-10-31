import { useState } from 'react'
import { Handshake, Pencil, Plus, Trash2 } from 'lucide-react'
import {
  ALLIANCE_STATUSES,
  ALLIANCE_TYPES,
  MAX_NOTE,
  STATUS_LABEL,
  TYPE_LABEL,
  allianceInput,
  allianceOf,
  amountLabel,
  dayLabel,
  formFromAlliance,
  isNextStepOverdue,
  notesNewestFirst,
  validateAllianceForm,
} from '../../lib/alliances'
import './Alliances.css'

function noteWhen(iso) {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  return d.toLocaleString('es-ES', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })
}

// El formulario del seguimiento (tipo, estado, acuerdo, importe, fechas, próximo paso y responsable).
function AllianceForm({ alliance, people, onSave, onCancel }) {
  const [form, setForm] = useState(() => formFromAlliance(alliance))
  const [tried, setTried] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)
  const errors = tried ? validateAllianceForm(form) : {}
  const set = (patch) => setForm((f) => ({ ...f, ...patch }))
  // El responsable aunque ya no esté en la lista.
  const options = [...people]
  if (alliance?.ownerId && !options.some((p) => p.id === alliance.ownerId)) options.push({ id: alliance.ownerId, name: alliance.ownerName || 'Responsable' })

  const submit = async (e) => {
    e.preventDefault()
    setTried(true)
    if (Object.keys(validateAllianceForm(form)).length > 0) return
    setBusy(true)
    setError(null)
    try {
      const owner = options.find((p) => p.id === form.ownerId)
      await onSave(allianceInput(form), owner?.name || '')
    } catch (err) {
      setError(err.message)
      setBusy(false)
    }
  }

  const field = (name, label, input) => (
    <label className={`al-field${errors[name] ? ' invalid' : ''}`}>
      <span>{label}</span>
      {input}
      {errors[name] && <span className="al-error">{errors[name]}</span>}
    </label>
  )

  return (
    <form className="al-form" onSubmit={submit} noValidate>
      <div className="al-row">
        {field(
          'type',
          'Tipo',
          <select value={form.type} onChange={(e) => set({ type: e.target.value })}>
            {ALLIANCE_TYPES.map((t) => (
              <option key={t.id} value={t.id}>
                {t.label}
              </option>
            ))}
          </select>,
        )}
        {field(
          'status',
          'Estado',
          <select value={form.status} onChange={(e) => set({ status: e.target.value })}>
            {ALLIANCE_STATUSES.map((s) => (
              <option key={s.id} value={s.id}>
                {s.label}
              </option>
            ))}
          </select>,
        )}
      </div>
      {field('offer', 'Qué ofrece o qué se acuerda', <textarea rows={3} value={form.offer} onChange={(e) => set({ offer: e.target.value })} />)}
      <div className="al-row">
        {field('amount', 'Importe aproximado (€, opcional)', <input type="text" inputMode="decimal" value={form.amount} onChange={(e) => set({ amount: e.target.value })} placeholder="1500" />)}
        {field('startDate', 'Inicio del acuerdo', <input type="date" value={form.startDate} onChange={(e) => set({ startDate: e.target.value })} />)}
        {field('endDate', 'Fin del acuerdo', <input type="date" value={form.endDate} onChange={(e) => set({ endDate: e.target.value })} />)}
      </div>
      <div className="al-row">
        {field('nextStep', 'Próximo paso', <input type="text" value={form.nextStep} onChange={(e) => set({ nextStep: e.target.value })} placeholder="Enviar el dossier" />)}
        {field('nextStepDate', 'Fecha del próximo paso', <input type="date" value={form.nextStepDate} onChange={(e) => set({ nextStepDate: e.target.value })} />)}
      </div>
      {field(
        'ownerId',
        'Responsable',
        <select value={form.ownerId} onChange={(e) => set({ ownerId: e.target.value })}>
          <option value="">Sin responsable</option>
          {options.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>,
      )}
      {error && <p className="al-error">{error}</p>}
      <div className="al-actions">
        <button type="button" className="contact-action-btn" onClick={onCancel} disabled={busy}>
          Cancelar
        </button>
        <button type="submit" className="contact-action-btn primary" disabled={busy}>
          {busy ? 'Guardando…' : 'Guardar seguimiento'}
        </button>
      </div>
    </form>
  )
}

/**
 * Seguimiento de alianza de un contacto externo, en su ficha. canEdit: Alianzas y yo (Directivo,
 * solo ver). api: { save(contactId, input, ownerName), addNote(contactId, text),
 * removeNote(contactId, noteId) } (pueden devolver promesas). people: responsables posibles.
 */
export default function AlliancePanel({ contact, canEdit, people = [], api, today }) {
  const alliance = allianceOf(contact)
  const [editing, setEditing] = useState(false)
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)

  const run = async (fn) => {
    setBusy(true)
    setError(null)
    try {
      await fn()
      return true
    } catch (err) {
      setError(err.message)
      return false
    } finally {
      setBusy(false)
    }
  }

  const addNote = async (e) => {
    e.preventDefault()
    if (await run(() => api.addNote(contact.id, note))) setNote('')
  }

  return (
    <section className="al-panel" aria-label="Seguimiento de alianza">
      <h3>
        <Handshake size={16} strokeWidth={1.75} />
        Alianza
        {canEdit && alliance && !editing && (
          <button type="button" className="contact-action-btn" onClick={() => setEditing(true)}>
            <Pencil size={13} strokeWidth={1.75} />
            Editar seguimiento
          </button>
        )}
      </h3>

      {editing ? (
        <AllianceForm
          alliance={alliance}
          people={people}
          onCancel={() => setEditing(false)}
          onSave={async (input, ownerName) => {
            await api.save(contact.id, input, ownerName)
            setEditing(false)
          }}
        />
      ) : !alliance ? (
        <div className="al-empty">
          <p className="al-muted">Sin seguimiento de alianza.</p>
          {canEdit && (
            <button type="button" className="contact-action-btn primary" onClick={() => setEditing(true)}>
              <Plus size={13} strokeWidth={1.75} />
              Añadir seguimiento
            </button>
          )}
        </div>
      ) : (
        <dl className="al-summary">
          <div>
            <dt>Tipo y estado</dt>
            <dd>
              <span className="al-badge">{TYPE_LABEL[alliance.type] || alliance.type}</span>
              <span className={`al-status ${alliance.status}`}>{STATUS_LABEL[alliance.status] || alliance.status}</span>
            </dd>
          </div>
          {alliance.offer && (
            <div>
              <dt>Qué ofrece o qué se acuerda</dt>
              <dd className="al-pre">{alliance.offer}</dd>
            </div>
          )}
          {(alliance.amount !== null && alliance.amount !== undefined) || alliance.startDate || alliance.endDate ? (
            <div>
              <dt>Acuerdo</dt>
              <dd>
                {[amountLabel(alliance.amount), alliance.startDate && `desde el ${dayLabel(alliance.startDate)}`, alliance.endDate && `hasta el ${dayLabel(alliance.endDate)}`]
                  .filter(Boolean)
                  .join(' · ')}
              </dd>
            </div>
          ) : null}
          <div>
            <dt>Próximo paso</dt>
            <dd className={isNextStepOverdue(alliance, today) ? 'al-late' : undefined}>
              {alliance.nextStep || (alliance.nextStepDate ? 'Sin describir' : 'Ninguno')}
              {alliance.nextStepDate && ` · ${dayLabel(alliance.nextStepDate)}`}
              {isNextStepOverdue(alliance, today) && ' (atrasado)'}
            </dd>
          </div>
          <div>
            <dt>Responsable</dt>
            <dd>{alliance.ownerName || 'Sin responsable'}</dd>
          </div>
        </dl>
      )}

      {(alliance || canEdit) && (
        <div className="al-notes">
          <h4>Historial</h4>
          {canEdit && (
            <form className="al-note-form" onSubmit={addNote}>
              <textarea
                rows={2}
                value={note}
                maxLength={MAX_NOTE}
                onChange={(e) => setNote(e.target.value)}
                placeholder="Llamada con…, Enviado dossier…"
                aria-label="Nueva nota"
              />
              <button type="submit" className="contact-action-btn" disabled={busy || !note.trim()}>
                Añadir nota
              </button>
            </form>
          )}
          {error && <p className="al-error">{error}</p>}
          {notesNewestFirst(alliance).length === 0 ? (
            <p className="al-muted">Todavía no hay notas.</p>
          ) : (
            <ul>
              {notesNewestFirst(alliance).map((n) => (
                <li key={n.id}>
                  <span className="al-note-meta">
                    {noteWhen(n.at)}
                    {n.by ? ` · ${n.by}` : ''}
                  </span>
                  <span className="al-pre">{n.text}</span>
                  {canEdit && (
                    <button
                      type="button"
                      className="al-note-remove"
                      aria-label="Quitar la nota"
                      title="Quitar la nota"
                      disabled={busy}
                      onClick={() => window.confirm('¿Quitar esta nota del historial?') && run(() => api.removeNote(contact.id, n.id))}
                    >
                      <Trash2 size={13} strokeWidth={1.75} />
                    </button>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </section>
  )
}
