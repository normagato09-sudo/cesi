import { CalendarDays, CalendarRange, Repeat, X } from 'lucide-react'
import { SCOPES } from '../lib/seriesEdits'
import './InitialSyncDialog.css'
import './RecurrenceScopeDialog.css'

const CHOICES = [
  { scope: SCOPES.THIS, Icon: CalendarDays, title: 'Solo este día', text: 'El resto de la serie no cambia.' },
  { scope: SCOPES.FOLLOWING, Icon: CalendarRange, title: 'Este y los siguientes', text: 'Los días anteriores no cambian.' },
  { scope: SCOPES.ALL, Icon: Repeat, title: 'Toda la serie', text: 'Todos los días de la reunión.' },
]

const HEADINGS = {
  edit: 'Editar una reunión que se repite',
  move: 'Mover una reunión que se repite',
  delete: 'Eliminar una reunión que se repite',
}

// Pregunta a qué días de una serie se aplica un cambio. onChoose(scope) o onCancel().
export default function RecurrenceScopeDialog({ action = 'edit', title, onChoose, onCancel }) {
  return (
    <div className="event-form-backdrop scope-dialog-backdrop" onClick={onCancel}>
      <div
        className="event-form initial-sync"
        role="dialog"
        aria-modal="true"
        aria-labelledby="scope-dialog-title"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="event-form-header">
          <h2 id="scope-dialog-title">
            <Repeat size={17} strokeWidth={1.75} />
            {HEADINGS[action] || HEADINGS.edit}
          </h2>
          <button type="button" className="event-form-close" onClick={onCancel} aria-label="Cancelar">
            <X size={18} strokeWidth={1.75} />
          </button>
        </div>
        <div className="event-form-body">
          {title && <p className="initial-sync-text">«{title}»</p>}
          <ul className="initial-sync-choices">
            {CHOICES.map(({ scope, Icon, title: label, text }) => (
              <li key={scope}>
                <button
                  type="button"
                  className={`initial-sync-choice ${action === 'delete' ? 'scope-dialog-danger' : ''}`}
                  onClick={() => onChoose(scope)}
                  autoFocus={scope === SCOPES.THIS}
                >
                  <Icon size={18} strokeWidth={1.75} />
                  <span>
                    <strong>{label}</strong>
                    <span>{text}</span>
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </div>
        <div className="event-form-footer">
          <button type="button" className="event-form-cancel" onClick={onCancel}>
            Cancelar
          </button>
        </div>
      </div>
    </div>
  )
}
