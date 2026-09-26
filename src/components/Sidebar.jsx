import { BadgeCheck, BarChart3, Briefcase, CalendarDays, DatabaseBackup, Settings, Users } from 'lucide-react'
import SummaryPanel from './SummaryPanel.jsx'
import ProposalsPanel from './ProposalsPanel.jsx'
import MissingNotesPanel from './MissingNotesPanel.jsx'
import PendingPanel from './PendingPanel.jsx'
import WeeklyAvailabilityPanel from './WeeklyAvailabilityPanel.jsx'
import SyncStatus from './SyncStatus.jsx'
import './Sidebar.css'

const SECTIONS = [
  { id: 'calendar', label: 'Calendario', Icon: CalendarDays },
  { id: 'contacts', label: 'Contactos', Icon: Users },
  { id: 'team', label: 'Equipo', Icon: BadgeCheck },
  { id: 'vacancies', label: 'Vacantes', Icon: Briefcase },
  { id: 'report', label: 'Resumen', Icon: BarChart3 },
]

export default function Sidebar({
  summary,
  now,
  section,
  onSectionChange,
  onOpenBackup,
  onOpenSettings,
  unavailableMeetings = [],
  onOpenUnavailable,
  onRescheduleUnavailable,
  onKeepUnavailable,
  proposals = [],
  onOpenProposal,
  missingNotes = [],
  onOpenMissingNotes,
  pendingWeek = null,
  onDeclareWeek,
  onDismissWeek,
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

      <WeeklyAvailabilityPanel pending={pendingWeek} onDeclare={onDeclareWeek} onDismiss={onDismissWeek} />

      <PendingPanel items={unavailableMeetings} onOpen={onOpenUnavailable} onReschedule={onRescheduleUnavailable} onKeep={onKeepUnavailable} />

      <SummaryPanel summary={summary} now={now} />

      <ProposalsPanel items={proposals} onOpen={onOpenProposal} />

      <MissingNotesPanel meetings={missingNotes} onOpen={onOpenMissingNotes} />

      <div className="sidebar-footer">
        <SyncStatus />
        <button
          type="button"
          className="sidebar-backup-btn"
          onClick={onOpenSettings}
          aria-label="Ajustes"
          title="Ajustes"
        >
          <Settings size={16} strokeWidth={1.75} />
          <span>Ajustes</span>
        </button>
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
