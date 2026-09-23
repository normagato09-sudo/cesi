import { useState } from 'react'
import TimeZoneSelect from './TimeZoneSelect.jsx'
import { validateContactCountry } from '../lib/contacts'
import { defaultContactZone } from '../lib/timezones'
import './ContactCountryStep.css'

// Paso corto para pedir el país antes de crear un contacto rápido (España preseleccionado).
// Se muestra en línea, sin cerrar el formulario o el modal donde está.
export default function ContactCountryStep({ name, confirmLabel = 'Crear contacto', onCancel, onConfirm }) {
  const [zone, setZone] = useState(defaultContactZone)
  const [error, setError] = useState(null)

  const handleConfirm = () => {
    const problem = validateContactCountry(zone || {})
    if (problem) {
      setError(problem)
      return
    }
    onConfirm(zone)
  }

  return (
    <div
      className="contact-country-step"
      onKeyDown={(e) => {
        if (e.key === 'Escape') {
          e.stopPropagation()
          onCancel()
        }
      }}
    >
      <p className="contact-country-step-title">
        Nuevo contacto: <strong>{name}</strong>
      </p>
      <TimeZoneSelect label="País" value={zone} onChange={setZone} requireZoneChoice />
      {error && <p className="contact-country-step-error">{error}</p>}
      <div className="contact-country-step-actions">
        <button type="button" className="contact-country-step-btn" onClick={onCancel}>
          Cancelar
        </button>
        <button type="button" className="contact-country-step-btn primary" onClick={handleConfirm}>
          {confirmLabel}
        </button>
      </div>
    </div>
  )
}
