import { CalendarDays } from 'lucide-react'
import SummaryPanel from './SummaryPanel.jsx'
import './Sidebar.css'

export default function Sidebar({ summary, now }) {
  return (
    <aside className="sidebar">
      <div className="sidebar-brand">
        <span className="sidebar-logo">C</span>
        <span className="sidebar-title">CESI</span>
      </div>

      <nav className="sidebar-nav">
        <div className="sidebar-nav-item active">
          <CalendarDays size={17} strokeWidth={1.75} />
          <span>Calendario</span>
        </div>
      </nav>

      <SummaryPanel summary={summary} now={now} />
    </aside>
  )
}
