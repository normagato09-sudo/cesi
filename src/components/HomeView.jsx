import { format } from 'date-fns'
import { es } from 'date-fns/locale'
import { CalendarDays, ChevronRight, Send } from 'lucide-react'
import { greeting } from '../lib/home'
import './HomeView.css'

// Bloque del panel: cabecera que lleva a su sección y el contenido (o un mensaje si está vacío).
function HomeCard({ Icon, title, count, linkLabel, onLink, children, className = '' }) {
  return (
    <section className={`home-card ${className}`} aria-label={title}>
      <button type="button" className="home-card-header" onClick={onLink}>
        <Icon size={18} strokeWidth={1.75} aria-hidden="true" />
        <h2>{title}</h2>
        {count > 0 && <span className="home-card-count">{count}</span>}
        <span className="home-card-link">
          {linkLabel}
          <ChevronRight size={16} strokeWidth={2} aria-hidden="true" />
        </span>
      </button>
      <div className="home-card-body">{children}</div>
    </section>
  )
}

/**
 * Inicio: lo primero que se ve al abrir la app. «Mi equipo» arriba y las propuestas pendientes.
 * Cada bloque lleva a su sección.
 */
export default function HomeView({
  now,
  proposals,
  onGoTo,
  onOpenProposal,
  // «Mi equipo» (CeoTeamPanel), arriba de todo; null sin la sincronización.
  teamPanel = null,
}) {
  const dateText = format(now, "EEEE, d 'de' MMMM 'de' yyyy", { locale: es })

  return (
    <div className="home-view">
      <header className="home-header">
        <div>
          <h1>{greeting(now)}</h1>
          <p className="home-date">{dateText.charAt(0).toUpperCase() + dateText.slice(1)}</p>
        </div>
        <button type="button" className="home-calendar-btn" onClick={() => onGoTo('calendar')}>
          <CalendarDays size={18} strokeWidth={1.75} />
          Ir al calendario
        </button>
      </header>

      {teamPanel}

      <div className="home-grid">
        {proposals.length > 0 && (
          <HomeCard
            Icon={Send}
            title="Propuestas pendientes"
            count={proposals.length}
            linkLabel="Calendario"
            onLink={() => onGoTo('calendar')}
          >
            <ul className="home-list">
              {proposals.map(({ proposal, options, expired, who }) => (
                <li key={proposal.id}>
                  <button type="button" className={`home-vacancy${expired ? ' expired' : ''}`} onClick={() => onOpenProposal(proposal.id)}>
                    <span className="home-meeting-main">
                      <span className="home-meeting-title">{proposal.title || 'Sin título'}</span>
                      <span className="home-meeting-people">
                        {expired
                          ? 'Caducada: ya han pasado todas las opciones'
                          : `${options.length} ${options.length === 1 ? 'opción' : 'opciones'}${who ? ` · ${who}` : ''}`}
                      </span>
                    </span>
                    <ChevronRight size={16} strokeWidth={2} aria-hidden="true" />
                  </button>
                </li>
              ))}
            </ul>
          </HomeCard>
        )}
      </div>
    </div>
  )
}
