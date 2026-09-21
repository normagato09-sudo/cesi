import { useState } from 'react'
import { format, isSameDay } from 'date-fns'
import { es } from 'date-fns/locale'
import { X, Clock, Users, Video, Tag, Pencil, Trash2, Copy, Ban, Repeat } from 'lucide-react'
import { RECURRENCE_LABELS } from '../lib/recurrence'
import { colorForEvent } from '../lib/eventStyle'
import './EventModal.css'

function formatRange(event) {
  if (event.allDay) {
    return format(event.start, "EEEE, d 'de' MMMM", { locale: es })
  }
  const sameDay = isSameDay(event.start, event.end)
  const datePart = format(event.start, "EEEE, d 'de' MMMM", { locale: es })
  const timePart = sameDay
    ? `${format(event.start, 'HH:mm')} – ${format(event.end, 'HH:mm')}`
    : `${format(event.start, 'd MMM HH:mm', { locale: es })} – ${format(event.end, 'd MMM HH:mm', { locale: es })}`
  return `${datePart} · ${timePart}`
}

export default function EventModal({ event, onClose, onEdit, onDelete, onDuplicate }) {
  const [deleting, setDeleting] = useState(false)
  const [deleteError, setDeleteError] = useState(null)

  if (!event) return null

  const handleDelete = async () => {
    const confirmMsg = event.isRecurringInstance
      ? '¿Eliminar toda la serie de repeticiones de este evento?'
      : '¿Seguro que quieres eliminar este evento?'
    if (!window.confirm(confirmMsg)) return
    setDeleting(true)
    setDeleteError(null)
    try {
      await onDelete(event)
      onClose()
    } catch (err) {
      setDeleteError(err.message || 'No se pudo eliminar el evento.')
      setDeleting(false)
    }
  }

  return (
    <div className="event-modal-backdrop" onClick={onClose}>
      <div className="event-modal" onClick={(e) => e.stopPropagation()}>
        <div className="event-modal-header" style={{ '--event-color': colorForEvent(event) }}>
          <button type="button" className="event-modal-close" onClick={onClose} aria-label="Cerrar">
            <X size={18} strokeWidth={1.75} />
          </button>
          <h2>
            {event.isUnavailable && <Ban size={16} strokeWidth={1.75} className="event-modal-unavailable-icon" />}
            {event.title}
          </h2>
          <p className="event-modal-range">
            <Clock size={14} strokeWidth={1.75} />
            {formatRange(event)}
          </p>
          {event.recurrence && (
            <p className="event-modal-range">
              <Repeat size={14} strokeWidth={1.75} />
              {RECURRENCE_LABELS[event.recurrence.freq]}
              {event.recurrence.until &&
                ` hasta ${format(new Date(event.recurrence.until), "d 'de' MMMM yyyy", { locale: es })}`}
            </p>
          )}
        </div>

        <div className="event-modal-body">
          {!event.isUnavailable && (
            <div className="event-modal-row">
              <Tag size={16} strokeWidth={1.75} />
              <span>{event.category}</span>
            </div>
          )}

          {event.meetLink && (
            <div className="event-modal-row">
              <Video size={16} strokeWidth={1.75} />
              <a href={event.meetLink} target="_blank" rel="noreferrer" className="event-modal-link">
                Unirse a la reunión
              </a>
            </div>
          )}

          {event.participants?.length > 0 && (
            <div className="event-modal-row align-top">
              <Users size={16} strokeWidth={1.75} />
              <ul className="event-modal-attendees">
                {event.participants.map((p) => (
                  <li key={p}>{p}</li>
                ))}
              </ul>
            </div>
          )}

          {event.description && (
            <div className="event-modal-description">
              <p>{event.description}</p>
            </div>
          )}
        </div>

        <div className="event-modal-footer">
          {deleteError && <div className="event-modal-error">{deleteError}</div>}

          <div className="event-modal-actions">
            <button type="button" className="event-modal-action-btn" onClick={() => onEdit(event)}>
              <Pencil size={14} strokeWidth={1.75} />
              Editar
            </button>
            {!event.isUnavailable && (
              <button type="button" className="event-modal-action-btn" onClick={() => onDuplicate(event)}>
                <Copy size={14} strokeWidth={1.75} />
                Duplicar
              </button>
            )}
            <button
              type="button"
              className="event-modal-action-btn danger"
              onClick={handleDelete}
              disabled={deleting}
            >
              <Trash2 size={14} strokeWidth={1.75} />
              {deleting ? 'Eliminando...' : 'Eliminar'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
