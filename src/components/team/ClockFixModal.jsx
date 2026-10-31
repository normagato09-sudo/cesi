import { useState } from 'react'
import Modal from '../shared/Modal.jsx'
import { dayLabel, hhmmOf, instantOf, keyOf } from '../../lib/sharedCalendar'
import { errorText, fixClockEntry } from '../../lib/teamWork'

function localValue(date, zone) {
  return `${keyOf(date, zone)}T${hhmmOf(date, zone)}`
}

function fromLocal(value, zone) {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(value || '')) return null
  const [date, time] = value.split('T')
  return instantOf(date, time, zone).date
}

// Corregir un fichaje (salida olvidada o mal puesta), con nota obligatoria. Directivo y la ceo
// también pueden cambiar la entrada. Horas en la zona de quien corrige.
export default function ClockFixModal({ client, entry, zone, boss, onClose, onSaved }) {
  const start = new Date(entry.clock_in)
  const [form, setForm] = useState(() => ({
    clockIn: localValue(start, zone),
    clockOut: localValue(entry.clock_out ? new Date(entry.clock_out) : new Date(Math.min(Date.now(), start.getTime() + 3600000)), zone),
    summary: entry.summary || '',
    note: '',
  }))
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)
  const set = (patch) => setForm((f) => ({ ...f, ...patch }))

  const handleSubmit = async (e) => {
    e.preventDefault()
    const inAt = boss ? fromLocal(form.clockIn, zone) : null
    const outAt = fromLocal(form.clockOut, zone)
    if ((boss && !inAt) || !outAt) return setError('Pon la fecha y la hora.')
    if (!form.summary.trim()) return setError('Escribe qué se hizo.')
    if (!form.note.trim()) return setError('Escribe una nota con la corrección.')
    setBusy(true)
    setError(null)
    try {
      await fixClockEntry(client, entry.id, { clockIn: inAt, clockOut: outAt, summary: form.summary, note: form.note })
      onSaved()
    } catch (err) {
      setError(errorText(err))
      setBusy(false)
    }
  }

  return (
    <Modal title="Corregir fichaje" onClose={onClose}>
      <form className="sc-form" onSubmit={handleSubmit} noValidate>
        <p className="sc-zone">
          {entry.name ? `${entry.name} · ` : ''}Entrada: {dayLabel(keyOf(start, zone))} a las {hhmmOf(start, zone)}
        </p>
        <div className="sc-row">
          {boss && (
            <label className="sc-field">
              <span>Entrada</span>
              <input type="datetime-local" value={form.clockIn} onChange={(e) => set({ clockIn: e.target.value })} />
            </label>
          )}
          <label className="sc-field">
            <span>Salida</span>
            <input type="datetime-local" value={form.clockOut} onChange={(e) => set({ clockOut: e.target.value })} />
          </label>
        </div>
        <label className="sc-field">
          <span>¿Qué se hizo?</span>
          <textarea value={form.summary} maxLength={2000} onChange={(e) => set({ summary: e.target.value })} />
        </label>
        <label className="sc-field">
          <span>Nota de la corrección</span>
          <input type="text" value={form.note} maxLength={1000} placeholder="Por ejemplo: olvidé fichar la salida" onChange={(e) => set({ note: e.target.value })} />
        </label>
        {error && <p className="sc-message error">{error}</p>}
        <div className="sc-actions">
          <button type="button" className="sc-btn" onClick={onClose}>
            Cancelar
          </button>
          <button type="submit" className="sc-btn-primary" disabled={busy}>
            {busy ? 'Guardando…' : 'Guardar corrección'}
          </button>
        </div>
      </form>
    </Modal>
  )
}
