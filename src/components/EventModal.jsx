import { useState } from 'react'
import { format, isSameDay } from 'date-fns'
import { es } from 'date-fns/locale'
import {
  X,
  Clock,
  Users,
  Video,
  Briefcase,
  Pencil,
  Trash2,
  Copy,
  Ban,
  Repeat,
  UserPlus,
  CalendarCheck,
  Check,
  Undo2,
  ListTodo,
  Megaphone,
} from 'lucide-react'
import { ParticipantList } from './Participant.jsx'
import ContactCountryStep from './ContactCountryStep.jsx'
import MeetingSession from './MeetingSession.jsx'
import TaskItem from './TaskItem.jsx'
import { pendingForMeeting, sourceOccurrence, tasksOfSession } from '../lib/tasks'
import ConvocationModal from './ConvocationModal.jsx'
import { NOT_ATTENDING_LABEL, isNotAttending } from '../lib/notAttending'
import { isInterview } from '../lib/vacancies'
import { allDayRangeText, eventTitle, isMarkedDayOff, kindLabel, unavailableKindOf } from '../lib/unavailableKinds'
import UnavailableIcon from './UnavailableIcon.jsx'
import { RECURRENCE_LABELS, dateKey } from '../lib/recurrence'
import { participantsOf } from '../lib/contacts'
import { colorForEvent } from '../lib/eventStyle'
import { isProvisional, optionsOf, proposalShareData } from '../lib/proposals'
import { copyText } from '../lib/clipboard'
import { useScheduling } from '../lib/schedulingContext'
import './EventModal.css'

