import { CalendarRange } from 'lucide-react'
import { weekRangeLabel } from '../lib/weeklyAvailability'
import './WeeklyAvailabilityPanel.css'

// Aviso de la barra lateral: desde el domingo, declarar la disponibilidad de la semana que viene
// (y, si sigue sin declarar, la de la semana en curso).
export default function WeeklyAvailabilityPanel({ pending, onDeclare, onDismiss }) {
  if (!pending) return null
  const title = pending.next ? 'Declara tu disponibilidad de la semana que viene' : 'Declara tu disponibilidad de esta semana'

  return (
    <section className="week-notice" aria-label="Disponibilidad de la semana">
      <p className="week-notice-text">
        <CalendarRange size={14} strokeWidth={1.75} />
        <span>
          <strong>{title}</strong>
          <span className="week-notice-range">{weekRangeLabel(pending.key)}</span>
        </span>
      </p>
      <div className="week-notice-actions">
        <button type="button" className="week-notice-btn primary" onClick={() => onDeclare(pending.key)}>
          Declarar
        </button>
        <button type="button" className="week-notice-btn" onClick={() => onDismiss(pending.key)}>
          Usar mi horario habitual
        </button>
      </div>
    </section>
  )
}
