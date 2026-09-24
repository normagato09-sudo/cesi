import { useMemo, useState } from 'react'
import { ArrowLeft, BadgeCheck, CalendarPlus, Mail, Pencil, Phone, Search, Tags, Trash2, UserPlus, Users } from 'lucide-react'
import ContactFormModal from './ContactFormModal.jsx'
import GroupsModal from './GroupsModal.jsx'
import TeamProfileModal from './TeamProfileModal.jsx'
import ContactAvatar from './ContactAvatar.jsx'
import { ContactFields, ContactMeetings, GroupChips } from './ContactInfo.jsx'
import { contactMatches, contactSeries } from '../lib/contacts'
import { contactsInGroup } from '../lib/groups'
import { countryLabel } from '../lib/timezones'
import { isTeamMember } from '../lib/team'
import './ContactsView.css'

function subtitleOf(contact) {
  return [contact.role, contact.organization].filter(Boolean).join(' · ')
}

export default function ContactsView({
  contacts,
  groups = [],
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
  onCreateGroup,
  onRenameGroup,
  onGroupColor,
  onDeleteGroup,
  areas = [],
  onAddArea,
  onSaveTeamProfile,
  onOpenTeamMember,
}) {
  const [query, setQuery] = useState('')
  const [formModal, setFormModal] = useState(null)
  const [onlyUnreviewed, setOnlyUnreviewed] = useState(false)
  const [groupsOpen, setGroupsOpen] = useState(false)
  const [groupFilter, setGroupFilter] = useState(null)
  const [teamProfileFor, setTeamProfileFor] = useState(null)

  const unreviewedCount = contacts.filter((c) => c.countryUnreviewed).length
  const showOnlyUnreviewed = onlyUnreviewed && unreviewedCount > 0
  // Si se borra el grupo del filtro, se vuelve a ver a todos.
  const activeGroup = groups.find((g) => g.id === groupFilter) || null
  const filtered = useMemo(
    () =>
      contacts.filter(
        (c) =>
          contactMatches(c, query) &&
          (!showOnlyUnreviewed || c.countryUnreviewed) &&
          (!activeGroup || (c.groupIds || []).includes(activeGroup.id)),
      ),
    [contacts, query, showOnlyUnreviewed, activeGroup],
  )
  const selected = contacts.find((c) => c.id === selectedContactId) || null


  // Reuniones (series) en las que aparece el contacto seleccionado, para el aviso al borrarlo.
  const series = useMemo(() => (selected ? contactSeries(selected, rawEvents, contacts) : []), [selected, rawEvents, contacts])

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
          <div className="contacts-group-filter" role="group" aria-label="Filtrar por grupo">
            {groups.length > 0 && (
              <button
                type="button"
                className={`contacts-group-filter-btn${activeGroup ? '' : ' on'}`}
                onClick={() => setGroupFilter(null)}
                aria-pressed={!activeGroup}
              >
                Todos
              </button>
            )}
            {groups.map((g) => (
              <button
                key={g.id}
                type="button"
                className={`group-chip${activeGroup?.id === g.id ? ' on' : ''}`}
                style={{ '--group-color': g.color }}
                onClick={() => setGroupFilter(activeGroup?.id === g.id ? null : g.id)}
                aria-pressed={activeGroup?.id === g.id}
              >
                {g.name} ({contactsInGroup(g.id, contacts).length})
              </button>
            ))}
            <button
              type="button"
              className="contacts-groups-btn"
              onClick={() => setGroupsOpen(true)}
              title="Crear, renombrar o borrar grupos"
            >
              <Tags size={13} strokeWidth={1.75} />
              {groups.length > 0 ? 'Gestionar grupos' : 'Crear grupos'}
            </button>
          </div>
          {unreviewedCount > 0 && (
            <div className="contacts-unreviewed" role="status">
              <span>
                {unreviewedCount === 1
                  ? '1 contacto tiene el país sin revisar (se le asignó España).'
                  : `${unreviewedCount} contactos tienen el país sin revisar (se les asignó España).`}
              </span>
              <button type="button" onClick={() => setOnlyUnreviewed((v) => !v)} aria-pressed={showOnlyUnreviewed}>
                {showOnlyUnreviewed ? 'Ver todos' : 'Revisarlos'}
              </button>
            </div>
          )}
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
            <p>
              {activeGroup && !query.trim()
                ? `No hay contactos en el grupo «${activeGroup.name}».`
                : `No hay contactos que coincidan con «${query}»${activeGroup ? ` en el grupo «${activeGroup.name}»` : ''}.`}
            </p>
          </div>
        ) : (
          <ul className="contacts-list">
            {filtered.map((c) => (
              <li key={c.id} className={`contact-row${c.id === selectedContactId ? ' active' : ''}`}>
                <button type="button" className="contact-row-main" onClick={() => onSelectContact(c.id)}>
                  <ContactAvatar name={c.name} photo={c.photo} />
                  <span className="contact-row-text">
                    <span className="contact-row-name">{c.name}</span>
                    {subtitleOf(c) && <span className="contact-row-sub">{subtitleOf(c)}</span>}
                    {isTeamMember(c) && (
                      <span className="contact-row-team">
                        {c.teamProfile.status === 'former' ? 'Antiguo miembro del equipo' : 'Miembro del equipo'}
                      </span>
                    )}
                    <GroupChips contact={c} groups={groups} />
                    {(c.countryUnreviewed || (c.country && c.country !== 'ES')) && (
                      <span className="contact-row-country">
                        {c.country !== 'ES' && countryLabel(c.country)}
                        {c.countryUnreviewed && <span className="contact-row-unreviewed">País sin revisar</span>}
                      </span>
                    )}
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
              <ContactAvatar name={selected.name} photo={selected.photo} size="lg" />
              <div>
                <h2>{selected.name}</h2>
                {subtitleOf(selected) && <p>{subtitleOf(selected)}</p>}
                <GroupChips contact={selected} groups={groups} />
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
              {isTeamMember(selected) ? (
                <button type="button" className="contact-action-btn team" onClick={() => onOpenTeamMember(selected.id)}>
                  <BadgeCheck size={14} strokeWidth={1.75} />
                  Perfil de equipo
                </button>
              ) : (
                <button type="button" className="contact-action-btn" onClick={() => setTeamProfileFor(selected)}>
                  <BadgeCheck size={14} strokeWidth={1.75} />
                  Marcar como miembro del equipo
                </button>
              )}
              <button type="button" className="contact-action-btn danger" onClick={handleDelete}>
                <Trash2 size={14} strokeWidth={1.75} />
                Eliminar
              </button>
            </div>


            <ContactFields contact={selected} />

            <ContactMeetings contact={selected} contacts={contacts} rawEvents={rawEvents} now={now} onOpenEvent={onOpenEvent} />
          </div>
        )}
      </div>

      {formModal && (
        <ContactFormModal
          initialContact={formModal.contact}
          groups={groups}
          onClose={() => setFormModal(null)}
          onSubmit={handleFormSubmit}
        />
      )}

      {teamProfileFor && (
        <TeamProfileModal
          contact={teamProfileFor}
          areas={areas}
          title={`${teamProfileFor.name}: miembro del equipo`}
          saveLabel="Guardar en el equipo"
          onAddArea={onAddArea}
          onSave={(data) => {
            onSaveTeamProfile(teamProfileFor.id, data)
            setTeamProfileFor(null)
          }}
          onClose={() => setTeamProfileFor(null)}
        />
      )}

      {groupsOpen && (
        <GroupsModal
          groups={groups}
          contacts={contacts}
          onCreate={onCreateGroup}
          onRename={onRenameGroup}
          onColor={onGroupColor}
          onDelete={onDeleteGroup}
          onClose={() => setGroupsOpen(false)}
        />
      )}
    </div>
  )
}
