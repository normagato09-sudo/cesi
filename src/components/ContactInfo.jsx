import { useMemo } from 'react'
import { addYears, format } from 'date-fns'
import { es } from 'date-fns/locale'
import { Briefcase, Building2, CalendarClock, ChevronRight, Globe, Link2, Mail, Phone, StickyNote } from 'lucide-react'
import { useMinuteClock } from '../hooks/useMinuteClock'
import { contactOccurrences, contactSeries } from '../lib/contacts'
import { availabilityLines, availabilityZoneNote, hasAvailability } from '../lib/contactAvailability'
import { expandEvents } from '../lib/recurrence'
import { colorForEvent } from '../lib/eventStyle'
import { notesOf, notesPreview } from '../lib/notes'
import { groupsOfContact } from '../lib/groups'
import LinkList from './LinkList.jsx'
import { ParticipantList } from './Participant.jsx'
import { SPAIN_ZONE, countryFlag, formatOffsetDiff, formatTimeInZone, zoneLabel, zoneOffsetMinutes } from '../lib/timezones'
import './ContactsView.css'

// Partes de la ficha de un contacto que comparten Contactos, Equipo y Vacantes.

// "Estados Unidos: Nueva York · ahora 04:32 (−6 h respecto a España)"
function zoneSummary(timeZone, now) {
  const diff = zoneOffsetMinutes(now, timeZone) - zoneOffsetMinutes(now, SPAIN_ZONE)
  const diffText = diff === 0 ? 'misma hora que España' : `${formatOffsetDiff(diff)} respecto a España`
  return `${zoneLabel(timeZone)} · ahora ${formatTimeInZone(now, timeZone)} (${diffText})`
}

// Hora actual del contacto, que cambia en cuanto empieza cada minuto.
function LiveZoneSummary({ timeZone }) {
  const now = useMinuteClock()
  return zoneSummary(timeZone, now)
}

const MAX_LISTED_MEETINGS = 5

function formatMeetingDate(event) {
  return format(event.start, "EEE d MMM yyyy · HH:mm", { locale: es })
}

export function GroupChips({ contact, groups }) {
  const list = groupsOfContact(contact, groups)
  if (list.length === 0) return null
  return (
    <span className="group-chips">
      {list.map((g) => (
        <span key={g.id} className="group-chip" style={{ '--group-color': g.color }}>
          {g.name}
        </span>
      ))}
    </span>
  )
}

