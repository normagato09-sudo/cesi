import { useState } from 'react'
import { addWeeks, format } from 'date-fns'
import { X, CalendarRange, ChevronLeft, ChevronRight, Copy, RotateCcw } from 'lucide-react'
import WeeklyScheduleEditor from './WeeklyScheduleEditor.jsx'
import { cleanWeek, validateWeek } from '../lib/weeklySchedule'
import {
  declaredWeekFor,
  isWeekDeclared,
  previousWeekSchedule,
  weekKeyOf,
  weekRangeLabel,
  weekStartFromKey,
} from '../lib/weeklyAvailability'
import './AvailabilityModal.css'
import './WeeklyAvailabilityModal.css'

function shiftKey(key, weeks) {
  return format(addWeeks(weekStartFromKey(key), weeks), 'yyyy-MM-dd')
}

// "Disponibilidad de la semana": declarar el horario concreto de una semana (lunes a domingo).
// Si la semana no está declarada, el editor parte del horario habitual.
export default function WeeklyAvailabilityModal({ initialKey, workingHours, weeks, onSave, onRevert, onClose }) {
  const [key, setKey] = useState(initialKey)
  const draftFor = (k) => declaredWeekFor(weekStartFromKey(k), weeks) || workingHours
  const [draft, setDraft] = useState(() => draftFor(initialKey))
  const [dirty, setDirty] = useState(false)
  const [error, setError] = useState(null)
  const [notice, setNotice] = useState(null)

  const declared = isWeekDeclared(key, weeks)
  const isCurrent = key === weekKeyOf(new Date())

  const edit = (week, message = null) => {
    setDraft(week)
    setDirty(true)
    setError(null)
    setNotice(message)
  }

  const goTo = (offset) => {
    if (dirty && !window.confirm('Tienes cambios sin guardar en esta semana. ¿Descartarlos?')) return
    const next = shiftKey(key, offset)
    setKey(next)
    setDraft(draftFor(next))
    setDirty(false)
    setError(null)
    setNotice(null)
  }

  const handleSubmit = (e) => {
    e.preventDefault()
    const problem = validateWeek(draft)
    if (problem) {
      setError(problem)
      return
    }
    onSave(key, cleanWeek(draft))
    onClose()
  }

  const handleRevert = () => {
    onRevert(key)
    onClose()
  }

  return (
    <div className="availability-backdrop" onClick={onClose}>
      <form className="availability-modal week-modal" onClick={(e) => e.stopPropagation()} onSubmit={handleSubmit}>
        <div className="availability-header">
          <h2>
            <CalendarRange size={17} strokeWidth={1.75} />
            Disponibilidad de la semana
          </h2>
          <button type="button" className="availability-close" onClick={onClose} aria-label="Cerrar">
            <X size={18} strokeWidth={1.75} />
          </button>
        </div>

        <div className="week-modal-nav">
          <button type="button" className="week-modal-arrow" onClick={() => goTo(-1)} aria-label="Semana anterior">
            <ChevronLeft size={17} strokeWidth={1.75} />
          </button>
          <div className="week-modal-range">
            <strong>{weekRangeLabel(key)}</strong>
            <span className={`week-modal-status${declared ? ' declared' : ''}`}>
              {isCurrent ? 'Esta semana · ' : ''}
              {declared ? 'Disponibilidad declarada' : 'Usa tu horario habitual'}
            </span>
          </div>
          <button type="button" className="week-modal-arrow" onClick={() => goTo(1)} aria-label="Semana siguiente">
            <ChevronRight size={17} strokeWidth={1.75} />
          </button>
        </div>

        <div className="availability-scroll">
          <section className="availability-section">
            <p className="availability-hint">
              Lo que declares sustituye a tu horario habitual solo estos 7 días: "Buscar hueco", las propuestas y el
              resumen usarán estas franjas.
            </p>
            <div className="week-modal-copy">
              <button type="button" className="week-modal-copy-btn" onClick={() => edit(workingHours, 'Copiado tu horario habitual.')}>
                <Copy size={13} strokeWidth={1.75} />
                Copiar mi horario habitual
              </button>
              <button
                type="button"
                className="week-modal-copy-btn"
                onClick={() => edit(previousWeekSchedule(key, workingHours, weeks), 'Copiada la semana anterior.')}
              >
                <Copy size={13} strokeWidth={1.75} />
                Copiar la semana anterior
              </button>
            </div>
            {notice && <p className="week-modal-notice">{notice} Guarda para aplicarlo.</p>}
            <WeeklyScheduleEditor value={draft} onChange={(week) => edit(week)} />
          </section>

          {error && <div className="availability-error">{error}</div>}
        </div>

        <div className="availability-footer week-modal-footer">
          {declared && (
            <button type="button" className="week-modal-revert" onClick={handleRevert}>
              <RotateCcw size={14} strokeWidth={1.75} />
              Volver al horario habitual
            </button>
          )}
          <button type="button" className="availability-cancel" onClick={onClose}>
            Cancelar
          </button>
          <button type="submit" className="availability-submit">
            {declared ? 'Guardar' : 'Declarar semana'}
          </button>
        </div>
      </form>
    </div>
  )
}
