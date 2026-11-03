import { useContext } from 'react'
import { createPortal } from 'react-dom'
import { ExternalLink, MapPin, Users } from 'lucide-react'
import UnavailableIcon from '../UnavailableIcon.jsx'
import { SHARED_LABEL, colorForEvent } from '../../lib/eventStyle'
import { useScheduling } from '../../lib/schedulingContext'
import { previewContent, safeLink } from '../../lib/eventPreview'
import { NOT_ATTENDING_LABEL } from '../../lib/notAttending'
import { PreviewMeContext } from './previewContext'
import './EventPreview.css'

const WIDTH = 300

/**
 * Tarjeta rápida de lo que hay en el calendario: título, día y hora (en mi zona), participantes,
 * respuestas de una reunión compartida, enlace, lugar y el principio de la descripción. Con ratón
 * va al lado del elemento (sin taparlo) y se puede entrar en ella para pulsar el enlace; con el
 * dedo, encima o debajo, con «Abrir» para ir al detalle.
 */
export default function EventPreview({ preview }) {
  const { contacts = [] } = useScheduling() || {}
  const meId = useContext(PreviewMeContext)
  if (!preview) return null
  const { event, rect, touch } = preview
  const width = Math.min(WIDTH, window.innerWidth - 16)
  const roomRight = window.innerWidth - rect.right
  const left = touch
    ? Math.max(8, Math.min(rect.left + rect.width / 2 - width / 2, window.innerWidth - width - 8))
    : roomRight >= width + 16
      ? rect.right + 8
      : Math.max(8, rect.left - width - 8)
  // Se mide al pintarla. Con ratón, a la altura del elemento sin salirse de la pantalla; con el
  // dedo, encima si cabe, si no debajo y, si tampoco, arriba del todo.
  const place = (el) => {
    if (!el) return
    const h = el.offsetHeight
    let y
    if (touch) {
      y = rect.top - h - 8
      if (y < 8) y = rect.bottom + 8 + h <= window.innerHeight - 8 ? rect.bottom + 8 : 8
    } else {
      y = Math.max(8, Math.min(rect.top, window.innerHeight - h - 8))
    }
    el.style.top = `${y}px`
  }
  const p = previewContent(event, { contacts, meId })
  const link = safeLink(p.link)

  return createPortal(
    <div
      ref={place}
      className={`event-preview${touch ? ' touch' : ''}`}
      role="tooltip"
      style={{ left, top: rect.top, width, '--event-color': colorForEvent(event) }}
      onPointerEnter={preview.keep}
      onPointerLeave={(e) => e.pointerType === 'mouse' && preview.leave?.()}
    >
      <p className="event-preview-title">
        {event.isUnavailable && <UnavailableIcon event={event} size={12} />}
        <span>{p.title}</span>
      </p>
      <p className="event-preview-when">{p.when}</p>
      <div className="event-preview-badges">
        {event.provisional && <span className="event-preview-badge">Provisional</span>}
        {event.notAttending && <span className="event-preview-badge">{NOT_ATTENDING_LABEL}</span>}
        {p.mine ? (
          <span className={`event-preview-badge mine ${event.sharedMeeting?.my_status || event.item?.meeting?.my_status || ''}`}>{p.mine}</span>
        ) : (
          event.shared && !event.item && <span className="event-preview-badge">{SHARED_LABEL}</span>
        )}
      </div>
      {p.lines.map((line) => (
        <p key={line} className="event-preview-line">
          {line}
        </p>
      ))}
      {p.people && (
        <p className="event-preview-line">
          <Users size={13} strokeWidth={1.75} aria-hidden="true" />
          {p.people}
        </p>
      )}
      {p.answers.length > 1 && (
        <ul className="event-preview-answers">
          {p.answers.map((a, i) => (
            <li key={`${a.name}-${i}`}>
              <span>{a.name}</span>
              <span className={`event-preview-answer ${a.status}`}>{a.label}</span>
            </li>
          ))}
        </ul>
      )}
      {p.location && (
        <p className="event-preview-line">
          <MapPin size={13} strokeWidth={1.75} aria-hidden="true" />
          {p.location}
        </p>
      )}
      {link && (
        <a className="event-preview-link" href={link} target="_blank" rel="noreferrer">
          <ExternalLink size={13} strokeWidth={1.75} aria-hidden="true" />
          {link.replace(/^https?:\/\//, '').replace(/\/$/, '')}
        </a>
      )}
      {p.description && <p className="event-preview-desc">{p.description}</p>}
      {touch && preview.open && (
        <button type="button" className="event-preview-open" onClick={preview.open}>
          Abrir
        </button>
      )}
    </div>,
    document.body,
  )
}
