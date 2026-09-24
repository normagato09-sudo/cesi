import { BarChart3, CalendarDays, DatabaseBackup, Users } from 'lucide-react'
import SummaryPanel from './SummaryPanel.jsx'
import ProposalsPanel from './ProposalsPanel.jsx'
import MissingNotesPanel from './MissingNotesPanel.jsx'
import './Sidebar.css'

const SECTIONS = [
  { id: 'calendar', label: 'Calendario', Icon: CalendarDays },
  { id: 'contacts', label: 'Contactos', Icon: Users },
  { id: 'report', label: 'Resumen', Icon: BarChart3 },
]

export default function Sidebar({
  summary,
  now,
  section,
  onSectionChange,
  onOpenBackup,
  proposals = [],
  onOpenProposal,
  missingNotes = [],
  onOpenMissingNotes,
}) {
  return (
    <aside className={`sidebar section-${section}`}>
      <div className="sidebar-brand">
        <span className="sidebar-logo">C</span>
        <span className="sidebar-title">CESI</span>
      </div>

      <nav className="sidebar-nav" aria-label="Secciones">
        {SECTIONS.map(({ id, label, shortLabel, Icon }) => (
          <button
            key={id}
            type="button"
            className={`sidebar-nav-item${section === id ? ' active' : ''}`}
            aria-current={section === id ? 'page' : undefined}
            onClick={() => onSectionChange(id)}
          >
            <Icon size={17} strokeWidth={1.75} />
            <span className="sidebar-nav-label">{label}</span>
            {shortLabel && (
              <span className="sidebar-nav-short" aria-hidden="true">
                {shortLabel}
              </span>
            )}
          </button>
        ))}
      </nav>

      <SummaryPanel summary={summary} now={now} />

      <ProposalsPanel items={proposals} onOpen={onOpenProposal} />

      <MissingNotesPanel meetings={missingNotes} onOpen={onOpenMissingNotes} />

      <div className="sidebar-footer">
        <button
          type="button"
          className="sidebar-backup-btn"
          onClick={onOpenBackup}
          aria-label="Copia de seguridad"
          title="Copia de seguridad"
        >
          <DatabaseBackup size={16} strokeWidth={1.75} />
          <span>Copia de seguridad</span>
        </button>
      </div>
    </aside>
  )
}
