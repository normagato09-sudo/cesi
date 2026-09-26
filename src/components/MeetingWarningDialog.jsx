import MeetingWarning from './MeetingWarning.jsx'
import './EventFormModal.css'
import './RecurrenceScopeDialog.css'

// Aviso al mover o redimensionar una reunión (el mismo que el del formulario):
// onChoose('save') guardar igualmente, onChoose('find') buscar otro hueco, onChoose(null) no mover.
export default function MeetingWarningDialog({ violations, onChoose }) {
  return (
    <div className="event-form-backdrop scope-dialog-backdrop" onClick={() => onChoose(null)}>
      <div className="event-form meeting-warning-dialog" role="alertdialog" aria-modal="true" aria-labelledby="meeting-warning-title" onClick={(e) => e.stopPropagation()}>
        <div className="event-form-body">
          <MeetingWarning
            violations={violations}
            titleId="meeting-warning-title"
            onFind={() => onChoose('find')}
            onReview={() => onChoose(null)}
            onSave={() => onChoose('save')}
            autoFocusSave
          />
        </div>
      </div>
    </div>
  )
}
