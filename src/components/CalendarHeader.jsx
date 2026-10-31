import { ChevronLeft, ChevronRight, CalendarPlus } from 'lucide-react'
import './CalendarHeader.css'

const VIEWS = [
  { key: 'month', label: 'Mes' },
  { key: 'week', label: 'Semana' },
  { key: 'day', label: 'Día' },
]

// Cabecera del calendario (el mismo para la ceo, el equipo y los alumnos): hoy, anterior y
// siguiente, «Nueva reunión» (sin onNewMeeting no sale) y Mes / Semana / Día.
export default function CalendarHeader({ label, view, onViewChange, onPrev, onNext, onToday, onNewMeeting = null, note = null }) {
  return (
    <header className="calendar-header">
      <div className="calendar-header-left">
        <button type="button" className="header-btn today-btn" onClick={onToday}>
          Hoy
        </button>
        <div className="header-nav-group">
          <button type="button" className="header-icon-btn" onClick={onPrev} aria-label="Anterior">
            <ChevronLeft size={17} strokeWidth={1.75} />
          </button>
          <button type="button" className="header-icon-btn" onClick={onNext} aria-label="Siguiente">
            <ChevronRight size={17} strokeWidth={1.75} />
          </button>
        </div>
        <h1 className="calendar-header-label">{label}</h1>
        {note && <span className="calendar-header-note">{note}</span>}
      </div>

      <div className="calendar-header-right">
        {onNewMeeting && (
          <div className="header-actions">
            <button type="button" className="header-action-btn primary" onClick={onNewMeeting} aria-label="Nueva reunión" title="Nueva reunión">
              <CalendarPlus size={15} strokeWidth={1.75} />
              <span className="header-action-label">Nueva reunión</span>
            </button>
          </div>
        )}

        <div className="view-switch">
          {VIEWS.map((v) => (
            <button
              key={v.key}
              type="button"
              className={`view-switch-btn ${view === v.key ? 'active' : ''}`}
              onClick={() => onViewChange(v.key)}
            >
              {v.label}
            </button>
          ))}
        </div>
      </div>
    </header>
  )
}
