import { useEffect, useRef } from 'react'
import { WEEKDAY_DISPLAY_ORDER } from '../lib/weeklySchedule'
import { DAY_LETTERS, cellLabel, hourLabel, toggleHour } from '../lib/studentPortal'
import './AvailabilityGrid.css'

const HOURS = Array.from({ length: 24 }, (_, h) => h)

// Disponibilidad hora a hora: L–D × 24 filas (00:00–24:00), con la cabecera fija al desplazar.
// hours: { [día 0..6]: Set de horas }. onChange(actualizar) recibe una función (horas → horas);
// sin onChange es solo de lectura. Con el ratón se puede arrastrar para marcar varias seguidas;
// en el móvil se toca cada una (así la tabla se sigue pudiendo desplazar).
export default function AvailabilityGrid({ hours, onChange = null, invalid = false, describedBy }) {
  const dragging = useRef(null) // true: marcando, false: desmarcando, null: sin arrastrar
  const readOnly = !onChange

  useEffect(() => {
    const stop = () => {
      dragging.current = null
    }
    window.addEventListener('pointerup', stop)
    window.addEventListener('pointercancel', stop)
    return () => {
      window.removeEventListener('pointerup', stop)
      window.removeEventListener('pointercancel', stop)
    }
  }, [])

  const set = (day, hour, on) => onChange((current) => toggleHour(current, day, hour, on))

  return (
    <div className={`avail-grid-scroll${invalid ? ' invalid' : ''}`} aria-describedby={describedBy}>
      <table className={`avail-grid${readOnly ? ' read-only' : ''}`}>
        <thead>
          <tr>
            <th scope="col" className="avail-grid-corner">
              <span className="sr-only">Hora</span>
            </th>
            {WEEKDAY_DISPLAY_ORDER.map((day) => (
              <th key={day} scope="col">
                <span className="avail-grid-day">{DAY_LETTERS[day]}</span>
                <span className="avail-grid-total">{hours[day]?.size || 0} h</span>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {HOURS.map((hour) => (
            <tr key={hour}>
              <th scope="row">{hourLabel(hour)}</th>
              {WEEKDAY_DISPLAY_ORDER.map((day) => {
                const on = !!hours[day]?.has(hour)
                if (readOnly) {
                  return (
                    <td key={day}>
                      <span className={`avail-cell${on ? ' on' : ''}`} role="img" aria-label={`${cellLabel(day, hour)}: ${on ? 'disponible' : 'no disponible'}`} />
                    </td>
                  )
                }
                return (
                  <td key={day}>
                    <button
                      type="button"
                      className={`avail-cell${on ? ' on' : ''}`}
                      aria-label={cellLabel(day, hour)}
                      aria-pressed={on}
                      onPointerDown={(e) => {
                        if (e.button !== 0) return
                        set(day, hour, !on)
                        if (e.pointerType === 'mouse') {
                          dragging.current = !on
                          e.preventDefault()
                        }
                      }}
                      onPointerEnter={() => {
                        if (dragging.current !== null) set(day, hour, dragging.current)
                      }}
                      onClick={(e) => {
                        // Con el teclado (Enter o espacio) no hay pointerdown.
                        if (e.detail === 0) set(day, hour, !on)
                      }}
                    />
                  </td>
                )
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
