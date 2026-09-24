import { useMemo, useState } from 'react'
import { format, parseISO } from 'date-fns'
import { es } from 'date-fns/locale'
import {
  ArrowLeft,
  CalendarPlus,
  ExternalLink,
  Mail,
  Pencil,
  Phone,
  Search,
  UserMinus,
  Building2,
  UserRound,
  UsersRound,
} from 'lucide-react'
import ContactAvatar from './ContactAvatar.jsx'
import TeamProfileModal from './TeamProfileModal.jsx'
import CvLink from './CvLink.jsx'
import { ContactFields, ContactMeetings, GroupChips } from './ContactInfo.jsx'
import { SOCIAL_NETWORKS, capitalize, filterMembers, isTeamMember, linkUrl, seniorityText, socialUrl, sortMilestones } from '../lib/team'
import './TeamView.css'

function formatDay(key) {
  if (!key) return ''
  return format(parseISO(key), "d 'de' MMMM 'de' yyyy", { locale: es })
}

function roleLine(profile) {
  return [profile.role, profile.area].filter(Boolean).join(' · ')
}

function MemberCard({ contact, now, onOpen }) {
  const p = contact.teamProfile
  const seniority = seniorityText(p.joinedAt, now, p.status === 'former' ? p.leftAt : null)
  return (
    <li>
      <button type="button" className="team-card" onClick={() => onOpen(contact.id)}>
        <ContactAvatar name={contact.name} photo={contact.photo} size="xl" />
        <span className="team-card-name">{contact.name}</span>
        {p.role && <span className="team-card-role">{p.role}</span>}
        {p.area && <span className="team-card-area">{p.area}</span>}
        {seniority && <span className="team-card-seniority">{capitalize(seniority)}</span>}
      </button>
    </li>
  )
}

function MemberDetail({ contact, contacts, groups, rawEvents, now, onBack, onEdit, onRemove, onOpenEvent, onFindSlot, onNewMeeting, onOpenContact }) {
  const p = contact.teamProfile
  const seniority = seniorityText(p.joinedAt, now, p.status === 'former' ? p.leftAt : null)
  const milestones = sortMilestones(p.milestones)
  const socials = SOCIAL_NETWORKS.filter((n) => p.social?.[n.key])
  const links = (p.links || []).filter((l) => l.url)

  return (
    <div className="team-detail">
      <button type="button" className="contact-back-btn team-back" onClick={onBack}>
        <ArrowLeft size={16} strokeWidth={1.75} />
        Equipo
      </button>

      <div className="team-detail-hero">
        <ContactAvatar name={contact.name} photo={contact.photo} size="xl" />
        <div className="team-detail-hero-text">
          <h2>{contact.name}</h2>
          {roleLine(p) && <p className="team-detail-role">{roleLine(p)}</p>}
          <p className="team-detail-seniority">
            {p.joinedAt && `Desde el ${formatDay(p.joinedAt)}`}
            {seniority && ` · ${seniority}`}
          </p>
          {p.status === 'former' && (
            <span className="team-former-badge">Antiguo miembro{p.leftAt ? ` · salió el ${formatDay(p.leftAt)}` : ''}</span>
          )}
          <GroupChips contact={contact} groups={groups} />
        </div>
      </div>

      <div className="contact-detail-actions">
        <button type="button" className="contact-action-btn primary" onClick={() => onFindSlot(contact)}>
          <Search size={14} strokeWidth={1.75} />
          Buscar hueco con esta persona
        </button>
        <button type="button" className="contact-action-btn" onClick={() => onNewMeeting(contact)}>
          <CalendarPlus size={14} strokeWidth={1.75} />
          Nueva reunión
        </button>
        <button type="button" className="contact-action-btn" onClick={onEdit}>
          <Pencil size={14} strokeWidth={1.75} />
          Editar perfil
        </button>
        <button type="button" className="contact-action-btn" onClick={() => onOpenContact(contact.id)}>
          <UserRound size={14} strokeWidth={1.75} />
          Ficha de contacto
        </button>
        <button type="button" className="contact-action-btn danger" onClick={onRemove}>
          <UserMinus size={14} strokeWidth={1.75} />
          Quitar del equipo
        </button>
      </div>

      <section className="team-section">
        <h3>Trayectoria</h3>
        {p.bio ? <p className="team-bio">{p.bio}</p> : <p className="team-empty">Todavía no has escrito su trayectoria.</p>}
      </section>

      <section className="team-section">
        <h3>Hitos</h3>
        {milestones.length === 0 ? (
          <p className="team-empty">Sin hitos todavía.</p>
        ) : (
          <ol className="team-timeline">
            {milestones.map((m) => (
              <li key={m.id}>
                <span className="team-timeline-date">{m.date ? formatDay(m.date) : 'Sin fecha'}</span>
                <span className="team-timeline-text">{m.text}</span>
              </li>
            ))}
          </ol>
        )}
      </section>

      <section className="team-section">
        <h3>Contacto</h3>
        <ul className="team-contact-list">
          {contact.email && (
            <li>
              <Mail size={15} strokeWidth={1.75} />
              <a href={`mailto:${contact.email}`}>{contact.email}</a>
            </li>
          )}
          {contact.phone && (
            <li>
              <Phone size={15} strokeWidth={1.75} />
              <a href={`tel:${contact.phone.replace(/\s+/g, '')}`}>{contact.phone}</a>
            </li>
          )}
          {socials.map((n) => (
            <li key={n.key}>
              <ExternalLink size={15} strokeWidth={1.75} />
              <span className="team-contact-label">{n.label}</span>
              <a href={socialUrl(n.key, p.social[n.key])} target="_blank" rel="noreferrer">
                {p.social[n.key]}
              </a>
            </li>
          ))}
          {links.map((l) => (
            <li key={l.id}>
              <ExternalLink size={15} strokeWidth={1.75} />
              {l.label && <span className="team-contact-label">{l.label}</span>}
              <a href={linkUrl(l.url)} target="_blank" rel="noreferrer">
                {l.url}
              </a>
            </li>
          ))}
          {p.cv && (
            <li>
              <CvLink cv={p.cv} />
            </li>
          )}
          {!contact.email && !contact.phone && socials.length === 0 && links.length === 0 && (
            <li className="team-empty">Sin datos de contacto.</li>
          )}
        </ul>
      </section>

      <section className="team-section">
        <h3>Datos del contacto</h3>
        <ContactFields contact={contact} skip={['email', 'phone', 'role']} />
      </section>

      <ContactMeetings contact={contact} contacts={contacts} rawEvents={rawEvents} now={now} onOpenEvent={onOpenEvent} />
    </div>
  )
}

