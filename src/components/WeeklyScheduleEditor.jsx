import { useState } from 'react'
import { Copy, Plus, X } from 'lucide-react'
import { WEEKDAY_DISPLAY_ORDER, WEEKDAY_LABELS, copyDay, minutesToTime, timeToMinutes } from '../lib/weeklySchedule'
import './WeeklyScheduleEditor.css'

const DEFAULT_SLOT = { start: '09:00', end: '18:00' }
const LAST_START = 23 * 60 + 30

function nextSlotAfter(slots) {
  if (slots.length === 0) return DEFAULT_SLOT
  const lastEnd = timeToMinutes(slots[slots.length - 1].end)
  const start = Math.min(lastEnd + 60, LAST_START)
  return { start: minutesToTime(start), end: minutesToTime(Math.min(start + 120, 23 * 60 + 59)) }
}

const WORKDAYS = [1, 2, 3, 4, 5]

// Editor de horario semanal con varias franjas por día (mi horario y la disponibilidad de contactos).
// Con `copyable`, cada día activo tiene "Copiar a…" para llevar sus franjas a otros días.
export default function WeeklyScheduleEditor({ value, onChange, copyable = false }) {
  const [copying, setCopying] = useState(null) // { from: día, to: [días] }
  const updateDay = (day, updater) => onChange(value.map((entry) => (entry.day === day ? updater(entry) : entry)))

  const toggleTarget = (day) =>
    setCopying((c) => ({ ...c, to: c.to.includes(day) ? c.to.filter((d) => d !== day) : [...c.to, day] }))

  const applyCopy = () => {
    onChange(copyDay(value, copying.from, copying.to))
    setCopying(null)
  }

  const toggleDay = (day, enabled) =>
    updateDay(day, (entry) => ({
      ...entry,
      enabled,
      slots: enabled && entry.slots.length === 0 ? [DEFAULT_SLOT] : entry.slots,
    }))

  const updateSlot = (day, index, patch) =>
    updateDay(day, (entry) => ({ ...entry, slots: entry.slots.map((s, i) => (i === index ? { ...s, ...patch } : s)) }))

  const removeSlot = (day, index) =>
    updateDay(day, (entry) => {
      const slots = entry.slots.filter((_, i) => i !== index)
      return { ...entry, slots, enabled: slots.length > 0 && entry.enabled }
    })

  const addSlot = (day) => updateDay(day, (entry) => ({ ...entry, enabled: true, slots: [...entry.slots, nextSlotAfter(entry.slots)] }))

  return (
    <div className="weekly-editor">
      {WEEKDAY_DISPLAY_ORDER.map((day) => {
        const entry = value.find((e) => e.day === day)
        return (
          <div key={day} className={`weekly-editor-row${entry.enabled ? '' : ' off'}`}>
            <label className="weekly-editor-day">
              <input type="checkbox" checked={entry.enabled} onChange={(e) => toggleDay(day, e.target.checked)} />
              <span>{WEEKDAY_LABELS[day]}</span>
            </label>

            <div className="weekly-editor-slots">
              {!entry.enabled && <span className="weekly-editor-off-label">No disponible</span>}
              {entry.enabled &&
                entry.slots.map((slot, index) => (
                  <div key={index} className="weekly-editor-slot">
                    <input
                      type="time"
                      value={slot.start}
                      aria-label={`${WEEKDAY_LABELS[day]}: inicio de la franja ${index + 1}`}
                      onChange={(e) => updateSlot(day, index, { start: e.target.value })}
                    />
                    <span className="weekly-editor-sep">–</span>
                    <input
                      type="time"
                      value={slot.end}
                      aria-label={`${WEEKDAY_LABELS[day]}: fin de la franja ${index + 1}`}
                      onChange={(e) => updateSlot(day, index, { end: e.target.value })}
                    />
                    <button
                      type="button"
                      className="weekly-editor-icon-btn"
                      onClick={() => removeSlot(day, index)}
                      aria-label={`Quitar la franja ${slot.start}–${slot.end} del ${WEEKDAY_LABELS[day].toLowerCase()}`}
                      title="Quitar franja"
                    >
                      <X size={14} strokeWidth={1.75} />
                    </button>
                  </div>
                ))}
              {entry.enabled && (
                <div className="weekly-editor-row-actions">
                  <button type="button" className="weekly-editor-add" onClick={() => addSlot(day)}>
                    <Plus size={13} strokeWidth={2} />
                    Añadir franja
                  </button>
                  {copyable && copying?.from !== day && (
                    <button type="button" className="weekly-editor-add" onClick={() => setCopying({ from: day, to: [] })}>
                      <Copy size={13} strokeWidth={1.75} />
                      Copiar a…
                    </button>
                  )}
                </div>
              )}
              {copyable && copying?.from === day && (
                <div className="weekly-editor-copy" role="group" aria-label={`Copiar el ${WEEKDAY_LABELS[day].toLowerCase()} a otros días`}>
                  <div className="weekly-editor-copy-days">
                    {WEEKDAY_DISPLAY_ORDER.filter((d) => d !== day).map((d) => (
                      <label key={d} className={`weekly-editor-copy-day${copying.to.includes(d) ? ' active' : ''}`}>
                        <input type="checkbox" checked={copying.to.includes(d)} onChange={() => toggleTarget(d)} />
                        {WEEKDAY_LABELS[d].slice(0, 3)}
                      </label>
                    ))}
                  </div>
                  <div className="weekly-editor-copy-actions">
                    <button
                      type="button"
                      className="weekly-editor-add"
                      onClick={() => setCopying((c) => ({ ...c, to: WORKDAYS.filter((d) => d !== day) }))}
                    >
                      De lunes a viernes
                    </button>
                    <button type="button" className="weekly-editor-add" onClick={() => setCopying((c) => ({ ...c, to: WEEKDAY_DISPLAY_ORDER.filter((d) => d !== day) }))}>
                      Todos
                    </button>
                    <span className="weekly-editor-copy-spacer" />
                    <button type="button" className="weekly-editor-copy-cancel" onClick={() => setCopying(null)}>
                      Cancelar
                    </button>
                    <button type="button" className="weekly-editor-copy-apply" onClick={applyCopy} disabled={copying.to.length === 0}>
                      Copiar
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        )
      })}
    </div>
  )
}
