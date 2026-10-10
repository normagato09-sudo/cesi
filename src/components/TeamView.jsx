import { useMemo, useState } from 'react'
import { format } from 'date-fns'
import { es } from 'date-fns/locale'
import {
  Archive,
  ArrowLeft,
  CalendarPlus,
  Mail,
  Pencil,
  Phone,
  Search,
  UserMinus,
  Building2,
  Briefcase,
  Crown,
  Link2,
  UserCheck,
  UsersRound,
} from 'lucide-react'
import ContactAvatar from './ContactAvatar.jsx'
import TeamProfileModal from './TeamProfileModal.jsx'
import CvLink from './CvLink.jsx'
import { ContactFields, ContactMeetings, GroupChips } from './ContactInfo.jsx'
import LinkList from './LinkList.jsx'
import TeamTrajectory from './TeamTrajectory.jsx'
import TaskItem from './TaskItem.jsx'
import ContactLinkModal from './ContactLinkModal.jsx'
import { pendingTasksOf } from '../lib/tasks'
import { isCandidate } from '../lib/vacancies'
import { useSync } from '../lib/sync/syncContext'
import { isActiveMember, milestonesToBio, quoteDisplay, todayKey } from '../lib/team'
import { headAreas, teamGroups } from '../lib/teamOrder'
import TeamGroups, { HEAD_LABEL } from './TeamGroups.jsx'
import VacancyFormModal from './VacancyFormModal.jsx'
import { DepartmentVacancies, RetentionNotice } from './TeamVacancies.jsx'
import { expiredDiscarded } from '../lib/vacancies'
import { formerReview } from '../lib/formerMembers'
import { currentRoles, dayLong, roleLabel, tenure, tenureText, withRoles } from '../lib/trajectory'
import { migrateProfileLinks } from '../lib/links'
import './TeamView.css'

// Sus roles actuales ("Moderadora · Moderación / Técnico"), o el principal si ya no tiene ninguno.
function roleLine(profile) {
  const current = currentRoles(profile).map(roleLabel).filter(Boolean)
  return current.length > 0 ? current.join(' / ') : [profile.role, profile.area].filter(Boolean).join(' · ')
}

function MemberDetail({
  contact,
  contacts,
  groups,
  rawEvents,
  tasks,
  today,
  now,
  areas,
  onBack,
  onEdit,
  onSendLink,
  onRemove,
  onArchive,
  onSaveRoles,
  onOpenEvent,
  onFindSlot,
  onNewMeeting,
  onOpenCandidate,
  onToggleTask,
  onOpenTask,
  onOpenTaskSource,
}) {
  const p = milestonesToBio(contact.teamProfile)
  const seniority = tenureText(tenure(p, now))
  const links = (migrateProfileLinks(p).links || []).filter((l) => l.url)
  const departments = [...new Set(currentRoles(p).map((r) => r.area).filter(Boolean))]
  if (departments.length === 0 && p.area) departments.push(p.area)
  const pending = useMemo(() => pendingTasksOf(tasks, contact.id), [tasks, contact.id])
  const heads = headAreas(contact, contacts)

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
          {departments.length > 0 && (
            <p className="team-detail-departments">
              <Building2 size={13} strokeWidth={1.75} aria-hidden="true" />
              {departments.join(' · ')}
            </p>
          )}
          {heads.length > 0 && (
            <p className="team-detail-head">
              <Crown size={13} strokeWidth={2} aria-hidden="true" />
              {HEAD_LABEL}: {heads.join(' · ')}
            </p>
          )}
          {seniority && <p className="team-detail-seniority">{seniority}</p>}
          <GroupChips contact={contact} groups={groups} />
          {contact.selfUpdatedAt && (
            <span className="contact-self-updated">
              <UserCheck size={13} strokeWidth={2} />
              Actualizado por la persona el {format(new Date(contact.selfUpdatedAt), "d MMM yyyy 'a las' HH:mm", { locale: es })}
            </span>
          )}
        </div>
      </div>

      <div className="contact-detail-actions team-detail-actions">
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
          Editar
        </button>
        <button type="button" className="contact-action-btn" onClick={onSendLink}>
          <Link2 size={14} strokeWidth={1.75} />
          Enviar link para que lo rellene
        </button>
        {isCandidate(contact) && (
          <button type="button" className="contact-action-btn team" onClick={() => onOpenCandidate(contact.id)}>
            <Briefcase size={14} strokeWidth={1.75} />
            Ver candidatura
          </button>
        )}
        <button type="button" className="contact-action-btn" onClick={onArchive}>
          <Archive size={14} strokeWidth={1.75} />
          Archivar
        </button>
        <button type="button" className="contact-action-btn danger" onClick={onRemove}>
          <UserMinus size={14} strokeWidth={1.75} />
          Quitar del equipo
        </button>
      </div>

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
          {!contact.email && !contact.phone && !p.cv && <li className="team-empty">Sin email ni teléfono.</li>}
        </ul>
        <ContactFields contact={contact} skip={['email', 'phone', 'role', 'links']} />
      </section>

      <TeamTrajectory profile={p} now={now} areas={areas} joinedAt={p.joinedAt || ''} onChange={onSaveRoles} />

      {links.length > 0 && (
        <section className="team-section">
          <h3>Enlaces</h3>
          <div className="team-links">
            <LinkList links={links} />
          </div>
        </section>
      )}

      {p.bio && (
        <section className="team-section">
          <h3>Sobre esta persona</h3>
          <p className="team-bio">{p.bio}</p>
        </section>
      )}

      <section className="team-section">
        <h3>Tareas pendientes</h3>
        {pending.length === 0 ? (
          <p className="team-empty">No tiene tareas pendientes.</p>
        ) : (
          <ul className="task-list team-tasks">
            {pending.map((t) => (
              <TaskItem key={t.id} task={t} contacts={contacts} today={today} onToggle={onToggleTask} onOpen={onOpenTask} onOpenSource={onOpenTaskSource} />
            ))}
          </ul>
        )}
      </section>

      <ContactMeetings contact={contact} contacts={contacts} rawEvents={rawEvents} now={now} onOpenEvent={onOpenEvent} />
    </div>
  )
}

