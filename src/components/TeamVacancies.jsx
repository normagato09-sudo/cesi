import { Briefcase, ChevronRight, Plus, ShieldAlert, Trash2, UserRound } from 'lucide-react'
import { RETENTION_MONTHS, VACANCY_STATUS, vacancyCountsText } from '../lib/vacancies'
import './VacanciesView.css'

// Vacantes dentro de Equipo: debajo de las personas de cada departamento, sus vacantes abiertas o
// en proceso («Vacante: <título>» con sus candidatos), «Nueva vacante» y, plegadas, las cubiertas.
// Al pulsar una se abre con todo (candidatos por estado, CV, notas, entrevistas, incorporar…).

export function VacancyStatusBadge({ status }) {
  return <span className={`vacancy-status ${status}`}>{VACANCY_STATUS[status] || status}</span>
}

// Aviso de protección de datos: descartados hace más de 6 meses.
export function RetentionNotice({ expired, onErase }) {
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

function VacancyCard({ vacancy, contacts, onOpen }) {
  return (
    <li>
      <button type="button" className="vacancy-card team-vacancy-card" onClick={() => onOpen(vacancy.id)}>
        <span className="vacancy-card-head">
          <span className="vacancy-card-title">
            <Briefcase size={14} strokeWidth={1.75} aria-hidden="true" />
            Vacante: {vacancy.title || 'Sin título'}
          </span>
          <VacancyStatusBadge status={vacancy.status} />
        </span>
        <span className="vacancy-card-count">
          <UserRound size={13} strokeWidth={1.75} />
          {vacancyCountsText(vacancy, contacts)}
        </span>
        <ChevronRight size={16} strokeWidth={1.75} className="team-vacancy-chevron" aria-hidden="true" />
      </button>
    </li>
  )
}

export function DepartmentVacancies({ group, contacts, canCreate, onOpen, onCreate }) {
  const vacancies = group.vacancies || []
  const active = vacancies.filter((v) => v.status !== 'filled')
  const filled = vacancies.filter((v) => v.status === 'filled')
  if (active.length === 0 && filled.length === 0 && !canCreate) return null
  return (
    <div className="team-vacancies">
      {active.length > 0 && (
        <ul className="vacancy-list team-vacancy-list">
          {active.map((v) => (
            <VacancyCard key={v.id} vacancy={v} contacts={contacts} onOpen={onOpen} />
          ))}
        </ul>
      )}
      {filled.length > 0 && (
        <details className="team-vacancies-filled">
          <summary>
            {filled.length === 1 ? '1 vacante cubierta' : `${filled.length} vacantes cubiertas`}
          </summary>
          <ul className="vacancy-list team-vacancy-list">
            {filled.map((v) => (
              <VacancyCard key={v.id} vacancy={v} contacts={contacts} onOpen={onOpen} />
            ))}
          </ul>
        </details>
      )}
      {canCreate && (
        <button type="button" className="team-new-vacancy" onClick={() => onCreate(group.area)}>
          <Plus size={14} strokeWidth={1.75} />
          Nueva vacante
        </button>
      )}
    </div>
  )
}
