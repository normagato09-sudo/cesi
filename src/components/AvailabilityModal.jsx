import { useState } from 'react'
import { X, Clock3 } from 'lucide-react'
import WeeklyScheduleEditor from './WeeklyScheduleEditor.jsx'
import { cleanWeek, validateWeek } from '../lib/weeklySchedule'
import { BUFFER_OPTIONS } from '../lib/preferences'
import './AvailabilityModal.css'

function bufferLabel(minutes) {
  return minutes === 0 ? 'Sin margen' : `${minutes} minutos`
}

// "Horario y preferencias": horario habitual con varias franjas y margen entre reuniones.
export default function AvailabilityModal({ workingHours, preferences, onSave, onClose }) {
  const [hours, setHours] = useState(workingHours)
  const [bufferMinutes, setBufferMinutes] = useState(preferences.bufferMinutes)
  const [error, setError] = useState(null)

  const handleSubmit = (e) => {
    e.preventDefault()
    const problem = validateWeek(hours)
    if (problem) {
      setError(problem)
      return
    }
    onSave({ workingHours: cleanWeek(hours), preferences: { ...preferences, bufferMinutes } })
    onClose()
  }

  return (
    <div className="availability-backdrop" onClick={onClose}>
      <form className="availability-modal" onClick={(e) => e.stopPropagation()} onSubmit={handleSubmit}>
        <div className="availability-header">
          <h2>
            <Clock3 size={17} strokeWidth={1.75} />
            Horario y preferencias
          </h2>
          <button type="button" className="availability-close" onClick={onClose} aria-label="Cerrar">
            <X size={18} strokeWidth={1.75} />
          </button>
        </div>

        <div className="availability-scroll">
          <section className="availability-section">
            <h3>Horario habitual</h3>
            <p className="availability-hint">
              Puedes poner varias franjas por día (por ejemplo, 09:00–14:00 y 16:00–19:00). "Buscar hueco" solo
              propone huecos dentro de estas franjas.
            </p>
            <WeeklyScheduleEditor value={hours} onChange={setHours} />
          </section>

          <section className="availability-section">
            <h3>Margen entre reuniones</h3>
            <p className="availability-hint">
              Tiempo libre que "Buscar hueco" deja antes y después de cada reunión o bloque ocupado.
            </p>
            <select
              className="availability-select"
              value={bufferMinutes}
              onChange={(e) => setBufferMinutes(Number(e.target.value))}
              aria-label="Margen entre reuniones"
            >
              {BUFFER_OPTIONS.map((m) => (
                <option key={m} value={m}>
                  {bufferLabel(m)}
                </option>
              ))}
            </select>
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
