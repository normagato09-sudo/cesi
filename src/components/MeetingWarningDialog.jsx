import { Search, TriangleAlert } from 'lucide-react'
import { hasUnavailableWarning, warningTitle } from '../lib/meetingWarnings'
import './EventFormModal.css'
import './RecurrenceScopeDialog.css'

// Aviso al mover o redimensionar una reunión (el mismo que el del formulario):
// onChoose('save') guardar igualmente, onChoose('find') buscar otro hueco, onChoose(null) cancelar.
export default function MeetingWarningDialog({ violations, onChoose }) {
  return (
    <div className="event-form-backdrop scope-dialog-backdrop" onClick={() => onChoose(null)}>
      <div className="event-form meeting-warning-dialog" role="alertdialog" aria-modal="true" aria-labelledby="meeting-warning-title" onClick={(e) => e.stopPropagation()}>
        <div className="event-form-body">
          <div className="event-form-warning">
            <p className="event-form-warning-title" id="meeting-warning-title">
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
                <button type="button" className="event-form-cancel" onClick={() => onChoose('find')}>
                  <Search size={13} strokeWidth={1.75} /> Buscar otro hueco
                </button>
              ) : (
                <button type="button" className="event-form-cancel" onClick={() => onChoose(null)}>
                  Cancelar
                </button>
              )}
              <button type="button" className="event-form-submit" onClick={() => onChoose('save')} autoFocus>
                Guardar igualmente
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
