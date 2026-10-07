import { useMemo, useState } from 'react'
import {
  ArrowLeft,
  CalendarPlus,
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
import LinkList from './LinkList.jsx'
import TeamTrajectory from './TeamTrajectory.jsx'
import { MEMBER_SORTS, filterMembers, isActiveMember, milestonesToBio, quoteDisplay } from '../lib/team'
import { FORMER_GROUP_NAME, formerReview } from '../lib/formerMembers'
import { currentRoles, dayLong, roleLabel, tenure, tenureText, withRoles } from '../lib/trajectory'
import { migrateProfileLinks } from '../lib/links'
import './TeamView.css'

// Sus roles actuales ("Moderadora · Moderación / Técnico"), o el principal si ya no tiene ninguno.
function roleLine(profile) {
  const current = currentRoles(profile).map(roleLabel).filter(Boolean)
  return current.length > 0 ? current.join(' / ') : [profile.role, profile.area].filter(Boolean).join(' · ')
}

function MemberCard({ contact, now, onOpen }) {
  const p = contact.teamProfile
  const seniority = tenureText(tenure(p, now))
  return (
    <li>
      <button type="button" className="team-card" onClick={() => onOpen(contact.id)}>
        <ContactAvatar name={contact.name} photo={contact.photo} size="xl" />
        <span className="team-card-name">{contact.name}</span>
        {p.role && <span className="team-card-role">{p.role}</span>}
        {quoteDisplay(p.quote) && (
          <span className="team-card-quote" title={quoteDisplay(p.quote)}>
            {quoteDisplay(p.quote)}
          </span>
        )}
        {p.area && <span className="team-card-area">{p.area}</span>}
        {seniority && <span className="team-card-seniority">{seniority}</span>}
      </button>
    </li>
  )
}

function MemberDetail({
  contact,
  contacts,
  groups,
  rawEvents,
  now,
  areas,
  onBack,
  onEdit,
  onRemove,
  onSaveRoles,
  onOpenEvent,
  onFindSlot,
  onNewMeeting,
  onOpenContact,
}) {
  const p = milestonesToBio(contact.teamProfile)
  const seniority = tenureText(tenure(p, now))
  const links = (migrateProfileLinks(p).links || []).filter((l) => l.url)

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
          {quoteDisplay(p.quote) && <p className="team-detail-quote">{quoteDisplay(p.quote)}</p>}
          {roleLine(p) && <p className="team-detail-role">{roleLine(p)}</p>}
          {seniority && <p className="team-detail-seniority">{seniority}</p>}
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

      <TeamTrajectory profile={p} now={now} areas={areas} joinedAt={p.joinedAt || ''} onChange={onSaveRoles} />

      <section className="team-section">
        <h3>Sobre esta persona</h3>
        {p.bio ? <p className="team-bio">{p.bio}</p> : <p className="team-empty">Todavía no has escrito nada sobre esta persona.</p>}
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
          {p.cv && (
            <li>
              <CvLink cv={p.cv} />
            </li>
          )}
          {!contact.email && !contact.phone && links.length === 0 && !p.cv && (
            <li className="team-empty">Sin datos de contacto.</li>
          )}
        </ul>
        {links.length > 0 && (
          <div className="team-links">
            <LinkList links={links} />
          </div>
        )}
      </section>

      <section className="team-section">
        <h3>Datos del contacto</h3>
        <ContactFields contact={contact} skip={['email', 'phone', 'role', 'links']} />
      </section>

      <ContactMeetings contact={contact} contacts={contacts} rawEvents={rawEvents} now={now} onOpenEvent={onOpenEvent} />
    </div>
  )
}

/**
 * Aviso para ordenar a los antiguos miembros: los que aún no están en el grupo «Antiguos miembros»
 * (se añaden todos de una vez o se descarta uno) y, aparte, los activos con todos sus roles
 * terminados (uno a uno: marcarlo como antiguo con la fecha de su último rol o dejarlo en el equipo).
 */