function formatRange(event) {
  if (event.allDay) return allDayRangeText(event)
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
  now,
  focusNotes = false,
  // Abrir directamente el mensaje de convocatoria (al crear una reunión en la que no asisto).
  openConvocation = false,
  onSaveSession,
  // Tareas (todas) y qué hacer con ellas: crear, abrir, marcar hecha e ir a su reunión.
  tasks = [],
  onNewTask,
  onOpenTask,
  onToggleTask,
  onOpenTaskSource,
  onClose,
  onEdit,
  onDelete,
  onRestoreOccurrence,
  onDuplicate,
  onOpenContact,
  onSaveGuestAsContact,
  onConfirmOption,
  onCancelProposal,
  // Mi nombre para el acta en PDF («Nombre que se muestra» del enlace de reservas).
  organizerName = '',
}) {
  const { rawEvents, proposals } = useScheduling()
  const [deleting, setDeleting] = useState(false)
  const [deleteError, setDeleteError] = useState(null)
  const [copied, setCopied] = useState(false)
  const [savingGuest, setSavingGuest] = useState(null) // invitado que se está guardando como contacto
  const [convocationOpen, setConvocationOpen] = useState(openConvocation)

  if (!event) return null

  const today = dateKey(now)
  const pendingTasks = pendingForMeeting(tasks, event, rawEvents)

  // Se resuelven en vivo: si se renombra un contacto, aquí aparece ya con el nombre nuevo.
  const { contacts: people, guests } = participantsOf(event, contacts)

  // Reunión provisional: opción de una propuesta pendiente.
  const proposal = isProvisional(event) ? proposals.find((p) => p.id === event.proposalId) : null
  const options = proposal ? optionsOf(proposal, rawEvents) : []
  const optionIndex = options.findIndex((o) => o.id === event.seriesId)

  const hasParticipants = people.length > 0 || guests.length > 0
  const organized = isNotAttending(event)

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

  const handleRestore = () => {
    if (!window.confirm('¿Quitar los cambios de este día y dejarlo como el resto de la serie?')) return
    onRestoreOccurrence(event)
  }

  // App pide la confirmación (o, en una serie, a qué días se aplica) y dice si se ha borrado.
  const handleDelete = async () => {
    setDeleting(true)
    setDeleteError(null)
    try {
      if (await onDelete(event)) onClose()
      else setDeleting(false)
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
            {eventTitle(event)}
          </h2>
          {proposal && (
            <p className="event-modal-provisional">
              <span className="event-modal-provisional-badge">Provisional</span>
              Opción {optionIndex + 1} de {options.length} de una propuesta pendiente
            </p>
          )}
          {organized && (
            <p className="event-modal-organized">
              <span className="organized-badge">{NOT_ATTENDING_LABEL}</span>
              No asistes: no cuenta como tiempo tuyo.
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
          {event.isException && (
            <p className="event-modal-exception">
              <span className="event-modal-exception-badge">Cambiado solo este día</span>
              <button type="button" className="event-modal-exception-restore" onClick={handleRestore}>
                <Undo2 size={13} strokeWidth={1.75} />
                Volver a como era en la serie
              </button>
            </p>
          )}
        </div>

        <div className="event-modal-body">
          {event.isUnavailable && isMarkedDayOff(event) && (
            <div className="event-modal-row">
              <UnavailableIcon event={event} size={16} />
              <span>{kindLabel(unavailableKindOf(event))}</span>
            </div>
          )}

          {!event.isUnavailable && isInterview(event) && (
            <div className="event-modal-row">
              <Briefcase size={16} strokeWidth={1.75} />
              <span>Entrevista de candidato</span>
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

          {hasParticipants && (
            <div className="event-modal-row align-top">
              <Users size={16} strokeWidth={1.75} />
              <div className="event-modal-participants-block">
                <ParticipantList
                  item={event}
                  contacts={contacts}
                  start={event.allDay ? null : event.start}
                  end={event.allDay ? null : event.end}
                  onOpenContact={onOpenContact}
                  className="event-modal-participants"
                  extra={(entry) => (
                    <>
                      {entry.contact ? (
                        entry.contact.email && (
                          <a href={`mailto:${entry.contact.email}`} className="event-modal-attendee-email">
                            {entry.contact.email}
                          </a>
                        )
                      ) : savingGuest === entry.guest ? (
                        <ContactCountryStep
                          name={entry.guest}
                          confirmLabel="Guardar contacto"
                          onCancel={() => setSavingGuest(null)}
                          onConfirm={(zone) => {
                            onSaveGuestAsContact(event, entry.guest, zone)
                            setSavingGuest(null)
                          }}
                        />
                      ) : (
                        <button type="button" className="event-modal-save-guest" onClick={() => setSavingGuest(entry.guest)}>
                          <UserPlus size={13} strokeWidth={1.75} />
                          Guardar como contacto
                        </button>
                      )}
                    </>
                  )}
                />
              </div>
            </div>
          )}

          {event.description && (
            <div className="event-modal-description">
              <p>{event.description}</p>
            </div>
          )}

          {!event.isUnavailable && pendingTasks.length > 0 && (
            <section className="meeting-pending-tasks" aria-labelledby="meeting-pending-tasks-title">
              <h3 id="meeting-pending-tasks-title">
                <ListTodo size={15} strokeWidth={1.75} />
                Tareas pendientes ({pendingTasks.length})
              </h3>
              <p>De los participantes y las tuyas de reuniones anteriores con ellos.</p>
              <ul className="task-list">
                {pendingTasks.map((task) => (
                  <TaskItem
                    key={task.id}
                    task={task}
                    contacts={contacts}
                    today={today}
                    onToggle={onToggleTask}
                    onOpen={onOpenTask}
                    onOpenSource={onOpenTaskSource}
                    sourceExists={!task.source || !!sourceOccurrence(task, rawEvents)}
                  />
                ))}
              </ul>
            </section>
          )}

          {!event.isUnavailable && (
            <MeetingSession
              event={event}
              now={now}
              focusNotes={focusNotes}
              onSave={(changes) => onSaveSession(event, changes)}
              tasks={tasks}
              sessionTasks={tasksOfSession(tasks, event)}
              contacts={contacts}
              today={today}
              onNewTask={onNewTask}
              onOpenTask={onOpenTask}
              onToggleTask={onToggleTask}
              organizerName={organizerName}
            />
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

          {!proposal && organized && hasParticipants && (
            <button type="button" className="event-modal-action-btn primary event-modal-convocation-btn" onClick={() => setConvocationOpen(true)}>
              <Megaphone size={14} strokeWidth={1.75} />
              Mensaje de convocatoria
            </button>
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

      {convocationOpen && organized && (
        <ConvocationModal occurrence={event} contacts={contacts} onClose={() => setConvocationOpen(false)} />
      )}
    </div>
  )
}
