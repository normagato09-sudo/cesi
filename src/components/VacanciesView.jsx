import { useMemo, useState } from 'react'
import { format, parseISO } from 'date-fns'
import { es } from 'date-fns/locale'
import {
  ArrowLeft,
  BadgeCheck,
  Briefcase,
  Building2,
  FileText,
  Pencil,
  Plus,
  Search,
  ShieldAlert,
  Trash2,
  UserPlus,
  UserRound,
} from 'lucide-react'
import ContactAvatar from './ContactAvatar.jsx'
import CvLink from './CvLink.jsx'
import TeamProfileModal from './TeamProfileModal.jsx'
import VacancyFormModal from './VacancyFormModal.jsx'
import CandidateFormModal from './CandidateFormModal.jsx'
import AcceptRoleModal from './AcceptRoleModal.jsx'
import { ContactFields, ContactMeetings } from './ContactInfo.jsx'
import {
  CANDIDATE_STATUS,
  CANDIDATE_STATUS_ORDER,
  RETENTION_MONTHS,
  VACANCY_STATUS,
  candidateCountText,
  candidatesByStatus,
  candidaciesOf,
  candidatesOf,
  expiredDiscarded,
  filterVacancies,
  findCandidacy,
  incorporationDraft,
  isCandidateOnly,
  vacancyCountsText,
} from '../lib/vacancies'
import { memberSummary } from '../lib/trajectory'
import './TeamView.css'
import './VacanciesView.css'

function formatDay(value) {
  if (!value) return ''
  const date = value.length > 10 ? new Date(value) : parseISO(value)
  return format(date, "d 'de' MMM yyyy", { locale: es })
}

function StatusBadge({ status }) {
  return <span className={`vacancy-status ${status}`}>{VACANCY_STATUS[status] || status}</span>
}

// Aviso de protección de datos: descartados hace más de 6 meses.
function RetentionNotice({ expired, onErase }) {
  if (expired.length === 0) return null
  const n = expired.length
  return (
    <div className="vacancy-retention" role="status">
      <ShieldAlert size={16} strokeWidth={1.75} />
      <div>
        <p>
          <strong>
            {n === 1 ? '1 candidato descartado' : `${n} candidatos descartados`} hace más de {RETENTION_MONTHS} meses.
          </strong>{' '}
          Por protección de datos, puedes borrar sus datos personales (el contacto, su CV y sus notas). En cada vacante
          quedará solo un registro anónimo.
        </p>
        <button
          type="button"
          className="contact-action-btn danger"
          onClick={() => {
            const names = expired.map((e) => `• ${e.contact.name}`).join('\n')
            if (
              window.confirm(
                `Se borrarán definitivamente los datos personales de:\n${names}\n\n` +
                  'Se borran el contacto, su CV y sus notas, y se quitan de sus reuniones. No se puede deshacer. ¿Continuar?',
              )
            ) {
              onErase(expired)
            }
          }}
        >
          <Trash2 size={14} strokeWidth={1.75} />
          Borrar sus datos
        </button>
      </div>
    </div>
  )
}

function CandidateCard({ contact, candidacy: c, onOpen }) {
  const last = c.history?.[c.history.length - 1]
  return (
    <li>
      <button type="button" className="candidate-card" onClick={() => onOpen(c.id)}>
        <ContactAvatar name={contact.name} photo={contact.photo} size="sm" />
        <span className="candidate-card-text">
          <span className="candidate-card-name">{contact.name}</span>
          <span className="candidate-card-meta">
            Candidatura: {formatDay(c.appliedAt)}
            {last && last.status !== 'new' && ` · ${CANDIDATE_STATUS[last.status]} el ${formatDay(last.at)}`}
          </span>
        </span>
        {c.cv && <FileText size={14} strokeWidth={1.75} className="candidate-card-cv" aria-label="Tiene CV" />}
      </button>
    </li>
  )
}

