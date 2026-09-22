import { format, differenceInMinutes } from 'date-fns'
import { es } from 'date-fns/locale'
import { X, Clock, Users, Ban, ChevronRight } from 'lucide-react'
import { colorForEvent } from '../lib/eventStyle'
import './DayEventsModal.css'

function formatDuration(ev) {
  if (ev.allDay) return 'Todo el día'
  const mins = differenceInMinutes(ev.end, ev.start)
  if (mins <= 0) return ''
  const h = Math.floor(mins / 60)
  const m = mins % 60
  if (h === 0) return `${m} min`
  if (m === 0) return `${h} h`
  return `${h} h ${m} min`
}

export default function DayEventsModal({ day, events, onClose, onSelectEvent }) {
  if (!day) return null

  return (
    <div className="day-events-modal-backdrop" onClick={onClose}>
      <div className="day-events-modal" onClick={(e) => e.stopPropagation()}>
        <div className="day-events-modal-header">
          <button type="button" className="day-events-modal-close" onClick={onClose} aria-label="Cerrar">
            <X size={18} strokeWidth={1.75} />
          </button>
          <h2>{format(day, "EEEE, d 'de' MMMM", { locale: es })}</h2>
          <p className="day-events-modal-count">
            {events.length === 0
              ? 'Sin reuniones'
              : `${events.length} reunión${events.length === 1 ? '' : 'es'}`}
          </p>
        </div>

        <div className="day-events-modal-body">
          {events.length === 0 && (
            <p className="day-events-modal-empty">No hay reuniones programadas este día.</p>
          )}
          {events.map((ev) => (
            <button
              type="button"
              key={ev.id}
              className={`day-events-modal-item ${ev.isUnavailable ? 'unavailable' : ''}`}
              style={{ '--event-color': colorForEvent(ev) }}
              onClick={() => onSelectEvent(ev)}
            >
              <span className="day-events-modal-item-mark" />
              <span className="day-events-modal-item-main">
                <span className="day-events-modal-item-title">
                  {ev.isUnavailable && <Ban size={13} strokeWidth={2} />}
                  {ev.title}
                </span>
                <span className="day-events-modal-item-meta">
                  <Clock size={12} strokeWidth={1.75} />
                  {ev.allDay ? 'Todo el día' : `${format(ev.start, 'HH:mm')} – ${format(ev.end, 'HH:mm')}`}
                  {!ev.allDay && (
                    <>
                      <span className="day-events-modal-item-dot">·</span>
                      {formatDuration(ev)}
                    </>
                  )}
                  {ev.participants?.length > 0 && (
                    <>
                      <span className="day-events-modal-item-dot">·</span>
                      <Users size={12} strokeWidth={1.75} />
                      {ev.participants.length}
                    </>
                  )}
                </span>
              </span>
              <ChevronRight size={16} strokeWidth={1.75} className="day-events-modal-item-chevron" />
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}
