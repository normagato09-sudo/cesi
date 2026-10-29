import { CalendarSearch, Send } from 'lucide-react'
import ProposalsPanel from './ProposalsPanel.jsx'
import './ContactsView.css'
import './SectionPage.css'

// Agenda → Buscar hueco: abre el buscador de huecos (que también crea propuestas) y lista las
// propuestas pendientes (las mismas que en Inicio y en la barra lateral).
export default function SlotsView({ proposals = [], onFindSlot, onOpenProposal }) {
  return (
    <div className="section-page">
      <div className="contacts-header">
        <h1 className="contacts-title">Buscar hueco y propuestas</h1>
        <div className="contacts-header-actions">
          <button type="button" className="contacts-new-btn" onClick={onFindSlot}>
            <CalendarSearch size={15} strokeWidth={1.75} />
            <span>Buscar hueco</span>
          </button>
        </div>
      </div>
      <div className="section-page-body">
        {proposals.length === 0 ? (
          <div className="contacts-empty">
            <Send size={28} strokeWidth={1.5} />
            <p className="contacts-empty-title">No hay propuestas pendientes</p>
            <p>Busca un hueco con varias personas y, si no está claro, envía una propuesta con varias opciones.</p>
          </div>
        ) : (
          <ProposalsPanel items={proposals} onOpen={onOpenProposal} />
        )}
      </div>
    </div>
  )
}