function FormerReview({ contacts, groups, onOpenContact, onAddToGroup, onSkip, onMarkFormer, onKeepActive }) {
  const { outsideGroup, allRolesEnded } = formerReview(contacts, groups)
  if (outsideGroup.length === 0 && allRolesEnded.length === 0) return null
  const n = outsideGroup.length
  return (
    <section className="team-former-review" aria-label="Antiguos miembros">
      {n > 0 && (
        <div className="team-former-review-block">
          <p>
            {n === 1 ? 'Hay 1 antiguo miembro' : `Hay ${n} antiguos miembros`} fuera del grupo «{FORMER_GROUP_NAME}». Ya no salen
            en Equipo, pero siguen en Contactos.
          </p>
          <ul>
            {outsideGroup.map((c) => (
              <li key={c.id}>
                <button type="button" className="team-former-review-name" onClick={() => onOpenContact(c.id)}>
                  {c.name}
                </button>
                {c.teamProfile.leftAt && <span className="team-former-review-date">salió el {dayLong(c.teamProfile.leftAt)}</span>}
                <button type="button" className="team-former-review-link" onClick={() => onSkip(c)}>
                  No añadir
                </button>
              </li>
            ))}
          </ul>
          <button type="button" className="contact-action-btn primary" onClick={() => onAddToGroup(outsideGroup)}>
            <UsersRound size={14} strokeWidth={1.75} />
            Añadirlos al grupo
          </button>
        </div>
      )}
      {allRolesEnded.length > 0 && (
        <div className="team-former-review-block">
          <p>Siguen como activos pero tienen todos sus roles terminados:</p>
          <ul>
            {allRolesEnded.map(({ contact: c, leftAt }) => (
              <li key={c.id}>
                <span className="team-former-review-name-text">{c.name}</span>
                {leftAt && <span className="team-former-review-date">último rol hasta el {dayLong(leftAt)}</span>}
                <span className="team-former-review-actions">
                  <button
                    type="button"
                    className="contact-action-btn"
                    disabled={!leftAt}
                    onClick={() => {
                      if (window.confirm(`¿Marcar a ${c.name} como antiguo miembro, con fecha de salida el ${dayLong(leftAt)}? Dejará de salir en Equipo y pasará al grupo «${FORMER_GROUP_NAME}».`)) {
                        onMarkFormer(c, leftAt)
                      }
                    }}
                  >
                    <UserMinus size={14} strokeWidth={1.75} />
                    Marcar como antiguo
                  </button>
                  <button type="button" className="team-former-review-link" onClick={() => onKeepActive(c)}>
                    Sigue en el equipo
                  </button>
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
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
  onAddFormersToGroup,
  onSkipFormerGroup,
  onMarkFormer,
  onKeepActive,
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
  const [sort, setSort] = useState('name')
  const [editing, setEditing] = useState(false)

  // Solo los miembros activos: los antiguos miembros están en Contactos.
  const members = useMemo(() => filterMembers(contacts, { query, area, sort, now }), [contacts, query, area, sort, now])
  const activeCount = useMemo(() => contacts.filter(isActiveMember).length, [contacts])
  const selected = contacts.find((c) => c.id === selectedMemberId && isActiveMember(c)) || null

  if (selected) {
    return (
      <div className="team-view">
        <MemberDetail
          contact={selected}
          contacts={contacts}
          groups={groups}
          rawEvents={rawEvents}
          now={now}
          areas={areas}
          onBack={() => onSelectMember(null)}
          onEdit={() => setEditing(true)}
          onSaveRoles={(roles) => onSaveProfile(selected.id, { contactPatch: {}, teamProfile: withRoles(selected.teamProfile, roles) })}
          onRemove={() => {
            if (window.confirm(`¿Quitar a ${selected.name} del equipo? Se borra su perfil de equipo (cargo, departamento, trayectoria); el contacto con todos sus datos, sus enlaces y sus reuniones se conserva. Si ya no está en el equipo, mejor márcalo como antiguo miembro.`)) {
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
            groups={groups}
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
          <select className="team-area-filter" value={sort} onChange={(e) => setSort(e.target.value)} aria-label="Ordenar">
            {Object.entries(MEMBER_SORTS).map(([value, label]) => (
              <option key={value} value={value}>
                Ordenar por {label.toLocaleLowerCase('es')}
              </option>
            ))}
          </select>
          <button type="button" className="departments-btn" onClick={onManageDepartments} title="Añadir, renombrar, ordenar o borrar departamentos">
            <Building2 size={14} strokeWidth={1.75} />
            Departamentos
          </button>
        </div>
      </div>

      <FormerReview
        contacts={contacts}
        groups={groups}
        onOpenContact={onOpenContact}
        onAddToGroup={onAddFormersToGroup}
        onSkip={onSkipFormerGroup}
        onMarkFormer={onMarkFormer}
        onKeepActive={onKeepActive}
      />

      {activeCount === 0 ? (
        <div className="contacts-empty team-empty-state">
          <UsersRound size={32} strokeWidth={1.5} />
          <p className="contacts-empty-title">Todavía no hay nadie en el equipo</p>
          <p>Abre un contacto en Contactos y pulsa «Marcar como miembro del equipo» para crear su perfil.</p>
        </div>
      ) : members.length === 0 ? (
        <div className="contacts-empty team-empty-state">
          <p>No hay miembros que coincidan con la búsqueda.</p>
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
