import { CalendarCheck, DatabaseBackup } from 'lucide-react'
import SummaryPanel from './SummaryPanel.jsx'
import ProposalsPanel from './ProposalsPanel.jsx'
import MissingNotesPanel from './MissingNotesPanel.jsx'
import PendingPanel from './PendingPanel.jsx'
import SyncStatus from './SyncStatus.jsx'
import { SECTIONS, sectionActive } from './sections.js'
import './Sidebar.css'

export default function Sidebar({
  summary,
  now,
  section,
  onSectionChange,
  onOpenBackup,
  onOpenBookingLink = null,
  unavailableMeetings = [],
  onOpenUnavailable,
  onRescheduleUnavailable,
  onKeepUnavailable,
  proposals = [],
  onOpenProposal,
  missingNotes = [],
  onOpenMissingNotes,
}) {
  // En Inicio, las propuestas, las reuniones sin acta y el resumen (próxima reunión, hoy y la semana)
  // ya están en el panel.
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
            className={`sidebar-nav-item${sectionActive(id, section) ? ' active' : ''}`}
            aria-current={sectionActive(id, section) ? 'page' : undefined}
            onClick={() => onSectionChange(id)}
          >
            <Icon size={17} strokeWidth={1.75} />
            <span className="sidebar-nav-label">{label}</span>
          </button>
        ))}
      </nav>

      <PendingPanel items={unavailableMeetings} onOpen={onOpenUnavailable} onReschedule={onRescheduleUnavailable} onKeep={onKeepUnavailable} />

      {!onHome && <SummaryPanel summary={summary} now={now} />}

      {!onHome && <ProposalsPanel items={proposals} onOpen={onOpenProposal} />}

      {!onHome && <MissingNotesPanel meetings={missingNotes} onOpen={onOpenMissingNotes} />}

      <div className="sidebar-footer">
        <SyncStatus />
        {onOpenBookingLink && (
          <button type="button" className="sidebar-backup-btn" onClick={onOpenBookingLink} title="Enlace de reservas">
            <CalendarCheck size={16} strokeWidth={1.75} />
            <span>Enlace de reservas</span>
          </button>
        )}
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
