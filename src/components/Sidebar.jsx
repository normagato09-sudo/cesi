import { CalendarDays, Users } from 'lucide-react'
import SummaryPanel from './SummaryPanel.jsx'
import './Sidebar.css'

const SECTIONS = [
  { id: 'calendar', label: 'Calendario', Icon: CalendarDays },
  { id: 'contacts', label: 'Contactos', Icon: Users },
]

export default function Sidebar({ summary, now, section, onSectionChange }) {
  return (
    <aside className={`sidebar section-${section}`}>
      <div className="sidebar-brand">
        <span className="sidebar-logo">C</span>
        <span className="sidebar-title">CESI</span>
      </div>

      <nav className="sidebar-nav" aria-label="Secciones">
        {SECTIONS.map(({ id, label, Icon }) => (
          <button
            key={id}
            type="button"
            className={`sidebar-nav-item${section === id ? ' active' : ''}`}
            aria-current={section === id ? 'page' : undefined}
            onClick={() => onSectionChange(id)}
          >
            <Icon size={17} strokeWidth={1.75} />
            <span>{label}</span>
          </button>
        ))}
      </nav>

      <SummaryPanel summary={summary} now={now} />
    </aside>
  )
}
