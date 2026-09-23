import { useState } from 'react'
import { format, addDays } from 'date-fns'
import { es } from 'date-fns/locale'
import { X, Search, CalendarClock } from 'lucide-react'
import { findFirstSlot, findBestSlot, findMultipleSlots } from '../lib/findSlots'
import { useScheduling } from '../lib/schedulingContext'
import './FindSlotModal.css'

function toDateInputValue(date) {
  return format(date, 'yyyy-MM-dd')
}

export default function FindSlotModal({ initialDurationMinutes, onPick, onClose }) {
  const { rawEvents, preferences } = useScheduling()
  const now = new Date()
  const [durationMinutes, setDurationMinutes] = useState(initialDurationMinutes || 60)
  const [fromDate, setFromDate] = useState(toDateInputValue(now))
  const [toDate, setToDate] = useState(toDateInputValue(addDays(now, 7)))
  const [minTime, setMinTime] = useState('09:00')
  const [maxTime, setMaxTime] = useState('20:00')
  const [results, setResults] = useState(null)
  const [searchError, setSearchError] = useState(null)

  const buildParams = () => ({
    durationMinutes,
    fromDate: new Date(`${fromDate}T00:00:00`),
    toDate: new Date(`${toDate}T00:00:00`),
    minTime,
    maxTime,
    events: rawEvents,
    bufferMinutes: preferences.bufferMinutes,
    now,
  })

  const runSearch = (mode) => {
    setSearchError(null)
    if (maxTime <= minTime) {
      setSearchError('La hora máxima debe ser posterior a la mínima.')
      setResults(null)
      return
    }
    const params = buildParams()
    let found
    if (mode === 'first') {
      const slot = findFirstSlot(params)
      found = slot ? [slot] : []
    } else if (mode === 'best') {
      const slot = findBestSlot(params)
      found = slot ? [slot] : []
    } else {
      found = findMultipleSlots(params, 5)
    }
    setResults({ mode, slots: found })
  }

  return (
    <div className="find-slot-backdrop" onClick={onClose}>
      <div className="find-slot-modal" onClick={(e) => e.stopPropagation()}>
        <div className="find-slot-header">
          <h2>
            <Search size={17} strokeWidth={1.75} />
            Buscar hueco
          </h2>
          <button type="button" className="find-slot-close" onClick={onClose} aria-label="Cerrar">
            <X size={18} strokeWidth={1.75} />
          </button>
        </div>

        <div className="find-slot-body">
          <label className="find-slot-field">
            <span>Duración necesaria</span>
            <select value={durationMinutes} onChange={(e) => setDurationMinutes(Number(e.target.value))}>
              <option value={30}>30 minutos</option>
              <option value={45}>45 minutos</option>
              <option value={60}>1 hora</option>
              <option value={90}>1 hora 30 minutos</option>
              <option value={120}>2 horas</option>
            </select>
          </label>

          <div className="find-slot-row">
            <label className="find-slot-field">
              <span>Desde</span>
              <input type="date" value={fromDate} onChange={(e) => setFromDate(e.target.value)} />
            </label>
            <label className="find-slot-field">
              <span>Hasta</span>
              <input type="date" value={toDate} min={fromDate} onChange={(e) => setToDate(e.target.value)} />
            </label>
          </div>

          <div className="find-slot-row">
            <label className="find-slot-field">
              <span>Horario mínimo</span>
              <input type="time" value={minTime} onChange={(e) => setMinTime(e.target.value)} />
            </label>
            <label className="find-slot-field">
              <span>Horario máximo</span>
              <input type="time" value={maxTime} onChange={(e) => setMaxTime(e.target.value)} />
            </label>
          </div>

          {searchError && <div className="find-slot-error">{searchError}</div>}

          <div className="find-slot-actions">
            <button type="button" className="find-slot-action-btn" onClick={() => runSearch('first')}>
              Primer hueco
            </button>
            <button type="button" className="find-slot-action-btn primary" onClick={() => runSearch('best')}>
              Mejor hueco
            </button>
            <button type="button" className="find-slot-action-btn" onClick={() => runSearch('multiple')}>
              Varios huecos
            </button>
          </div>

          {results && (
            <div className="find-slot-results">
              {results.slots.length === 0 ? (
                <p className="find-slot-empty">No he encontrado ningún hueco con esos criterios.</p>
              ) : (
                <ul>
                  {results.slots.map((slot) => (
                    <li key={slot.start.toISOString()}>
                      <button type="button" className="find-slot-result-btn" onClick={() => onPick(slot)}>
                        <CalendarClock size={15} strokeWidth={1.75} />
                        <span className="find-slot-result-text">
                          {format(slot.start, "EEEE d 'de' MMMM", { locale: es })}
                          {' · '}
                          {format(slot.start, 'HH:mm')}–{format(slot.end, 'HH:mm')}
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
