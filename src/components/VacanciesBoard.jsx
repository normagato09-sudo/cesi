import { useEffect, useState } from 'react'
import { ArrowLeft, Briefcase, Pencil, Plus, Search, Trash2, Users } from 'lucide-react'
import VacancyForm from './VacancyForm.jsx'
import { APPLICATION_STATUSES, VACANCY_AREAS, VACANCY_FILTERS, VACANCY_STATUSES, VACANCY_STATUS_LABEL, dayLabel, filterVacancies, listApplicants, normalizeVacancy, seatsText, setApplicationStatus, vacancyErrorText } from '../lib/vacancyBoard'
import './ContactsView.css'
import './StudentsView.css'
import './CoursesPage.css'
import './Vacancies.css'

function StatusChip({ status }) {
  return <span className={`cp-status vac-${status}`}>{VACANCY_STATUS_LABEL[status]}</span>
}

function Stat({ label, value, sub = '' }) {
  return (
    <div className="cp-stat">
      <span className="cp-stat-label">{label}</span>
      <strong>{value}</strong>
      {sub && <span className="cp-stat-sub">{sub}</span>}
    </div>
  )
}

// Postulantes de una vacante (la ceo, Directivo y RRHH): nombre, mensaje, fecha y estado.
function Applicants({ client, vacancyId }) {
  const [rows, setRows] = useState(null)
  const [error, setError] = useState(null)
  const [reload, setReload] = useState(0)

  useEffect(() => {
    let active = true
    listApplicants(client, vacancyId).then(
      (list) => {
        if (!active) return
        setRows(list)
        setError(null)
      },
      (err) => active && setError(vacancyErrorText(err)),
    )
    return () => {
      active = false
    }
  }, [client, vacancyId, reload])

  const change = async (a, status) => {
    try {
      await setApplicationStatus(client, a.id, status)
    } catch (err) {
      setError(vacancyErrorText(err))
    }
    setReload((n) => n + 1)
  }

  return (
    <section className="cp-section">
      <h3>
        <Users size={14} strokeWidth={1.75} /> Postulantes{rows ? ` (${rows.length})` : ''}
      </h3>
      {error ? (
        <p className="vac-text">{error}</p>
      ) : !rows ? (
        <p className="vac-text">Cargando…</p>
      ) : rows.length === 0 ? (
        <p className="vac-text">Todavía no se ha postulado nadie.</p>
      ) : (
        <ul className="vac-applicants">
          {rows.map((a) => (
            <li key={a.id}>
              <div>
                <strong>{a.name}</strong>
                <span className="cp-muted"> · {a.role} · {new Date(a.created_at).toLocaleDateString('es-ES', { day: 'numeric', month: 'short', year: 'numeric' })}</span>
                {a.message && <p className="vac-text">{a.message}</p>}
              </div>
              <select value={a.status} onChange={(e) => change(a, e.target.value)} aria-label={`Estado de la postulación de ${a.name}`}>
                {APPLICATION_STATUSES.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.label}
                  </option>
                ))}
              </select>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}

/**
 * «Vacantes» con el diseño de «Cursos» (mismas tarjetas, filtros, ficha y formulario): título,
 * área, plazas, horas por semana y estado. Filtros por estado (Todas / Abiertas / En pausa /
 * Cerradas) y por área; «Nueva vacante» y, en cada una, Editar, cambiar el estado y Borrar.
 * vacancies: la lista. onSave(id | null, datos) y onDelete(id) pueden devolver promesas.
 * error: si no se pudo cargar (se enseña en vez de la lista). applicantsClient: el cliente de
 * Supabase para ver los postulantes de cada vacante (null: sin ellos).
 */
export default function VacanciesBoard({ vacancies, onSave, onDelete, error = null, applicantsClient = null }) {
  const [selectedId, setSelectedId] = useState(null)
  const [form, setForm] = useState(null) // { vacancy } (null: nueva)
  const [query, setQuery] = useState('')
  const [status, setStatus] = useState('')
  const [area, setArea] = useState('')
  const [busy, setBusy] = useState(false)
  const [actionError, setActionError] = useState(null)

  const list = vacancies || []
  const shown = filterVacancies(list, { status, area, query })
  const raw = list.find((v) => v.id === selectedId) || null
  const selected = raw ? normalizeVacancy(raw) : null

  const run = async (fn) => {
    setBusy(true)
    setActionError(null)
    try {
      await fn()
    } catch (err) {
      setActionError(err.message || 'No se pudo guardar.')
    }
    setBusy(false)
  }
  const changeStatus = (v, next) => run(() => onSave(v.id, { ...dataOf(v), status: next }))
  const remove = (v) => {
    if (!window.confirm(`¿Borrar la vacante «${v.title}»? No se puede deshacer.`)) return
    run(async () => {
      await onDelete(v.id)
      setForm(null)
      setSelectedId(null)
    })
  }

  return (
    <div className={`cp-root contacts-view${selected ? ' has-selection' : ''}`}>
      <div className="contacts-list-pane cp-list-pane">
        <div className="cp-list-head">
          <div className="cp-title-row">
            <h1 className="contacts-title">Vacantes</h1>
            <button type="button" className="cp-btn primary" onClick={() => setForm({ vacancy: null })} disabled={!!error}>
              <Plus size={15} strokeWidth={2} />
              Nueva vacante
            </button>
          </div>
          <label className="cp-search">
            <Search size={15} strokeWidth={1.75} />
            <input type="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Buscar vacante o área" aria-label="Buscar vacantes" />
          </label>
          <div className="cp-filters" role="group" aria-label="Filtrar por estado">
            {VACANCY_FILTERS.map((f) => (
              <button key={f.id || 'all'} type="button" className={`cp-filter${status === f.id ? ' on' : ''}`} aria-pressed={status === f.id} onClick={() => setStatus(f.id)}>
                {f.label}
              </button>
            ))}
          </div>
          <div className="cp-filters">
            <select value={area} onChange={(e) => setArea(e.target.value)} aria-label="Filtrar por área">
              <option value="">Todas las áreas</option>
              {VACANCY_AREAS.map((a) => (
                <option key={a} value={a}>
                  {a}
                </option>
              ))}
            </select>
          </div>
        </div>

        {error ? (
          <div className="contacts-empty">
            <p>{error}</p>
          </div>
        ) : !vacancies ? (
          <div className="contacts-empty">
            <p>Cargando…</p>
          </div>
        ) : list.length === 0 ? (
          <div className="contacts-empty">
            <Briefcase size={32} strokeWidth={1.5} />
            <p className="contacts-empty-title">Todavía no hay vacantes</p>
            <p>Crea una vacante con su área, sus plazas y las horas por semana.</p>
          </div>
        ) : shown.length === 0 ? (
          <div className="contacts-empty">
            <p>Ninguna vacante con esa búsqueda, ese estado o esa área.</p>
          </div>
        ) : (
          <ul className="cp-cards">
            {shown.map((v) => (
              <li key={v.id}>
                <button type="button" className={`cp-card${v.id === selectedId ? ' on' : ''}`} onClick={() => setSelectedId(v.id)}>
                  <span className="cp-card-top">
                    <strong>{v.title}</strong>
                    <StatusChip status={v.status} />
                  </span>
                  <span className="cp-card-meta">{[v.area || 'Sin área', v.hoursPerWeek ? `${v.hoursPerWeek} por semana` : ''].filter(Boolean).join(' · ')}</span>
                  <span className="cp-card-meta">{seatsText(v)}</span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="contacts-detail-pane cp-detail-pane">
        {!selected ? (
          <div className="contacts-empty">
            <p>Selecciona una vacante para ver sus datos, cambiar su estado o editarla.</p>
          </div>
        ) : (
          <div className="cp-detail">
            <button type="button" className="contact-back-btn" onClick={() => setSelectedId(null)}>
              <ArrowLeft size={16} strokeWidth={1.75} />
              Vacantes
            </button>

            <header className="cp-detail-head">
              <div>
                <div className="cp-detail-title">
                  <h2>{selected.title}</h2>
                  <StatusChip status={selected.status} />
                </div>
                <p className="cp-detail-line">
                  {[selected.area || 'Sin área', seatsText(selected), selected.hoursPerWeek ? `${selected.hoursPerWeek} por semana` : ''].filter(Boolean).join(' · ')}
                </p>
              </div>
              <div className="cp-detail-actions">
                <label className="vac-status-pick">
                  <span className="sr-only">Estado</span>
                  <select value={selected.status} disabled={busy} onChange={(e) => changeStatus(selected, e.target.value)} aria-label="Cambiar el estado">
                    {VACANCY_STATUSES.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.label}
                      </option>
                    ))}
                  </select>
                </label>
                <button type="button" className="cp-btn" onClick={() => remove(selected)} disabled={busy}>
                  <Trash2 size={14} strokeWidth={1.75} />
                  Borrar
                </button>
                <button type="button" className="cp-btn primary" onClick={() => setForm({ vacancy: raw })} disabled={busy}>
                  <Pencil size={14} strokeWidth={1.75} />
                  Editar vacante
                </button>
              </div>
            </header>
            {actionError && <p className="cp-start-warn">{actionError}</p>}

            <div className="cp-stats">
              <Stat label="Plazas" value={selected.seats ?? '—'} sub={selected.seats === null ? 'Sin indicar' : ''} />
              <Stat label="Horas por semana" value={selected.hoursPerWeek || '—'} />
              <Stat label="Publicada" value={dayLabel(selected.openedAt) || '—'} sub={selected.createdBy ? `por ${selected.createdBy}` : ''} />
              <Stat label="Cierre" value={dayLabel(selected.closesAt) || 'Sin fecha'} />
            </div>

            <section className="cp-section">
              <h3>
                <Briefcase size={14} strokeWidth={1.75} /> Descripción
              </h3>
              <p className="vac-text">{selected.description || 'Sin descripción.'}</p>
            </section>
            <section className="cp-section">
              <h3>
                <Users size={14} strokeWidth={1.75} /> Requisitos
              </h3>
              <p className="vac-text">{selected.requirements || 'Sin requisitos.'}</p>
            </section>
            {applicantsClient && <Applicants key={selected.id} client={applicantsClient} vacancyId={selected.id} />}
          </div>
        )}
      </div>

      {form && <VacancyForm vacancy={form.vacancy} onClose={() => setForm(null)} onSubmit={onSave} onDelete={(v) => remove(normalizeVacancy(v))} />}
    </div>
  )
}

// Los campos que se guardan de una vacante (para cambiar solo el estado).
function dataOf(v) {
  return {
    title: v.title,
    area: v.area,
    description: v.description,
    requirements: v.requirements,
    hoursPerWeek: v.hoursPerWeek,
    seats: v.seats,
    status: v.status,
    openedAt: v.openedAt,
    closesAt: v.closesAt,
  }
}
