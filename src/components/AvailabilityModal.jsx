import { useState } from 'react'
import { X, Clock3 } from 'lucide-react'
import WeeklyScheduleEditor from './WeeklyScheduleEditor.jsx'
import { cleanWeek, validateWeek } from '../lib/weeklySchedule'
import './AvailabilityModal.css'

export default function AvailabilityModal({ workingHours, onSave, onClose }) {
  const [hours, setHours] = useState(workingHours)
  const [error, setError] = useState(null)

  const handleSubmit = (e) => {
    e.preventDefault()
    const problem = validateWeek(hours)
    if (problem) {
      setError(problem)
      return
    }
    onSave(cleanWeek(hours))
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
          Puedes poner varias franjas por día (por ejemplo, 09:00–14:00 y 16:00–19:00). "Buscar hueco" solo
          propone huecos dentro de estas franjas.
        </p>

        <div className="availability-body">
          <WeeklyScheduleEditor value={hours} onChange={setHours} />
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
