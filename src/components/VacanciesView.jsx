import { useMemo, useState } from 'react'
import { format, parseISO } from 'date-fns'
import { es } from 'date-fns/locale'
import {
  ArrowLeft,
  BadgeCheck,
  Briefcase,
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
import { ContactFields, ContactMeetings } from './ContactInfo.jsx'
import {
  CANDIDATE_STATUS,
  CANDIDATE_STATUS_ORDER,
  RETENTION_MONTHS,
  VACANCY_STATUS,
  candidateCountText,
  candidatesByStatus,
  candidatesOf,
  expiredDiscarded,
  filterVacancies,
  incorporationDraft,
  vacancyCountsText,
} from '../lib/vacancies'
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
            const names = expired.map((c) => `• ${c.name}`).join('\n')
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

function CandidateCard({ contact, onOpen }) {
  const c = contact.candidacy
  const last = c.history?.[c.history.length - 1]
  return (
    <li>
      <button type="button" className="candidate-card" onClick={() => onOpen(contact.id)}>
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
                {candidates.map((c) => (
                  <CandidateCard key={c.id} contact={c} onOpen={onOpenCandidate} />
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
  vacancy,
  contacts,
  rawEvents,
  now,
  onBack,
  onEdit,
  onDelete,
  onStatus,
  onFindInterview,
  onIncorporate,
  onOpenEvent,
}) {
  const c = contact.candidacy
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
  onAddArea,
  selectedVacancyId,
  onSelectVacancy,
  selectedCandidateId,
  onSelectCandidate,
  onCreateVacancy,
  onUpdateVacancy,
  onDeleteVacancy,
  onAddCandidate,
  onEditCandidate,
  onRemoveCandidate,
  onCandidateStatus,
  onFindInterviewSlot,
  onIncorporate,
  onEraseExpired,
  onOpenEvent,
  onOpenTeamMember,
}) {
  const [statusFilter, setStatusFilter] = useState('')
  const [vacancyForm, setVacancyForm] = useState(null) // { vacancy } (null = nueva)
  const [candidateForm, setCandidateForm] = useState(null) // { contact } (null = nuevo)
  const [incorporating, setIncorporating] = useState(null) // contacto
  const [hired, setHired] = useState(null) // contacto recién incorporado

  const expired = useMemo(() => expiredDiscarded(contacts, now), [contacts, now])
  const list = filterVacancies(vacancies, statusFilter)
  const selectedVacancy = vacancies.find((v) => v.id === selectedVacancyId) || null
  const candidate = contacts.find((c) => c.id === selectedCandidateId && c.candidacy) || null
  const candidateVacancy = candidate ? vacancies.find((v) => v.id === candidate.candidacy.vacancyId) || null : null

  const countByStatus = (status) => vacancies.filter((v) => v.status === status).length

  const handleDeleteVacancy = (vacancy) => {
    const n = candidatesOf(vacancy.id, contacts).length
    const extra = n === 0 ? '' : ` También se borrarán sus ${candidateCountText(n)} (contacto, CV y notas).`
    if (!window.confirm(`¿Borrar la vacante «${vacancy.title}»?${extra}`)) return
    onDeleteVacancy(vacancy.id)
    onSelectVacancy(null)
  }

  const handleDeleteCandidate = (contact) => {
    if (!window.confirm(`¿Eliminar a ${contact.name}? Se borran el contacto, su CV y sus notas; las reuniones se conservan.`)) return
    onRemoveCandidate(contact.id)
    onSelectCandidate(null)
  }

  let content
  if (candidate) {
    content = (
      <CandidateDetail
        contact={candidate}
        vacancy={candidateVacancy}
        contacts={contacts}
        rawEvents={rawEvents}
        now={now}
        onBack={() => {
          onSelectCandidate(null)
          if (candidateVacancy) onSelectVacancy(candidateVacancy.id)
        }}
        onEdit={() => setCandidateForm({ contact: candidate })}
        onDelete={() => handleDeleteCandidate(candidate)}
        onStatus={(status) => onCandidateStatus(candidate, status)}
        onFindInterview={() => onFindInterviewSlot(candidate)}
        onIncorporate={() => setIncorporating(candidate)}
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
        onAddCandidate={() => setCandidateForm({ contact: null })}
        onOpenCandidate={onSelectCandidate}
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

      {candidateForm && (candidateForm.contact ? candidateVacancy : selectedVacancy) && (
        <CandidateFormModal
          vacancy={candidateForm.contact ? candidateVacancy : selectedVacancy}
          initialContact={candidateForm.contact}
          onSubmit={(data) => {
            if (candidateForm.contact) onEditCandidate(candidateForm.contact.id, data)
            else onAddCandidate(data)
          }}
          onClose={() => setCandidateForm(null)}
        />
      )}

      {incorporating && candidateVacancy && (
        <TeamProfileModal
          contact={incorporating}
          areas={areas}
          initialProfile={incorporationDraft(candidateVacancy, now)}
          title={`Incorporar a ${incorporating.name} al equipo`}
          saveLabel="Incorporar al equipo"
          onAddArea={onAddArea}
          onSave={(data) => {
            onIncorporate(incorporating, candidateVacancy, data)
            setHired(incorporating)
            setIncorporating(null)
            onSelectCandidate(null)
            onSelectVacancy(candidateVacancy.id)
          }}
          onClose={() => setIncorporating(null)}
        />
      )}
    </div>
  )
}

