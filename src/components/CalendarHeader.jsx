import { ChevronLeft, ChevronRight, CalendarPlus, Search, Clock3, CalendarRange } from 'lucide-react'
import { CalendarFilterBar, CalendarFilterButton } from './CalendarFilter.jsx'
import { EMPTY_FILTER } from '../lib/calendarFilter'
import './CalendarHeader.css'

const VIEWS = [
  { key: 'month', label: 'Mes' },
  { key: 'week', label: 'Semana' },
  { key: 'day', label: 'Día' },
]

export default function CalendarHeader({
  label,
  view,
  onViewChange,
  onPrev,
  onNext,
  onToday,
  onNewMeeting,
  onFindSlot,
  onOpenAvailability,
  onOpenWeekAvailability,
  filter = EMPTY_FILTER,
  onFilterChange,
  rawEvents = [],
  projects = [],
  onManageProjects,
}) {
  return (
    <>
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
        </div>

        <div className="calendar-header-right">
          <div className="header-actions">
            <button
              type="button"
              className="header-action-btn primary"
              onClick={onNewMeeting}
              aria-label="Nueva reunión"
              title="Nueva reunión"
            >
              <CalendarPlus size={15} strokeWidth={1.75} />
              <span className="header-action-label">Nueva reunión</span>
            </button>
            <button
              type="button"
              className="header-action-btn"
              onClick={onFindSlot}
              aria-label="Buscar hueco"
              title="Buscar hueco"
            >
              <Search size={15} strokeWidth={1.75} />
              <span className="header-action-label">Buscar hueco</span>
            </button>
            <CalendarFilterButton
              filter={filter}
              onChange={onFilterChange}
              rawEvents={rawEvents}
              projects={projects}
              onManageProjects={onManageProjects}
            />
          </div>

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

          <button
            type="button"
            className="header-icon-btn"
            onClick={onOpenWeekAvailability}
            aria-label="Disponibilidad de la semana"
            title="Disponibilidad de la semana"
          >
            <CalendarRange size={16} strokeWidth={1.75} />
          </button>
          <button
            type="button"
            className="header-icon-btn"
            onClick={onOpenAvailability}
            aria-label="Horario y preferencias"
            title="Horario y preferencias"
          >
            <Clock3 size={16} strokeWidth={1.75} />
          </button>
        </div>
      </header>
      <CalendarFilterBar filter={filter} onChange={onFilterChange} projects={projects} />
    </>
  )
}
