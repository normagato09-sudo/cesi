import { createPortal } from 'react-dom'
import { format } from 'date-fns'
import { es } from 'date-fns/locale'
import UnavailableIcon from '../UnavailableIcon.jsx'
import { allDayRangeText, eventTitle } from '../../lib/unavailableKinds'
import { ParticipantList } from '../Participant.jsx'
import { colorForEvent } from '../../lib/eventStyle'
import { useScheduling } from '../../lib/schedulingContext'
import './EventPreview.css'
import { NOT_ATTENDING_LABEL } from '../../lib/notAttending'

const WIDTH = 280

// Tarjeta flotante con el título, la hora y los participantes (compactos) de una reunión.
// Con ratón va al lado de la reunión; al mantenerla pulsada (móvil), encima o debajo, sin taparla
// ni quedar bajo el dedo.
export default function EventPreview({ preview }) {
  const { contacts = [] } = useScheduling() || {}
  if (!preview) return null
  const { event, rect, touch } = preview
  const width = Math.min(WIDTH, window.innerWidth - 16)
  let left
  let top
  if (touch) {
    left = Math.max(8, Math.min(rect.left + rect.width / 2 - width / 2, window.innerWidth - width - 8))
    top = rect.bottom + 8
  } else {
    const roomRight = window.innerWidth - rect.right
    left = roomRight >= WIDTH + 16 ? rect.right + 8 : Math.max(8, rect.left - WIDTH - 8)
    top = Math.max(8, Math.min(rect.top, window.innerHeight - 160))
  }
  // En táctil se mide al pintarla: encima si cabe; si no, debajo; si tampoco, arriba del todo.
  const placeTouch = (el) => {
    if (!el || !touch) return
    const h = el.offsetHeight
    let y = rect.top - h - 8
    if (y < 8) y = rect.bottom + 8 + h <= window.innerHeight - 8 ? rect.bottom + 8 : 8
    el.style.top = `${y}px`
  }
  const when = event.allDay
    ? allDayRangeText(event)
    : `${format(event.start, "EEEE d 'de' MMMM", { locale: es })} · ${format(event.start, 'HH:mm')}–${format(event.end, 'HH:mm')}`

  return createPortal(
    <div ref={placeTouch} className="event-preview" role="tooltip" style={{ left, top, width, '--event-color': colorForEvent(event) }}>
      <p className="event-preview-title">
        {event.isUnavailable && <UnavailableIcon event={event} size={12} />}
        {eventTitle(event)}
        {event.provisional && <span className="event-preview-badge">Provisional</span>}
        {event.notAttending && <span className="organized-badge">{NOT_ATTENDING_LABEL}</span>}
      </p>
      <p className="event-preview-when">{when}</p>
      {!event.isUnavailable && (
        <ParticipantList
          item={event}
          contacts={contacts}
          start={event.allDay ? null : event.start}
          end={event.allDay ? null : event.end}
          size="compact"
        />
      )}
    </div>,
    document.body,
  )
}
