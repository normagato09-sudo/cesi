import { useState } from 'react'
import { X, CalendarCheck, Clock, RotateCcw } from 'lucide-react'
import WeeklyScheduleEditor from './WeeklyScheduleEditor.jsx'
import { cleanWeek, validateWeek } from '../lib/weeklySchedule'
import { latestDeclaredWeek, weekRangeLabel } from '../lib/weeklyAvailability'
import './AvailabilityModal.css'
import './MyScheduleModal.css'

/**
 * "Mi horario": un solo horario semanal (varias franjas por día) que vale para todas las semanas.
 * Lo usan Buscar hueco, el enlace de reservas, el resumen y el informe.
 * Hasta que se guarda por primera vez (`saved` = false), parte de la última semana declarada (la
 * antigua "Disponibilidad de la semana"), si la hay. Con `onOpenBookingLink` (sincronización
 * configurada), acceso al "Enlace de reservas".
 */
export default function MyScheduleModal({ workingHours, weeklyAvailability, saved, onSave, onClose, onOpenBookingLink = null }) {
  const [latest] = useState(() => (saved ? null : latestDeclaredWeek(weeklyAvailability)))
  const [draft, setDraft] = useState(() => latest?.week || workingHours)
  const [dirty, setDirty] = useState(!!latest)
  const [error, setError] = useState(null)
  const [notice, setNotice] = useState(() =>
    latest ? `Parte de tu última semana declarada (${weekRangeLabel(latest.key)}). Guarda para que sea tu horario de todas las semanas.` : null,
  )
  const [usingSaved, setUsingSaved] = useState(!latest)

  const edit = (week) => {
    setDraft(week)
    setDirty(true)
    setError(null)
  }

  const loadSaved = () => {
    setDraft(workingHours)
    setUsingSaved(true)
    setNotice('Cargado tu horario guardado. Guarda para aplicarlo.')
    setError(null)
  }

  const handleSubmit = (e) => {
    e.preventDefault()
    const problem = validateWeek(draft)
    if (problem) {
      setError(problem)
      return
    }
    onSave(cleanWeek(draft))
    onClose()
  }

  const handleOpenBookingLink = () => {
    if (dirty && !window.confirm('Tienes cambios sin guardar en tu horario. ¿Descartarlos?')) return
    onClose()
    onOpenBookingLink()
  }

  return (
    <div className="availability-backdrop" onClick={onClose}>
      <form className="availability-modal" onClick={(e) => e.stopPropagation()} onSubmit={handleSubmit}>
        <div className="availability-header">
          <h2>
            <Clock size={17} strokeWidth={1.75} />
            Mi horario
          </h2>
          <button type="button" className="availability-close" onClick={onClose} aria-label="Cerrar">
            <X size={18} strokeWidth={1.75} />
          </button>
        </div>

        <div className="availability-scroll">
          <section className="availability-section">
            <p className="availability-hint">
              Tu horario de todas las semanas. "Buscar hueco", el enlace de reservas y las horas libres del resumen solo usan
              estas franjas; las franjas "No disponible", tus reuniones y las solicitudes de reserva quitan huecos.
            </p>
            {latest && !usingSaved && (
              <div className="my-schedule-actions">
                <button type="button" className="my-schedule-btn" onClick={loadSaved}>
                  <RotateCcw size={13} strokeWidth={1.75} />
                  Cargar mi horario guardado
                </button>
              </div>
            )}
            {notice && <p className="my-schedule-notice">{notice}</p>}
            <WeeklyScheduleEditor value={draft} onChange={edit} copyable />
            {onOpenBookingLink && (
              <div className="my-schedule-booking">
                <p className="availability-hint">Tu enlace de reservas ofrece los huecos libres de este horario.</p>
                <button type="button" className="my-schedule-btn" onClick={handleOpenBookingLink}>
                  <CalendarCheck size={13} strokeWidth={1.75} />
                  Enlace de reservas
                </button>
              </div>
            )}
          </section>

          {error && <div className="availability-error">{error}</div>}
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
