import { useState } from 'react'
import { X, Clock3 } from 'lucide-react'
import { WEEKDAY_LABELS } from '../lib/availability'
import './AvailabilityModal.css'

const DISPLAY_ORDER = [1, 2, 3, 4, 5, 6, 0] // lunes..domingo, igual que el resto del calendario

export default function AvailabilityModal({ workingHours, onSave, onClose }) {
  const [hours, setHours] = useState(workingHours)
  const orderedHours = DISPLAY_ORDER.map((day) => hours.find((h) => h.day === day))

  const updateDay = (day, patch) => {
    setHours((prev) => prev.map((d) => (d.day === day ? { ...d, ...patch } : d)))
  }

  const handleSubmit = (e) => {
    e.preventDefault()
    onSave(hours)
    onClose()
  }

  return (
    <div className="availability-backdrop" onClick={onClose}>
      <form className="availability-modal" onClick={(e) => e.stopPropagation()} onSubmit={handleSubmit}>
        <div className="availability-header">
          <h2>
            <Clock3 size={17} strokeWidth={1.75} />
            Horario habitual
          </h2>
          <button type="button" className="availability-close" onClick={onClose} aria-label="Cerrar">
            <X size={18} strokeWidth={1.75} />
          </button>
        </div>

        <p className="availability-hint">
          Se usa como preferencia para "Buscar hueco": no bloquea tu calendario, solo prioriza los huecos dentro
          de tu horario habitual.
        </p>

        <div className="availability-body">
          {orderedHours.map((entry) => (
            <div key={entry.day} className="availability-row">
              <label className="availability-day-toggle">
                <input
                  type="checkbox"
                  checked={entry.enabled}
                  onChange={(e) => updateDay(entry.day, { enabled: e.target.checked })}
                />
                <span>{WEEKDAY_LABELS[entry.day]}</span>
              </label>
              <input
                type="time"
                value={entry.start}
                disabled={!entry.enabled}
                onChange={(e) => updateDay(entry.day, { start: e.target.value })}
              />
              <span className="availability-sep">–</span>
              <input
                type="time"
                value={entry.end}
                disabled={!entry.enabled}
                onChange={(e) => updateDay(entry.day, { end: e.target.value })}
              />
            </div>
          ))}
        </div>

        <div className="availability-footer">
          <button type="button" className="availability-cancel" onClick={onClose}>
            Cancelar
          </button>
          <button type="submit" className="availability-submit">
            Guardar
          </button>
        </div>
      </form>
    </div>
  )
}