export default function TeamView({
  contacts,
  groups,
  rawEvents,
  now,
  areas,
  selectedMemberId,
  onSelectMember,
  onSaveProfile,
  onRemoveFromTeam,
  onAddArea,
  onManageDepartments,
  onOpenEvent,
  onFindSlot,
  onNewMeeting,
  onOpenContact,
}) {
  const [query, setQuery] = useState('')
  const [area, setArea] = useState('')
  const [status, setStatus] = useState('active')
  const [editing, setEditing] = useState(false)

  const members = useMemo(() => filterMembers(contacts, { query, area, status }), [contacts, query, area, status])
  const counts = useMemo(() => {
    const all = contacts.filter(isTeamMember)
    const former = all.filter((c) => c.teamProfile.status === 'former').length
    return { active: all.length - former, former }
  }, [contacts])
  const selected = contacts.find((c) => c.id === selectedMemberId && isTeamMember(c)) || null

  if (selected) {
    return (
      <div className="team-view">
        <MemberDetail
          contact={selected}
          contacts={contacts}
          groups={groups}
          rawEvents={rawEvents}
          now={now}
          onBack={() => onSelectMember(null)}
          onEdit={() => setEditing(true)}
          onRemove={() => {
            if (window.confirm(`¿Quitar a ${selected.name} del equipo? Se borrará su perfil de equipo; el contacto y sus reuniones se conservan. Si ya no está en el equipo, mejor márcalo como antiguo miembro.`)) {
              onRemoveFromTeam(selected.id)
              onSelectMember(null)
            }
          }}
          onOpenEvent={onOpenEvent}
          onFindSlot={onFindSlot}
          onNewMeeting={onNewMeeting}
          onOpenContact={onOpenContact}
        />
        {editing && (
          <TeamProfileModal
            contact={selected}
            areas={areas}
            onAddArea={onAddArea}
            onSave={(data) => {
              onSaveProfile(selected.id, data)
              setEditing(false)
            }}
            onClose={() => setEditing(false)}
          />
        )}
      </div>
    )
  }

  return (
    <div className="team-view">
      <div className="team-header">
        <h1 className="contacts-title">Equipo</h1>
        <div className="team-filters">
          <label className="contacts-search">
            <Search size={15} strokeWidth={1.75} />
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Buscar por nombre, cargo, departamento..."
              aria-label="Buscar en el equipo"
            />
          </label>
          <select className="team-area-filter" value={area} onChange={(e) => setArea(e.target.value)} aria-label="Filtrar por departamento">
            <option value="">Todos los departamentos</option>
            {areas.map((a) => (
              <option key={a} value={a}>
                {a}
              </option>
            ))}
          </select>
          <button type="button" className="departments-btn" onClick={onManageDepartments} title="Añadir, renombrar, ordenar o borrar departamentos">
            <Building2 size={14} strokeWidth={1.75} />
            Departamentos
          </button>
          <div className="view-switch team-status-switch" role="group" aria-label="Estado">
            <button type="button" className={`view-switch-btn ${status === 'active' ? 'active' : ''}`} onClick={() => setStatus('active')}>
              Activos ({counts.active})
            </button>
            <button type="button" className={`view-switch-btn ${status === 'former' ? 'active' : ''}`} onClick={() => setStatus('former')}>
              Antiguos ({counts.former})
            </button>
          </div>
        </div>
      </div>

      {counts.active + counts.former === 0 ? (
        <div className="contacts-empty team-empty-state">
          <UsersRound size={32} strokeWidth={1.5} />
          <p className="contacts-empty-title">Todavía no hay nadie en el equipo</p>
          <p>Abre un contacto en Contactos y pulsa «Marcar como miembro del equipo» para crear su perfil.</p>
        </div>
      ) : members.length === 0 ? (
        <div className="contacts-empty team-empty-state">
          <p>{status === 'former' ? 'No hay antiguos miembros' : 'No hay miembros activos'} que coincidan con la búsqueda.</p>
        </div>
      ) : (
        <ul className="team-grid">
          {members.map((c) => (
            <MemberCard key={c.id} contact={c} now={now} onOpen={onSelectMember} />
          ))}
        </ul>
      )}
    </div>
  )
}
