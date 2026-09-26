import { Search, TriangleAlert } from 'lucide-react'
import { hasUnavailableWarning, warningTitle } from '../lib/meetingWarnings'
import './EventFormModal.css'

// Aviso que no bloquea al guardar una reunión, igual en el formulario y al mover o redimensionar:
// título, lista de avisos y "Buscar otro hueco" (si hay participantes que no pueden) o "Revisar",
// y "Guardar igualmente".
export default function MeetingWarning({ violations, onFind, onReview, onSave, saving = false, titleId, autoFocusSave = false }) {
  return (
    <div className="event-form-warning" role="alert">
      <p className="event-form-warning-title" id={titleId}>
        <TriangleAlert size={15} strokeWidth={1.75} />
        {warningTitle(violations)}
      </p>
      <ul>
        {violations.map((v, i) => (
          <li key={i}>{v.message}</li>
        ))}
      </ul>
      <div className="event-form-warning-actions">
        {hasUnavailableWarning(violations) ? (
          <button type="button" className="event-form-cancel" onClick={onFind}>
            <Search size={13} strokeWidth={1.75} /> Buscar otro hueco
          </button>
        ) : (
          <button type="button" className="event-form-cancel" onClick={onReview}>
            Revisar
          </button>
        )}
        <button type="button" className="event-form-submit" onClick={onSave} disabled={saving} autoFocus={autoFocusSave}>
          Guardar igualmente
        </button>
      </div>
    </div>
  )
}
