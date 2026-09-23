import { useState } from 'react'
import { format, isSameDay } from 'date-fns'
import { es } from 'date-fns/locale'
import {
  X,
  Clock,
  Users,
  Video,
  Tag,
  Pencil,
  Trash2,
  Copy,
  Ban,
  Repeat,
  UserPlus,
  UserRound,
  Globe,
  CalendarCheck,
  Check,
} from 'lucide-react'
import ContactAvatar from './ContactAvatar.jsx'
import ContactCountryStep from './ContactCountryStep.jsx'
import { RECURRENCE_LABELS } from '../lib/recurrence'
import { participantsOf } from '../lib/contacts'
import { colorForEvent } from '../lib/eventStyle'
import { dayShift, formatTimeInZone, localTimeZone, sameClock, zonePlace } from '../lib/timezones'
import { isProvisional, optionsOf, proposalShareData } from '../lib/proposals'
import { copyText } from '../lib/clipboard'
import { useScheduling } from '../lib/schedulingContext'
import './EventModal.css'

// "18:00 en Ciudad de México" si el contacto está en una zona con otra hora; si no, null.
function localTimeFor(contact, event) {
  if (!contact.timeZone || event.allDay) return null
  const mine = localTimeZone()
  if (sameClock(event.start, contact.timeZone, mine)) return null
  const shift = dayShift(event.start, mine, contact.timeZone)
  const note = shift > 0 ? ' (día siguiente)' : shift < 0 ? ' (día anterior)' : ''
  return `${formatTimeInZone(event.start, contact.timeZone)} en ${zonePlace(contact.timeZone)}${note}`
}

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

export default function EventModal({
  event,
  contacts,
  onClose,
  onEdit,
  onDelete,
  onDuplicate,
  onOpenContact,
  onSaveGuestAsContact,
  onConfirmOption,
  onCancelProposal,
}) {
  const { rawEvents, proposals } = useScheduling()
  const [deleting, setDeleting] = useState(false)
  const [deleteError, setDeleteError] = useState(null)
  const [copied, setCopied] = useState(false)
  const [savingGuest, setSavingGuest] = useState(null) // invitado que se está guardando como contacto

  if (!event) return null

  // Se resuelven en vivo: si se renombra un contacto, aquí aparece ya con el nombre nuevo.
  const { contacts: people, guests } = participantsOf(event, contacts)

  // Reunión provisional: opción de una propuesta pendiente.
  const proposal = isProvisional(event) ? proposals.find((p) => p.id === event.proposalId) : null
  const options = proposal ? optionsOf(proposal, rawEvents) : []
  const optionIndex = options.findIndex((o) => o.id === event.seriesId)

  const handleCopyMessage = async () => {
    if (await copyText(proposalShareData(proposal, options, contacts).text)) {
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    }
  }

  const handleCancelProposal = () => {
    if (!window.confirm('¿Cancelar la propuesta y borrar todas sus opciones provisionales?')) return
    onCancelProposal(proposal.id)
  }

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
          {proposal && (
            <p className="event-modal-provisional">
              <span className="event-modal-provisional-badge">Provisional</span>
              Opción {optionIndex + 1} de {options.length} de una propuesta pendiente
            </p>
          )}
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
              <span className="event-modal-tags">
                <span>{event.category}</span>
                {(event.tags || []).map((t) => (
                  <span key={t} className="event-modal-tag">
                    {t}
                  </span>
                ))}
              </span>
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

          {people.length > 0 && (
            <div className="event-modal-row align-top">
              <Users size={16} strokeWidth={1.75} />
              <ul className="event-modal-attendees">
                {people.map((c) => (
                  <li key={c.id} className="event-modal-attendee">
                    <ContactAvatar name={c.name} size="sm" />
                    <span className="event-modal-attendee-text">
                      <button
                        type="button"
                        className="event-modal-attendee-name"
                        onClick={() => onOpenContact(c.id)}
                        title="Ver ficha del contacto"
                      >
                        {c.name}
                      </button>
                      {c.email && (
                        <a href={`mailto:${c.email}`} className="event-modal-attendee-email">
                          {c.email}
                        </a>
                      )}
                      {localTimeFor(c, event) && (
                        <span className="event-modal-attendee-zone">
                          <Globe size={12} strokeWidth={1.75} />
                          {localTimeFor(c, event)}
                        </span>
                      )}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {guests.length > 0 && (
            <div className="event-modal-row align-top">
              <UserRound size={16} strokeWidth={1.75} />
              <div className="event-modal-guests">
                <span className="event-modal-guests-label">Invitados sin ficha</span>
                <ul className="event-modal-attendees">
                  {guests.map((g) =>
                    savingGuest === g ? (
                      <li key={g}>
                        <ContactCountryStep
                          name={g}
                          confirmLabel="Guardar contacto"
                          onCancel={() => setSavingGuest(null)}
                          onConfirm={(zone) => {
                            onSaveGuestAsContact(event, g, zone)
                            setSavingGuest(null)
                          }}
                        />
                      </li>
                    ) : (
                      <li key={g} className="event-modal-attendee">
                        <span className="event-modal-attendee-text">
                          <span className="event-modal-guest-name">{g}</span>
                        </span>
                        <button type="button" className="event-modal-save-guest" onClick={() => setSavingGuest(g)}>
                          <UserPlus size={13} strokeWidth={1.75} />
                          Guardar como contacto
                        </button>
                      </li>
                    ),
                  )}
                </ul>
              </div>
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

          {proposal && (
            <div className="event-modal-proposal-actions">
              <button type="button" className="event-modal-action-btn primary" onClick={() => onConfirmOption(event)}>
                <CalendarCheck size={14} strokeWidth={1.75} />
                Confirmar esta opción
              </button>
              <div className="event-modal-actions">
                <button type="button" className="event-modal-action-btn" onClick={handleCopyMessage}>
                  {copied ? <Check size={14} strokeWidth={2} /> : <Copy size={14} strokeWidth={1.75} />}
                  {copied ? 'Copiado' : 'Copiar el mensaje otra vez'}
                </button>
                <button type="button" className="event-modal-action-btn danger" onClick={handleCancelProposal}>
                  <Trash2 size={14} strokeWidth={1.75} />
                  Cancelar propuesta
                </button>
              </div>
            </div>
          )}

          <div className="event-modal-actions" hidden={!!proposal}>
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
