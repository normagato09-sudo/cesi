import { useMemo, useState } from 'react'
import { addYears, format } from 'date-fns'
import { es } from 'date-fns/locale'
import {
  ArrowLeft,
  Briefcase,
  Building2,
  CalendarClock,
  CalendarPlus,
  ChevronRight,
  Globe,
  Mail,
  Pencil,
  Phone,
  Search,
  StickyNote,
  Trash2,
  UserPlus,
  Users,
} from 'lucide-react'
import ContactFormModal from './ContactFormModal.jsx'
import ContactAvatar from './ContactAvatar.jsx'
import { contactMatches, eventIncludesContact } from '../lib/contacts'
import { availabilityLines, availabilityZoneNote, hasAvailability } from '../lib/contactAvailability'
import { expandEvents } from '../lib/recurrence'
import { colorForEvent } from '../lib/eventStyle'
import { SPAIN_ZONE, formatOffsetDiff, formatTimeInZone, zoneLabel, zoneOffsetMinutes } from '../lib/timezones'
import './ContactsView.css'

// "Estados Unidos: Nueva York · ahora 04:32 (−6 h respecto a España)"
function zoneSummary(timeZone, now) {
  const diff = zoneOffsetMinutes(now, timeZone) - zoneOffsetMinutes(now, SPAIN_ZONE)
  const diffText = diff === 0 ? 'misma hora que España' : `${formatOffsetDiff(diff)} respecto a España`
  return `${zoneLabel(timeZone)} · ahora ${formatTimeInZone(now, timeZone)} (${diffText})`
}

const MAX_LISTED_MEETINGS = 5

function subtitleOf(contact) {
  return [contact.role, contact.organization].filter(Boolean).join(' · ')
}

function formatMeetingDate(event) {
  return format(event.start, "EEE d MMM yyyy · HH:mm", { locale: es })
}

