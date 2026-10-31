import { useMemo, useState } from 'react'
import { Briefcase, Plus } from 'lucide-react'
import { RetentionNotice, VacancyStatusBadge } from './TeamVacancies.jsx'
import VacancyFormModal from './VacancyFormModal.jsx'
import { expiredDiscarded, vacancyCountsText } from '../lib/vacancies'
import { unplacedVacancies } from '../lib/departments'
import './ContactsView.css'
import './VacanciesView.css'
import './SectionPage.css'

const ORDER = { open: 0, in_progress: 1, filled: 2 }

// Equipo → Vacantes: todas las vacantes (abiertas y en proceso primero), con «Nueva vacante» y el
// aviso de los candidatos descartados que ya hay que borrar. Al pulsar una se abre con todo.
export default function VacancyListView({ vacancies = [], contacts = [], now, areas = [], onOpenVacancy, onCreateVacancy, onEraseExpired }) {
  const [creating, setCreating] = useState(false)
  const sorted = [...vacancies].sort((a, b) => (ORDER[a.status] ?? 3) - (ORDER[b.status] ?? 3))
  const expired = useMemo(() => expiredDiscarded(contacts, now), [contacts, now])
  const unplaced = unplacedVacancies(vacancies)
  return (
    <div className="section-page">
      <div className="contacts-header">
        <h1 className="contacts-title">Vacantes</h1>
        {onCreateVacancy && (
          <button type="button" className="contacts-new-btn" onClick={() => setCreating(true)}>
            <Plus size={15} strokeWidth={1.75} />
            <span>Nueva vacante</span>
          </button>
        )}
      </div>
      <div className="section-page-body">
        {onEraseExpired && <RetentionNotice expired={expired} onErase={onEraseExpired} />}
        {unplaced.length > 0 && (
          <p className="section-page-hint">
            Sin área al pasar los departamentos a las áreas (ábrelas y elige su área): {unplaced.map((v) => `${v.title || 'Sin título'} (antes: ${v.legacyArea})`).join(' · ')}
          </p>
        )}
        {sorted.length === 0 ? (
          <div className="contacts-empty">
            <Briefcase size={28} strokeWidth={1.5} />
            <p className="contacts-empty-title">Todavía no hay vacantes</p>
          </div>
        ) : (
          <ul className="contacts-list">
            {sorted.map((v) => (
              <li key={v.id} className="contact-row">
                <button type="button" className="contact-row-main" onClick={() => onOpenVacancy(v.id)}>
                  <span className="contact-row-text">
                    <span className="contact-row-name">{v.title || 'Vacante sin título'}</span>
                    <span className="contact-row-country">{[v.area, vacancyCountsText(v, contacts)].filter(Boolean).join(' · ')}</span>
                  </span>
                  <VacancyStatusBadge status={v.status} />
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
      {creating && (
        <VacancyFormModal
          areas={areas}
          onSubmit={(data) => onOpenVacancy(onCreateVacancy(data).id)}
          onClose={() => setCreating(false)}
        />
      )}
    </div>
  )
}
