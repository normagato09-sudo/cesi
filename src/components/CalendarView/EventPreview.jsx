import { createPortal } from 'react-dom'
import { format } from 'date-fns'
import { es } from 'date-fns/locale'
import { Ban } from 'lucide-react'
import { ParticipantList } from '../Participant.jsx'
import { colorForEvent } from '../../lib/eventStyle'
import { useScheduling } from '../../lib/schedulingContext'
import './EventPreview.css'

const WIDTH = 280

// Tarjeta flotante con el título, la hora y los participantes (compactos) de una reunión.
export default function EventPreview({ preview }) {
  const { contacts = [] } = useScheduling() || {}
  if (!preview) return null
  const { event, rect } = preview
  const roomRight = window.innerWidth - rect.right
  const left = roomRight >= WIDTH + 16 ? rect.right + 8 : Math.max(8, rect.left - WIDTH - 8)
  const top = Math.max(8, Math.min(rect.top, window.innerHeight - 160))
  const when = event.allDay
    ? format(event.start, "EEEE d 'de' MMMM", { locale: es })
    : `${format(event.start, "EEEE d 'de' MMMM", { locale: es })} · ${format(event.start, 'HH:mm')}–${format(event.end, 'HH:mm')}`

  return createPortal(
    <div className="event-preview" role="tooltip" style={{ left, top, width: WIDTH, '--event-color': colorForEvent(event) }}>
      <p className="event-preview-title">
        {event.isUnavailable && <Ban size={12} strokeWidth={2} />}
        {event.title}
        {event.provisional && <span className="event-preview-badge">Provisional</span>}
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