function MeetingList({ title, meetings, emptyText, onOpenEvent }) {
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
                  <span className="contact-meeting-date">{formatMeetingDate(ev)}</span>
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

export default function ContactsView({
  contacts,
  rawEvents,
  now,
  selectedContactId,
  onSelectContact,
  onAddContact,
  onEditContact,
  onRemoveContact,
  onOpenEvent,
  onNewMeetingWithContact,
  onFindSlotWithContact,
}) {
  const [query, setQuery] = useState('')
  const [formModal, setFormModal] = useState(null)

  const filtered = useMemo(() => contacts.filter((c) => contactMatches(c, query)), [contacts, query])
  const selected = contacts.find((c) => c.id === selectedContactId) || null

  // Series (eventos originales) en las que participa el contacto seleccionado.
  const series = useMemo(
    () => (selected ? rawEvents.filter((ev) => !ev.isUnavailable && eventIncludesContact(ev, selected, contacts)) : []),
    [selected, rawEvents, contacts],
  )

  const { upcoming, past } = useMemo(() => {
    if (series.length === 0) return { upcoming: [], past: [] }
    const upcomingList = expandEvents(series, now, addYears(now, 2))
      .sort((a, b) => a.start - b.start)
      .slice(0, MAX_LISTED_MEETINGS)
    const pastList = expandEvents(series, new Date(0), now)
      .filter((ev) => ev.end <= now)
      .sort((a, b) => b.start - a.start)
      .slice(0, MAX_LISTED_MEETINGS)
    return { upcoming: upcomingList, past: pastList }
  }, [series, now])

  const handleFormSubmit = async (values) => {
    if (formModal?.contact) {
      onEditContact(formModal.contact.id, values)
    } else {
      const created = onAddContact(values)
      onSelectContact(created.id)
    }
  }

  const handleDelete = () => {
    const count = series.length
    const usage =
      count === 0
        ? 'No aparece en ninguna reunión.'
        : `Aparece en ${count} ${count === 1 ? 'reunión' : 'reuniones'}; las reuniones se conservarán.`
    if (!window.confirm(`¿Eliminar a ${selected.name}? ${usage}`)) return
    onRemoveContact(selected.id)
    onSelectContact(null)
  }

  return (
    <div className={`contacts-view${selected ? ' has-selection' : ''}`}>
      <div className="contacts-list-pane">
        <div className="contacts-header">
          <h1 className="contacts-title">Contactos</h1>
          <div className="contacts-header-actions">
            <label className="contacts-search">
              <Search size={15} strokeWidth={1.75} />
              <input
                type="search"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Buscar por nombre, email, empresa..."
                aria-label="Buscar contactos"
              />
            </label>
            <button
              type="button"
              className="contacts-new-btn"
              onClick={() => setFormModal({ contact: null })}
              aria-label="Nuevo contacto"
              title="Nuevo contacto"
            >
              <UserPlus size={15} strokeWidth={1.75} />
              <span>Nuevo contacto</span>
            </button>
          </div>
        </div>

        {contacts.length === 0 ? (
          <div className="contacts-empty">
            <Users size={32} strokeWidth={1.5} />
            <p className="contacts-empty-title">Todavía no tienes contactos</p>
            <p>Guarda aquí a las personas con las que te reúnes para tener a mano su email, teléfono y vuestras reuniones.</p>
            <button type="button" className="contacts-new-btn" onClick={() => setFormModal({ contact: null })}>
              <UserPlus size={15} strokeWidth={1.75} />
              <span>Crear mi primer contacto</span>
            </button>
          </div>
        ) : filtered.length === 0 ? (
          <div className="contacts-empty">
            <p>No hay contactos que coincidan con «{query}».</p>
          </div>
        ) : (
          <ul className="contacts-list">
            {filtered.map((c) => (
              <li key={c.id} className={`contact-row${c.id === selectedContactId ? ' active' : ''}`}>
                <button type="button" className="contact-row-main" onClick={() => onSelectContact(c.id)}>
                  <ContactAvatar name={c.name} />
                  <span className="contact-row-text">
                    <span className="contact-row-name">{c.name}</span>
                    {subtitleOf(c) && <span className="contact-row-sub">{subtitleOf(c)}</span>}
                  </span>
                </button>
                {(c.email || c.phone) && (
                  <div className="contact-row-links">
                    {c.email && (
                      <a href={`mailto:${c.email}`} title={c.email}>
                        <Mail size={13} strokeWidth={1.75} />
                        <span>{c.email}</span>
                      </a>
                    )}
                    {c.phone && (
                      <a href={`tel:${c.phone.replace(/\s+/g, '')}`} title={c.phone}>
                        <Phone size={13} strokeWidth={1.75} />
                        <span>{c.phone}</span>
                      </a>
                    )}
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="contacts-detail-pane">
        {!selected ? (
          <div className="contacts-empty">
            <p>Selecciona un contacto para ver su ficha.</p>
          </div>
        ) : (
          <div className="contact-detail">
            <button type="button" className="contact-back-btn" onClick={() => onSelectContact(null)}>
              <ArrowLeft size={16} strokeWidth={1.75} />
              Contactos
            </button>

            <div className="contact-detail-head">
              <ContactAvatar name={selected.name} size="lg" />
              <div>
                <h2>{selected.name}</h2>
                {subtitleOf(selected) && <p>{subtitleOf(selected)}</p>}
              </div>
            </div>

            <div className="contact-detail-actions">
              <button type="button" className="contact-action-btn primary" onClick={() => onNewMeetingWithContact(selected)}>
                <CalendarPlus size={14} strokeWidth={1.75} />
                Nueva reunión con este contacto
              </button>
              <button type="button" className="contact-action-btn wide" onClick={() => onFindSlotWithContact(selected)}>
                <Search size={14} strokeWidth={1.75} />
                Buscar hueco con este contacto
              </button>
              <button type="button" className="contact-action-btn" onClick={() => setFormModal({ contact: selected })}>
                <Pencil size={14} strokeWidth={1.75} />
                Editar
              </button>
              <button type="button" className="contact-action-btn danger" onClick={handleDelete}>
                <Trash2 size={14} strokeWidth={1.75} />
                Eliminar
              </button>
            </div>

            <dl className="contact-fields">
              {selected.email && (
                <div>
                  <dt><Mail size={15} strokeWidth={1.75} /><span className="sr-only">Email</span></dt>
                  <dd><a href={`mailto:${selected.email}`}>{selected.email}</a></dd>
                </div>
              )}
              {selected.phone && (
                <div>
                  <dt><Phone size={15} strokeWidth={1.75} /><span className="sr-only">Teléfono</span></dt>
                  <dd><a href={`tel:${selected.phone.replace(/\s+/g, '')}`}>{selected.phone}</a></dd>
                </div>
              )}
              {selected.organization && (
                <div>
                  <dt><Building2 size={15} strokeWidth={1.75} /><span className="sr-only">Organización</span></dt>
                  <dd>{selected.organization}</dd>
                </div>
              )}
              {selected.role && (
                <div>
                  <dt><Briefcase size={15} strokeWidth={1.75} /><span className="sr-only">Cargo</span></dt>
                  <dd>{selected.role}</dd>
                </div>
              )}
              {selected.timeZone && (
                <div>
                  <dt><Globe size={15} strokeWidth={1.75} /><span className="sr-only">Zona horaria</span></dt>
                  <dd>{zoneSummary(selected.timeZone, now)}</dd>
                </div>
              )}
              {selected.notes && (
                <div className="align-top">
                  <dt><StickyNote size={15} strokeWidth={1.75} /><span className="sr-only">Notas</span></dt>
                  <dd className="contact-notes">{selected.notes}</dd>
                </div>
              )}
              {hasAvailability(selected) && (
                <div className="align-top">
                  <dt><CalendarClock size={15} strokeWidth={1.75} /><span className="sr-only">Disponibilidad habitual</span></dt>
                  <dd>
                    <span className="contact-availability-title">
                      Disponibilidad habitual ({availabilityZoneNote(selected)})
                    </span>
                    <ul className="contact-availability">
                      {availabilityLines(selected).map((line) => (
                        <li key={line}>{line}</li>
                      ))}
                    </ul>
                  </dd>
                </div>
              )}
            </dl>

            <MeetingList
              title="Próximas reuniones"
              meetings={upcoming}
              emptyText="No hay reuniones programadas con este contacto."
              onOpenEvent={onOpenEvent}
            />
            <MeetingList
              title="Reuniones anteriores"
              meetings={past}
              emptyText="Todavía no habéis tenido ninguna reunión."
              onOpenEvent={onOpenEvent}
            />
          </div>
        )}
      </div>

      {formModal && (
        <ContactFormModal initialContact={formModal.contact} onClose={() => setFormModal(null)} onSubmit={handleFormSubmit} />
      )}
    </div>
  )
}
