import { DatabaseBackup } from 'lucide-react'
import SummaryPanel from './SummaryPanel.jsx'
import ProposalsPanel from './ProposalsPanel.jsx'
import MissingNotesPanel from './MissingNotesPanel.jsx'
import PendingPanel from './PendingPanel.jsx'
import WeeklyAvailabilityPanel from './WeeklyAvailabilityPanel.jsx'
import SyncStatus from './SyncStatus.jsx'
import { SECTIONS } from './sections.js'
import './Sidebar.css'

export default function Sidebar({
  summary,
  now,
  section,
  onSectionChange,
  onOpenBackup,
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
  // En Inicio, las propuestas y las reuniones sin acta ya están en el panel.
  const onHome = section === 'home'
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
            <span className="sidebar-nav-label">{label}</span>
          </button>
        ))}
      </nav>

      <WeeklyAvailabilityPanel pending={pendingWeek} onDeclare={onDeclareWeek} onDismiss={onDismissWeek} />

      <PendingPanel items={unavailableMeetings} onOpen={onOpenUnavailable} onReschedule={onRescheduleUnavailable} onKeep={onKeepUnavailable} />

      <SummaryPanel summary={summary} now={now} />

      {!onHome && <ProposalsPanel items={proposals} onOpen={onOpenProposal} />}

      {!onHome && <MissingNotesPanel meetings={missingNotes} onOpen={onOpenMissingNotes} />}

      <div className="sidebar-footer">
        <SyncStatus />
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