/**
 * Aviso de los activos con todos sus roles terminados (uno a uno: marcarlo como antiguo miembro con
 * la fecha de su último rol, y así se archiva, o dejarlo en el equipo).
 */
function FormerReview({ contacts, onMarkFormer, onKeepActive }) {
  const allRolesEnded = formerReview(contacts)
  if (allRolesEnded.length === 0) return null
  return (
    <section className="team-former-review" aria-label="Antiguos miembros">
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
                      if (window.confirm(`¿Marcar a ${c.name} como antiguo miembro, con fecha de salida el ${dayLong(leftAt)}? Dejará de salir en Equipo y pasará a Contactos › Archivados.`)) {
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

// Archivar a un miembro activo: pasa a antiguo miembro con la fecha de salida que se elija (por
// defecto hoy; sus roles actuales se cierran ese día) y se archiva.
function ArchiveMemberDialog({ contact, onCancel, onConfirm }) {
  const [leftAt, setLeftAt] = useState(todayKey())
  return (
    <div className="availability-backdrop task-modal-backdrop" onClick={onCancel}>
      <form
        className="availability-modal team-archive-dialog"
        onClick={(e) => e.stopPropagation()}
        onSubmit={(e) => {
          e.preventDefault()
          if (leftAt) onConfirm(leftAt)
        }}
        role="dialog"
        aria-labelledby="team-archive-title"
      >
        <div className="availability-header">
          <h2 id="team-archive-title">
            <Archive size={17} strokeWidth={1.75} />
            ¿Archivar a {contact.name}?
          </h2>
        </div>
        <div className="availability-scroll team-archive-body">
          <p>
            Dejará de estar en el equipo: pasa a antiguo miembro y a Contactos › Archivados. Se conserva todo (trayectoria,
            tiempo en CESI, candidaturas, notas, reuniones y tareas).
          </p>
          <label className="event-form-field">
            <span>Fecha de salida</span>
            <input type="date" value={leftAt} onChange={(e) => setLeftAt(e.target.value)} required />
            <em className="team-fieldset-hint">Sus roles actuales se cerrarán con esta fecha.</em>
          </label>
          <div className="team-archive-actions">
            <button type="button" className="contact-action-btn" onClick={onCancel}>
              Cancelar
            </button>
            <button type="submit" className="contact-action-btn primary" disabled={!leftAt}>
              <Archive size={14} strokeWidth={1.75} />
              Archivar
            </button>
          </div>
        </div>
      </form>
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
  onMarkFormer,
  onKeepActive,
  onRemoveFromTeam,
  onAddArea,
  onManageDepartments,
  onOpenEvent,
  onFindSlot,
  onNewMeeting,
  onOpenCandidate,
  tasks = [],
  today,
  onToggleTask,
  onOpenTask,
  onOpenTaskSource,
  onReorder,
  vacancies = [],
  onOpenVacancy,
  onCreateVacancy,
  onEraseExpired,
}) {
  const [query, setQuery] = useState('')
  const [area, setArea] = useState('')
  const [newVacancyArea, setNewVacancyArea] = useState(null) // departamento de la vacante nueva
  const [editing, setEditing] = useState(false)
  const [archiving, setArchiving] = useState(false)
  const [linkOpen, setLinkOpen] = useState(false)
  const syncActive = !!useSync()

  // Solo los miembros activos (los antiguos miembros están en Contactos), agrupados por
  // departamento en el orden que yo decido (ver teamOrder.js).
  // Debajo de las personas de cada departamento, sus vacantes.
  const groupsView = useMemo(() => teamGroups(contacts, areas, { query, area, vacancies }), [contacts, areas, query, area, vacancies])
  const expired = useMemo(() => expiredDiscarded(contacts, now), [contacts, now])
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
          tasks={tasks}
          today={today}
          now={now}
          areas={areas}
          onBack={() => onSelectMember(null)}
          onEdit={() => setEditing(true)}
          onSendLink={() => setLinkOpen(true)}
          onSaveRoles={(roles) => onSaveProfile(selected.id, { contactPatch: {}, teamProfile: withRoles(selected.teamProfile, roles) })}
          onRemove={() => {
            if (window.confirm(`¿Quitar a ${selected.name} del equipo? Se borra su perfil de equipo (cargo, departamento, trayectoria); el contacto con todos sus datos, sus enlaces y sus reuniones se conserva. Si ya no está en el equipo, mejor márcalo como antiguo miembro.`)) {
              onRemoveFromTeam(selected.id)
              onSelectMember(null)
            }
          }}
          onArchive={() => setArchiving(true)}
          onOpenEvent={onOpenEvent}
          onFindSlot={onFindSlot}
          onNewMeeting={onNewMeeting}
          onOpenCandidate={onOpenCandidate}
          onToggleTask={onToggleTask}
          onOpenTask={onOpenTask}
          onOpenTaskSource={onOpenTaskSource}
        />
        {archiving && (
          <ArchiveMemberDialog
            contact={selected}
            onCancel={() => setArchiving(false)}
            onConfirm={(leftAt) => {
              setArchiving(false)
              onMarkFormer(selected, leftAt)
              onSelectMember(null)
            }}
          />
        )}
        {linkOpen && <ContactLinkModal contact={selected} syncActive={syncActive} onClose={() => setLinkOpen(false)} />}
        {editing && (
          <TeamProfileModal
            contact={selected}
            title={`Editar a ${selected.name}`}
            saveLabel="Guardar"
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
          <button type="button" className="departments-btn" onClick={onManageDepartments} title="Añadir, renombrar, ordenar o borrar departamentos">
            <Building2 size={14} strokeWidth={1.75} />
            Departamentos
          </button>
        </div>
      </div>

      <FormerReview
        contacts={contacts}
        onMarkFormer={onMarkFormer}
        onKeepActive={onKeepActive}
      />

      <div className="team-retention">
        <RetentionNotice expired={expired} onErase={onEraseExpired} />
      </div>

      {activeCount === 0 && vacancies.length === 0 ? (
        <div className="contacts-empty team-empty-state">
          <UsersRound size={32} strokeWidth={1.5} />
          <p className="contacts-empty-title">Todavía no hay nadie en el equipo</p>
          <p>Abre un contacto en Contactos y pulsa «Marcar como miembro del equipo»: pasará a estar aquí (y dejará de salir en Contactos). Las vacantes también se crean aquí, en su departamento.</p>
        </div>
      ) : groupsView.length === 0 ? (
        <div className="contacts-empty team-empty-state">
          <p>No hay miembros que coincidan con la búsqueda.</p>
        </div>
      ) : (
        <TeamGroups
          groups={groupsView}
          now={now}
          canReorder={!query.trim()}
          onOpen={onSelectMember}
          onReorder={onReorder}
          renderAfter={(group) => (
            <DepartmentVacancies
              group={group}
              contacts={contacts}
              canCreate={!query.trim()}
              onOpen={onOpenVacancy}
              onCreate={setNewVacancyArea}
            />
          )}
        />
      )}

      {newVacancyArea !== null && (
        <VacancyFormModal
          defaultArea={newVacancyArea}
          areas={areas}
          onAddArea={onAddArea}
          onSubmit={(data) => onOpenVacancy(onCreateVacancy(data).id)}
          onClose={() => setNewVacancyArea(null)}
        />
      )}
    </div>
  )
}
