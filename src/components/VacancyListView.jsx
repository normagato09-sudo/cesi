import { Briefcase } from 'lucide-react'
import { VacancyStatusBadge } from './TeamVacancies.jsx'
import { vacancyCountsText } from '../lib/vacancies'
import './ContactsView.css'
import './VacanciesView.css'
import './SectionPage.css'

const ORDER = { open: 0, in_progress: 1, filled: 2 }

// Equipo → Vacantes: todas las vacantes (abiertas y en proceso primero). Al pulsar una se abre
// con todo, como desde su departamento en Personas. Las vacantes nuevas se crean en Personas,
// dentro de su departamento.
export default function VacancyListView({ vacancies = [], contacts = [], onOpenVacancy }) {
  const sorted = [...vacancies].sort((a, b) => (ORDER[a.status] ?? 3) - (ORDER[b.status] ?? 3))
  return (
    <div className="section-page">
      <div className="contacts-header">
        <h1 className="contacts-title">Vacantes</h1>
        <p className="section-page-hint">Para crear una vacante, ve a Personas y hazlo en su departamento.</p>
      </div>
      <div className="section-page-body">
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
    </div>
  )
}
