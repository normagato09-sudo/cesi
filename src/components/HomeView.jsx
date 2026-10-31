import { format } from 'date-fns'
import { es } from 'date-fns/locale'
import { CalendarCheck, CalendarDays, Check, ChevronRight, Send, X } from 'lucide-react'
import { greeting } from '../lib/home'
import { matchContact, requestMinutes, requestVisitor } from '../lib/bookings'
import ArchivedNotice from './ArchivedNotice.jsx'
import PlaceIcon from './PlaceIcon.jsx'
import { placeLabel } from '../lib/videoCall'
import { formatDurationLong } from '../lib/proposals'
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

function Empty({ children }) {
  return <p className="home-empty">{children}</p>
}

// Solicitudes del enlace de reservas pendientes: quién, cuándo (en mi hora), duración, su país y
// su hora local, y motivo,
// con Aceptar y Rechazar. Hasta que se responden, su hueco sale ocupado en el enlace.
function BookingRequests({ requests, contacts = [], onAccept, onReject, onUnarchive }) {
  if (requests.length === 0) return <Empty>No tienes solicitudes pendientes.</Empty>
  return (
    <ul className="home-list">
      {requests.map((r) => {
        const start = new Date(r.starts_at)
        const visitor = requestVisitor(r)
        // Si coincide con un contacto archivado, se avisa (y se puede desarchivar).
        const archived = matchContact(r, contacts)?.archived ? matchContact(r, contacts) : null
        return (
          <li key={r.id} className="home-booking">
            <span className="home-meeting-main">
              <span className="home-meeting-title">{r.name}</span>
              <span className="home-meeting-people">
                {format(start, "EEE d 'de' MMM · HH:mm", { locale: es })} · {formatDurationLong(requestMinutes(r))}
              </span>
              {visitor && (
                <span className="home-booking-country">
                  {visitor.flag} {visitor.place}
                  {visitor.time && (
                    <>
                      {' · '}
                      <strong>{visitor.time}</strong> su hora{visitor.dayNote && ` (${visitor.dayNote})`}
                    </>
                  )}
                </span>
              )}
              {placeLabel(r.meeting_place) && (
                <span className="home-booking-place">
                  <PlaceIcon place={r.meeting_place} size={16} />
                  {placeLabel(r.meeting_place)}
                </span>
              )}
              {archived && <ArchivedNotice contact={archived} onUnarchive={onUnarchive} compact />}
              <span className="home-booking-reason" title={r.reason}>
                {r.reason}
              </span>
            </span>
            <span className="home-booking-actions">
              <button type="button" className="home-booking-btn primary" onClick={() => onAccept(r)}>
                <Check size={14} strokeWidth={2} />
                Aceptar
              </button>
              <button type="button" className="home-booking-btn" onClick={() => onReject(r)}>
                <X size={14} strokeWidth={2} />
                Rechazar
              </button>
            </span>
          </li>
        )
      })}
    </ul>
  )
}

/**
 * Inicio: lo primero que se ve al abrir la app. «Mi equipo» arriba, las solicitudes del enlace de
 * reservas y las propuestas pendientes. Cada bloque lleva a su sección.
 */
export default function HomeView({
  now,
  proposals,
  onGoTo,
  onOpenProposal,
  // Enlace de reservas (solo con la sincronización configurada): null si no se usa.
  bookings = null,
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
        {bookings && (
          <HomeCard
            Icon={CalendarCheck}
            title="Solicitudes pendientes"
            count={bookings.requests.length}
            linkLabel="Enlace de reservas"
            onLink={bookings.onOpenLink}
            className={bookings.requests.length > 0 ? 'home-card-attention' : ''}
          >
            <BookingRequests
              requests={bookings.requests}
              contacts={bookings.contacts}
              onAccept={bookings.onAccept}
              onReject={bookings.onReject}
              onUnarchive={bookings.onUnarchive}
            />
          </HomeCard>
        )}

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
