import { format } from 'date-fns'
import { es } from 'date-fns/locale'
import { Briefcase, CalendarCheck, CalendarDays, Check, ChevronRight, ListTodo, NotebookPen, Send, X } from 'lucide-react'
import TaskItem from './TaskItem.jsx'
import { colorForEvent } from '../lib/eventStyle'
import {
  dueTasks,
  greeting,
  hasAgenda,
  meetingsTodayAndTomorrow,
  openVacancies,
  participantsLine,
  upcomingInterviews,
  vacancyProgressText,
} from '../lib/home'
import { VACANCY_STATUS } from '../lib/vacancies'
import { matchContact, requestMinutes, requestVisitor } from '../lib/bookings'
import ArchivedNotice from './ArchivedNotice.jsx'
import { formatDurationLong } from '../lib/proposals'
import './Tasks.css'
import './HomeView.css'

const MAX_MISSING_NOTES = 5
const time = (date) => format(date, 'HH:mm')

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

// Fila de una reunión: (día y) hora, título, participantes y, si se pide, si tiene agenda preparada.
// `dimPast`: atenuarla si ya ha terminado (en la lista de hoy).
function MeetingRow({ event, contacts, now, showAgenda = true, showDay = false, dimPast = false, onOpen }) {
  const people = participantsLine(event, contacts)
  const when = showDay ? format(event.start, 'EEE d', { locale: es }) : null
  const past = dimPast && event.end <= now
  const agenda = hasAgenda(event)
  return (
    <li>
      <button
        type="button"
        className={`home-meeting${past ? ' past' : ''}`}
        style={{ '--event-color': colorForEvent(event) }}
        onClick={() => onOpen(event)}
      >
        <span className="home-meeting-time">
          {when && <span className="home-meeting-day">{when}</span>}
          {event.allDay ? 'Todo el día' : time(event.start)}
        </span>
        <span className="home-meeting-main">
          <span className="home-meeting-title">{event.title || 'Sin título'}</span>
          {people && <span className="home-meeting-people">{people}</span>}
        </span>
        {showAgenda && (
          <span className={`home-agenda${agenda ? ' ready' : ''}`}>{agenda ? 'Agenda lista' : 'Sin agenda'}</span>
        )}
      </button>
    </li>
  )
}

function MeetingList({ title, meetings, empty, ...rowProps }) {
  return (
    <div className="home-group">
      <h3>{title}</h3>
      {meetings.length === 0 ? (
        <Empty>{empty}</Empty>
      ) : (
        <ul className="home-list">
          {meetings.map((ev) => (
            <MeetingRow key={ev.id} event={ev} {...rowProps} />
          ))}
        </ul>
      )}
    </div>
  )
}

function TaskGroup({ title, tasks, className = '', ...itemProps }) {
  if (tasks.length === 0) return null
  return (
    <div className={`home-group ${className}`}>
      <h3>{title}</h3>
      <ul className="task-list">
        {tasks.map((task) => (
          <TaskItem key={task.id} task={task} showSource={false} {...itemProps} />
        ))}
      </ul>
    </div>
  )
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
 * Inicio: lo primero que se ve al abrir la app. Reuniones de hoy y mañana, tareas que vencen,
 * reuniones sin acta, entrevistas y vacantes, y propuestas pendientes. Cada bloque lleva a su sección.
 */
export default function HomeView({
  now,
  today,
  rawEvents,
  contacts,
  tasks,
  vacancies,
  proposals,
  missingNotes,
  onGoTo,
  onOpenEvent,
  onOpenEventNotes,
  onToggleTask,
  onOpenTask,
  onOpenVacancy,
  onOpenProposal,
  // Enlace de reservas (solo con la sincronización configurada): null si no se usa.
  bookings = null,
}) {
  const meetings = meetingsTodayAndTomorrow(rawEvents, now)
  const due = dueTasks(tasks, today)
  const interviews = upcomingInterviews(rawEvents, now)
  const openings = openVacancies(vacancies, contacts)
  const dueCount = due.overdue.length + due.today.length + due.upcoming.length
  const shownNotes = missingNotes.slice(0, MAX_MISSING_NOTES)
  const dateText = format(now, "EEEE, d 'de' MMMM 'de' yyyy", { locale: es })
  const taskProps = { contacts, today, onToggle: onToggleTask, onOpen: onOpenTask }

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

        <HomeCard
          Icon={CalendarDays}
          title="Reuniones"
          count={meetings.today.length}
          linkLabel="Calendario"
          onLink={() => onGoTo('calendar')}
        >
          <MeetingList title="Hoy" meetings={meetings.today} empty="Hoy no tienes reuniones." contacts={contacts} now={now} dimPast onOpen={onOpenEvent} />
          <MeetingList title="Mañana" meetings={meetings.tomorrow} empty="Mañana, sin reuniones." contacts={contacts} now={now} onOpen={onOpenEvent} />
        </HomeCard>

        <HomeCard Icon={ListTodo} title="Tareas" count={dueCount} linkLabel="Ver todas" onLink={() => onGoTo('tasks')}>
          {due.overdue.length === 0 && <Empty>Nada vencido 👌</Empty>}
          <TaskGroup title="Vencidas" tasks={due.overdue} className="overdue" {...taskProps} />
          <TaskGroup title="Para hoy" tasks={due.today} {...taskProps} />
          <TaskGroup title="Próximos 7 días" tasks={due.upcoming} {...taskProps} />
          {due.today.length === 0 && due.upcoming.length === 0 && <Empty>Nada más con fecha esta semana.</Empty>}
        </HomeCard>

        <HomeCard
          Icon={NotebookPen}
          title="Sin acta"
          count={missingNotes.length}
          linkLabel="Calendario"
          onLink={() => onGoTo('calendar')}
        >
          {missingNotes.length === 0 ? (
            <Empty>Todas las actas de los últimos 7 días al día 👌</Empty>
          ) : (
            <>
              <ul className="home-list">
                {shownNotes.map((ev) => (
                  <MeetingRow
                    key={ev.id}
                    event={ev}
                    contacts={contacts}
                    now={now}
                    showAgenda={false}
                    showDay
                    onOpen={onOpenEventNotes}
                  />
                ))}
              </ul>
              {missingNotes.length > shownNotes.length && (
                <p className="home-more">y {missingNotes.length - shownNotes.length} más</p>
              )}
            </>
          )}
        </HomeCard>

        <HomeCard
          Icon={Briefcase}
          title="Entrevistas y vacantes"
          count={interviews.length}
          linkLabel="Equipo"
          onLink={() => onGoTo('team')}
        >
          <MeetingList
            title="Próximas entrevistas"
            meetings={interviews}
            empty="Sin entrevistas en los próximos 14 días."
            contacts={contacts}
            now={now}
            showAgenda={false}
            showDay
            onOpen={onOpenEvent}
          />
          <div className="home-group">
            <h3>Vacantes abiertas</h3>
            {openings.length === 0 ? (
              <Empty>No hay vacantes abiertas.</Empty>
            ) : (
              <ul className="home-list">
                {openings.map((item) => (
                  <li key={item.vacancy.id}>
                    <button type="button" className="home-vacancy" onClick={() => onOpenVacancy(item.vacancy.id)}>
                      <span className="home-meeting-main">
                        <span className="home-meeting-title">{item.vacancy.title || 'Sin título'}</span>
                        <span className="home-meeting-people">{vacancyProgressText(item)}</span>
                      </span>
                      <span className={`home-vacancy-status ${item.vacancy.status}`}>{VACANCY_STATUS[item.vacancy.status] || ''}</span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </HomeCard>

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