function VacancyDetail({ vacancy, contacts, onBack, onEdit, onDelete, onAddCandidate, onOpenCandidate, onStatusChange }) {
  const columns = candidatesByStatus(vacancy.id, contacts)
  const erased = (vacancy.erasedCandidates || []).length
  return (
    <div className="vacancy-detail">
      <button type="button" className="contact-back-btn team-back" onClick={onBack}>
        <ArrowLeft size={16} strokeWidth={1.75} />
        Vacantes
      </button>

      <div className="vacancy-detail-head">
        <div className="vacancy-detail-title">
          <h2>{vacancy.title}</h2>
          <p>
            {[vacancy.area, `Abierta el ${formatDay(vacancy.openedAt)}`].filter(Boolean).join(' · ')}
          </p>
        </div>
        <select
          className="vacancy-status-select"
          value={vacancy.status}
          onChange={(e) => onStatusChange(e.target.value)}
          aria-label="Estado de la vacante"
        >
          {Object.entries(VACANCY_STATUS).map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>
      </div>

      <div className="contact-detail-actions">
        <button type="button" className="contact-action-btn primary" onClick={onAddCandidate}>
          <UserPlus size={14} strokeWidth={1.75} />
          Añadir candidato
        </button>
        <button type="button" className="contact-action-btn" onClick={onEdit}>
          <Pencil size={14} strokeWidth={1.75} />
          Editar vacante
        </button>
        <button type="button" className="contact-action-btn danger" onClick={onDelete}>
          <Trash2 size={14} strokeWidth={1.75} />
          Borrar
        </button>
      </div>

      {(vacancy.description || vacancy.requirements) && (
        <div className="vacancy-texts">
          {vacancy.description && (
            <section className="team-section">
              <h3>Descripción</h3>
              <p className="team-bio">{vacancy.description}</p>
            </section>
          )}
          {vacancy.requirements && (
            <section className="team-section">
              <h3>Requisitos</h3>
              <p className="team-bio">{vacancy.requirements}</p>
            </section>
          )}
        </div>
      )}

      <div className="vacancy-board">
        {columns.map(({ status, candidates }) => (
          <section key={status} className={`vacancy-column ${status}`} aria-label={CANDIDATE_STATUS[status]}>
            <h3>
              {CANDIDATE_STATUS[status]}
              <span className="vacancy-column-count">{candidates.length}</span>
            </h3>
            {candidates.length === 0 ? (
              <p className="vacancy-column-empty">Nadie</p>
            ) : (
              <ul>
                {candidates.map(({ contact, candidacy }) => (
                  <CandidateCard key={candidacy.id} contact={contact} candidacy={candidacy} onOpen={onOpenCandidate} />
                ))}
              </ul>
            )}
            {status === 'discarded' && erased > 0 && (
              <p className="vacancy-erased">
                {candidateCountText(erased)} descartado{erased === 1 ? '' : 's'} (datos borrados)
              </p>
            )}
          </section>
        ))}
      </div>
    </div>
  )
}

function CandidateDetail({
  contact,
  candidacy: c,
  vacancy,
  vacancies,
  contacts,
  rawEvents,
  now,
  onBack,
  onEdit,
  onDelete,
  onStatus,
  onFindInterview,
  onIncorporate,
  onOpenCandidate,
  onOpenEvent,
}) {
  const member = memberSummary(contact, now)
  const others = candidaciesOf(contact).filter((x) => x.id !== c.id)
  const titleOf = (vacancyId) => vacancies.find((v) => v.id === vacancyId)?.title || 'una vacante borrada'
  return (
    <div className="vacancy-detail">
      <button type="button" className="contact-back-btn team-back" onClick={onBack}>
        <ArrowLeft size={16} strokeWidth={1.75} />
        {vacancy ? vacancy.title : 'Vacantes'}
      </button>

      <div className="team-detail-hero">
        <ContactAvatar name={contact.name} photo={contact.photo} size="xl" />
        <div className="team-detail-hero-text">
          <h2>{contact.name}</h2>
          <p className="team-detail-role">Candidato a {vacancy ? vacancy.title : 'una vacante borrada'}</p>
          <p className="team-detail-seniority">Candidatura del {formatDay(c.appliedAt)}</p>
          {member ? (
            <p className="candidate-member">{member.text}</p>
          ) : (
            !isCandidateOnly(contact) && <p className="candidate-member">Ya es contacto</p>
          )}
          {others.length > 0 && (
            <p className="candidate-other">
              También se ha presentado a:{' '}
              {others.map((o, i) => (
                <span key={o.id}>
                  {i > 0 && ', '}
                  <button type="button" onClick={() => onOpenCandidate(o.id)}>
                    {titleOf(o.vacancyId)}
                  </button>{' '}
                  ({CANDIDATE_STATUS[o.status]?.toLocaleLowerCase('es')})
                </span>
              ))}
            </p>
          )}
          {c.cv && <CvLink cv={c.cv} className="cv-link" />}
        </div>
      </div>

      <div className="candidate-status" role="group" aria-label="Estado del candidato">
        {CANDIDATE_STATUS_ORDER.map((status) => (
          <button
            key={status}
            type="button"
            className={`candidate-status-btn ${status}${c.status === status ? ' on' : ''}`}
            aria-pressed={c.status === status}
            onClick={() => onStatus(status)}
          >
            {CANDIDATE_STATUS[status]}
          </button>
        ))}
      </div>

      <div className="contact-detail-actions">
        <button type="button" className="contact-action-btn primary" onClick={onFindInterview}>
          <Search size={14} strokeWidth={1.75} />
          Buscar hueco para entrevista
        </button>
        {vacancy && (
          <button type="button" className="contact-action-btn team" onClick={onIncorporate}>
            <BadgeCheck size={14} strokeWidth={1.75} />
            {c.status === 'accepted' ? 'Incorporar al equipo' : 'Aceptar e incorporar'}
          </button>
        )}
        <button type="button" className="contact-action-btn" onClick={onEdit}>
          <Pencil size={14} strokeWidth={1.75} />
          Editar
        </button>
        <button type="button" className="contact-action-btn danger" onClick={onDelete}>
          <Trash2 size={14} strokeWidth={1.75} />
          Eliminar
        </button>
      </div>

      <section className="team-section">
        <h3>Historial</h3>
        <ol className="team-timeline">
          {(c.history || []).map((h, i) => (
            <li key={`${h.at}-${i}`}>
              <span className="team-timeline-date">{formatDay(h.at)}</span>
              <span className="team-timeline-text">{CANDIDATE_STATUS[h.status]}</span>
            </li>
          ))}
        </ol>
        {c.status === 'discarded' && c.discardedAt && (
          <p className="vacancy-discarded-note">
            Descartado el {formatDay(c.discardedAt)}. Pasados {RETENTION_MONTHS} meses se te propondrá borrar sus datos.
          </p>
        )}
      </section>

      <section className="team-section">
        <h3>Notas de esta candidatura</h3>
        {c.notes ? <p className="team-bio">{c.notes}</p> : <p className="team-empty">Sin notas.</p>}
      </section>

      <section className="team-section">
        <h3>Datos</h3>
        <ContactFields contact={contact} />
      </section>

      <ContactMeetings contact={contact} contacts={contacts} rawEvents={rawEvents} now={now} onOpenEvent={onOpenEvent} />
    </div>
  )
}

export default function VacanciesView({
  vacancies,
  contacts,
  rawEvents,
  now,
  areas,
  groups = [],
  onAddArea,
  onManageDepartments,
  selectedVacancyId,
  onSelectVacancy,
  selectedCandidacyId,
  onSelectCandidacy,
  onCreateVacancy,
  onUpdateVacancy,
  onDeleteVacancy,
  onAddCandidacy,
  onEditCandidacy,
  onRemoveCandidacy,
  onCandidateStatus,
  onFindInterviewSlot,
  onIncorporate,
  onEraseExpired,
  onOpenEvent,
  onOpenTeamMember,
}) {
  const [statusFilter, setStatusFilter] = useState('')
  const [vacancyForm, setVacancyForm] = useState(null) // { vacancy } (null = nueva)
  const [candidateForm, setCandidateForm] = useState(null) // { entry: { contact, candidacy } } (entry null = nueva)
  const [incorporating, setIncorporating] = useState(null) // { contact, candidacy }
  const [hired, setHired] = useState(null) // contacto recién incorporado

  const expired = useMemo(() => expiredDiscarded(contacts, now), [contacts, now])
  const list = filterVacancies(vacancies, statusFilter)
  const selectedVacancy = vacancies.find((v) => v.id === selectedVacancyId) || null
  const selected = selectedCandidacyId ? findCandidacy(contacts, selectedCandidacyId) : null // { contact, candidacy }
  const candidateVacancy = selected ? vacancies.find((v) => v.id === selected.candidacy.vacancyId) || null : null

  const openCandidacy = (id) => {
    const found = findCandidacy(contacts, id)
    if (found) onSelectVacancy(found.candidacy.vacancyId)
    onSelectCandidacy(id)
  }

  const countByStatus = (status) => vacancies.filter((v) => v.status === status).length

  const handleIncorporated = (data) => {
    const { contact, candidacy } = incorporating
    onIncorporate(contact, candidacy.id, candidateVacancy, data)
    setHired(contact)
    setIncorporating(null)
    onSelectCandidacy(null)
    onSelectVacancy(candidateVacancy.id)
  }

  const handleDeleteVacancy = (vacancy) => {
    const n = candidatesOf(vacancy.id, contacts).length
    const extra =
      n === 0
        ? ''
        : ` También se borrarán sus ${candidateCountText(n)}: las candidaturas (CV y notas) y los contactos que solo existían por ellas.`
    if (!window.confirm(`¿Borrar la vacante «${vacancy.title}»?${extra}`)) return
    onDeleteVacancy(vacancy.id)
    onSelectVacancy(null)
  }

  const handleDeleteCandidacy = ({ contact, candidacy }) => {
    const onlyThis = isCandidateOnly(contact) && candidaciesOf(contact).length === 1
    const what = onlyThis
      ? `¿Eliminar a ${contact.name}? Se borran el contacto, su CV y sus notas; las reuniones se conservan.`
      : `¿Quitar la candidatura de ${contact.name} a esta vacante? Se borran su CV y sus notas; el contacto se conserva.`
    if (!window.confirm(what)) return
    onRemoveCandidacy(contact, candidacy.id)
    onSelectCandidacy(null)
  }

  let content
  if (selected) {
    content = (
      <CandidateDetail
        contact={selected.contact}
        candidacy={selected.candidacy}
        vacancy={candidateVacancy}
        vacancies={vacancies}
        contacts={contacts}
        rawEvents={rawEvents}
        now={now}
        onBack={() => {
          onSelectCandidacy(null)
          if (candidateVacancy) onSelectVacancy(candidateVacancy.id)
        }}
        onEdit={() => setCandidateForm({ entry: selected })}
        onDelete={() => handleDeleteCandidacy(selected)}
        onStatus={(status) => onCandidateStatus(selected.contact, selected.candidacy.id, status)}
        onFindInterview={() => onFindInterviewSlot(selected.contact)}
        onIncorporate={() => setIncorporating(selected)}
        onOpenCandidate={openCandidacy}
        onOpenEvent={onOpenEvent}
      />
    )
  } else if (selectedVacancy) {
    content = (
      <VacancyDetail
        vacancy={selectedVacancy}
        contacts={contacts}
        onBack={() => onSelectVacancy(null)}
        onEdit={() => setVacancyForm({ vacancy: selectedVacancy })}
        onDelete={() => handleDeleteVacancy(selectedVacancy)}
        onAddCandidate={() => setCandidateForm({ entry: null })}
        onOpenCandidate={onSelectCandidacy}
        onStatusChange={(status) => onUpdateVacancy(selectedVacancy.id, { status })}
      />
    )
  } else {
    content = (
      <>
        <div className="team-header">
          <div className="vacancies-title-row">
            <h1 className="contacts-title">Vacantes</h1>
            <button type="button" className="contacts-new-btn" onClick={() => setVacancyForm({ vacancy: null })}>
              <Plus size={15} strokeWidth={1.75} />
              <span>Nueva vacante</span>
            </button>
          </div>
          <div className="vacancies-filters">
          <div className="view-switch vacancies-filter" role="group" aria-label="Filtrar por estado">
            <button type="button" className={`view-switch-btn ${statusFilter === '' ? 'active' : ''}`} onClick={() => setStatusFilter('')}>
              Todas ({vacancies.length})
            </button>
            {Object.entries(VACANCY_STATUS).map(([value, label]) => (
              <button
                key={value}
                type="button"
                className={`view-switch-btn ${statusFilter === value ? 'active' : ''}`}
                onClick={() => setStatusFilter(value)}
              >
                {label} ({countByStatus(value)})
              </button>
            ))}
          </div>
          <button type="button" className="departments-btn" onClick={onManageDepartments} title="Añadir, renombrar, ordenar o borrar departamentos">
            <Building2 size={14} strokeWidth={1.75} />
            Departamentos
          </button>
          </div>
        </div>

        <div className="vacancies-body">
          <RetentionNotice expired={expired} onErase={onEraseExpired} />

          {vacancies.length === 0 ? (
            <div className="contacts-empty team-empty-state">
              <Briefcase size={32} strokeWidth={1.5} />
              <p className="contacts-empty-title">Todavía no hay vacantes</p>
              <p>Crea una vacante y apunta a sus candidatos para seguir el proceso, buscar hueco para las entrevistas e incorporarlos al equipo.</p>
            </div>
          ) : list.length === 0 ? (
            <div className="contacts-empty team-empty-state">
              <p>No hay vacantes en ese estado.</p>
            </div>
          ) : (
            <ul className="vacancy-list">
              {list.map((v) => (
                <li key={v.id}>
                  <button type="button" className="vacancy-card" onClick={() => onSelectVacancy(v.id)}>
                    <span className="vacancy-card-head">
                      <span className="vacancy-card-title">{v.title}</span>
                      <StatusBadge status={v.status} />
                    </span>
                    <span className="vacancy-card-meta">
                      {[v.area, `Abierta el ${formatDay(v.openedAt)}`].filter(Boolean).join(' · ')}
                    </span>
                    <span className="vacancy-card-count">
                      <UserRound size={13} strokeWidth={1.75} />
                      {vacancyCountsText(v, contacts)}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </>
    )
  }

  return (
    <div className="team-view vacancies-view">
      {hired && (
        <div className="vacancy-hired" role="status">
          <BadgeCheck size={16} strokeWidth={1.75} />
          <span>{hired.name} ya forma parte del equipo.</span>
          <button type="button" onClick={() => onOpenTeamMember(hired.id)}>
            Ver su ficha
          </button>
          <button type="button" onClick={() => setHired(null)} aria-label="Cerrar aviso">
            ×
          </button>
        </div>
      )}

      {content}

      {vacancyForm && (
        <VacancyFormModal
          initialVacancy={vacancyForm.vacancy}
          areas={areas}
          onAddArea={onAddArea}
          onSubmit={(data) => {
            if (vacancyForm.vacancy) onUpdateVacancy(vacancyForm.vacancy.id, data)
            else onSelectVacancy(onCreateVacancy(data).id)
          }}
          onClose={() => setVacancyForm(null)}
        />
      )}

      {candidateForm && (candidateForm.entry ? candidateVacancy : selectedVacancy) && (
        <CandidateFormModal
          vacancy={candidateForm.entry ? candidateVacancy : selectedVacancy}
          contacts={contacts}
          initial={candidateForm.entry}
          onSubmit={(data) => {
            if (candidateForm.entry) onEditCandidacy(candidateForm.entry.contact, candidateForm.entry.candidacy.id, data)
            else onAddCandidacy(selectedVacancy.id, data)
          }}
          onOpenCandidacy={openCandidacy}
          onClose={() => setCandidateForm(null)}
        />
      )}

      {/* Quien ya es (o fue) del equipo recibe un rol nuevo en su trayectoria (se pregunta si se suma o sustituye). */}
      {incorporating && candidateVacancy && incorporating.contact.teamProfile && (
        <AcceptRoleModal
          contact={incorporating.contact}
          vacancy={candidateVacancy}
          areas={areas}
          now={now}
          onSave={handleIncorporated}
          onClose={() => setIncorporating(null)}
        />
      )}
      {incorporating && candidateVacancy && !incorporating.contact.teamProfile && (
        <TeamProfileModal
          contact={incorporating.contact}
          areas={areas}
          groups={groups}
          initialProfile={incorporationDraft(candidateVacancy, now)}
          title={`Incorporar a ${incorporating.contact.name} al equipo`}
          saveLabel="Incorporar al equipo"
          onAddArea={onAddArea}
          onSave={handleIncorporated}
          onClose={() => setIncorporating(null)}
        />
      )}
    </div>
  )
}

