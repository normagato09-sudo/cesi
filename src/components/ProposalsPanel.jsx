import { format } from 'date-fns'
import { es } from 'date-fns/locale'
import { Send } from 'lucide-react'
import './ProposalsPanel.css'

// "Propuestas pendientes" en la barra lateral. items = [{ proposal, options, expired, who }]
export default function ProposalsPanel({ items, onOpen }) {
  if (items.length === 0) return null

  return (
    <section className="proposals-panel" aria-label="Propuestas pendientes">
      <h2 className="proposals-panel-title">
        <Send size={12} strokeWidth={2} />
        Propuestas pendientes
      </h2>
      <ul>
        {items.map(({ proposal, options, expired, who }) => (
          <li key={proposal.id}>
            <button type="button" className={`proposals-panel-item${expired ? ' expired' : ''}`} onClick={() => onOpen(proposal.id)}>
              <span className="proposals-panel-name">{proposal.title}</span>
              <span className="proposals-panel-meta">
                {expired ? (
                  <span className="proposals-panel-expired">Caducada</span>
                ) : (
                  `${options.length} ${options.length === 1 ? 'opción' : 'opciones'}${who ? ` · ${who}` : ''}`
                )}
              </span>
              {!expired && (
                <span className="proposals-panel-options">
                  {options.map((o) => format(o.start, "EEE d · HH:mm", { locale: es })).join(' / ')}
                </span>
              )}
            </button>
          </li>
        ))}
      </ul>
    </section>
  )
}