function MeetingList({ title, meetings, contacts, emptyText, onOpenEvent, showNotes = false }) {
  return (
    <section className="contact-meetings">
      <h3>{title}</h3>
      {meetings.length === 0 ? (
        <p className="contact-meetings-empty">{emptyText}</p>
      ) : (
        <ul>
          {meetings.map((ev) => (
            <li key={ev.id}>
              <button type="button" className="contact-meeting" onClick={() => onOpenEvent(ev)}>
                <span className="contact-meeting-dot" style={{ background: colorForEvent(ev) }} />
                <span className="contact-meeting-text">
                  <span className="contact-meeting-title">{ev.title}</span>
                  <span className="contact-meeting-date">
                    {formatMeetingDate(ev)}
                    {ev.provisional && ' · Provisional'}
                  </span>
                  <ParticipantList item={ev} contacts={contacts} start={ev.start} end={ev.end} size="compact" />
                  {showNotes && !ev.provisional && (
                    <span className={`contact-meeting-notes${notesOf(ev).trim() ? '' : ' empty'}`}>
                      {notesPreview(notesOf(ev), 90) || 'Sin notas'}
                    </span>
                  )}
                </span>
                <ChevronRight size={16} strokeWidth={1.75} />
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}

// Datos del contacto: email, teléfono, organización, cargo, zona horaria, notas y disponibilidad.
// `skip`: campos que no se muestran (p. ej. en Equipo, el email y el teléfono ya se ven arriba).
export function ContactFields({ contact, skip = [] }) {
  return (
    <dl className="contact-fields">
      {contact.email && !skip.includes('email') && (
        <div>
          <dt><Mail size={15} strokeWidth={1.75} /><span className="sr-only">Email</span></dt>
          <dd><a href={`mailto:${contact.email}`}>{contact.email}</a></dd>
        </div>
      )}
      {contact.phone && !skip.includes('phone') && (
        <div>
          <dt><Phone size={15} strokeWidth={1.75} /><span className="sr-only">Teléfono</span></dt>
          <dd><a href={`tel:${contact.phone.replace(/\s+/g, '')}`}>{contact.phone}</a></dd>
        </div>
      )}
      {contact.organization && (
        <div>
          <dt><Building2 size={15} strokeWidth={1.75} /><span className="sr-only">Organización</span></dt>
          <dd>{contact.organization}</dd>
        </div>
      )}
      {contact.role && !skip.includes('role') && (
        <div>
          <dt><Briefcase size={15} strokeWidth={1.75} /><span className="sr-only">Cargo</span></dt>
          <dd>{contact.role}</dd>
        </div>
      )}
      {contact.timeZone && (
        <div>
          <dt><Globe size={15} strokeWidth={1.75} /><span className="sr-only">Zona horaria</span></dt>
          <dd>
            {contact.country && contact.country !== 'ES' && `${countryFlag(contact.country)} `}
            <LiveZoneSummary timeZone={contact.timeZone} />
            {contact.countryUnreviewed && (
              <span className="contact-unreviewed-note">
                País sin revisar: se asignó España automáticamente. Edita el contacto para confirmarlo.
              </span>
            )}
          </dd>
        </div>
      )}
      {(contact.links || []).length > 0 && !skip.includes('links') && (
        <div className="align-top">
          <dt><Link2 size={15} strokeWidth={1.75} /><span className="sr-only">Enlaces</span></dt>
          <dd className="contact-links">
            <LinkList links={contact.links} />
          </dd>
        </div>
      )}
      {contact.notes && (
        <div className="align-top">
          <dt><StickyNote size={15} strokeWidth={1.75} /><span className="sr-only">Notas</span></dt>
          <dd className="contact-notes">{contact.notes}</dd>
        </div>
      )}
      {hasAvailability(contact) && (
        <div className="align-top">
          <dt><CalendarClock size={15} strokeWidth={1.75} /><span className="sr-only">Disponibilidad habitual</span></dt>
          <dd>
            <span className="contact-availability-title">
              Disponibilidad habitual ({availabilityZoneNote(contact)})
            </span>
            <ul className="contact-availability">
              {availabilityLines(contact).map((line) => (
                <li key={line}>{line}</li>
              ))}
            </ul>
          </dd>
        </div>
      )}
    </dl>
  )
}

// Próximas reuniones y reuniones anteriores (con el principio de sus notas).
export function ContactMeetings({ contact, contacts, rawEvents, now, onOpenEvent }) {
  const { upcoming, past } = useMemo(() => {
    const series = contactSeries(contact, rawEvents, contacts)
    if (series.length === 0) return { upcoming: [], past: [] }
    const upcomingList = contactOccurrences(contact, expandEvents(series, now, addYears(now, 2)), contacts)
      .sort((a, b) => a.start - b.start)
      .slice(0, MAX_LISTED_MEETINGS)
    const pastList = contactOccurrences(contact, expandEvents(series, new Date(0), now), contacts)
      .filter((ev) => ev.end <= now)
      .sort((a, b) => b.start - a.start)
      .slice(0, MAX_LISTED_MEETINGS)
    return { upcoming: upcomingList, past: pastList }
  }, [contact, rawEvents, contacts, now])

  return (
    <>
      <MeetingList
        title="Próximas reuniones"
        meetings={upcoming}
        contacts={contacts}
        emptyText="No hay reuniones programadas con este contacto."
        onOpenEvent={onOpenEvent}
      />
      <MeetingList
        title="Reuniones anteriores"
        meetings={past}
        contacts={contacts}
        emptyText="Todavía no habéis tenido ninguna reunión."
        onOpenEvent={onOpenEvent}
        showNotes
      />
    </>
  )
}
