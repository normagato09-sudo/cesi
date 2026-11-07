import { useEffect, useState } from 'react'
import { ArrowLeft, Briefcase, Search, Send, Users } from 'lucide-react'
import { APPLICATION_STATUS_LABEL, MESSAGE_MAX, applyToVacancy, dayLabel, listOpenVacancies, myApplications, seatsText, vacancyErrorText } from '../lib/vacancyBoard'
import './ContactsView.css'
import './StudentsView.css'
import './CoursesPage.css'
import './Vacancies.css'

/**
 * «Vacantes» para alumnos y equipo (parte 39), con el diseño de Cursos: las abiertas y, en cada una,
 * «Postularme» con un mensaje. Si ya se ha postulado: «Postulado – Pendiente» (o su estado).
 * meId: su cuenta. readOnly («Ver como»): sin postularse.
 */
export default function OpenVacancies({ client, meId, readOnly = false }) {
  const [list, setList] = useState(null)
  const [mine, setMine] = useState(() => new Map())
  const [error, setError] = useState(null)
  const [reload, setReload] = useState(0)
  const [selectedId, setSelectedId] = useState(null)
  const [query, setQuery] = useState('')
  const [message, setMessage] = useState('')
  const [busy, setBusy] = useState(false)
  const [sendError, setSendError] = useState(null)

  useEffect(() => {
    if (!client) return
    let active = true
    Promise.all([listOpenVacancies(client), meId ? myApplications(client, meId) : Promise.resolve(new Map())]).then(
      ([rows, applied]) => {
        if (!active) return
        setList(rows)
        setMine(applied)
        setError(null)
      },
      (err) => active && setError(vacancyErrorText(err)),
    )
    return () => {
      active = false
    }
  }, [client, meId, reload])

  const q = query.trim().toLocaleLowerCase('es')
  const shown = (list || []).filter((v) => !q || `${v.title} ${v.area}`.toLocaleLowerCase('es').includes(q))
  const selected = (list || []).find((v) => v.id === selectedId) || null
  const applied = selected ? mine.get(selected.id) : null

  const apply = async () => {
    setBusy(true)
    setSendError(null)
    try {
      await applyToVacancy(client, selected.id, message)
      setMessage('')
      setReload((n) => n + 1)
    } catch (err) {
      setSendError(vacancyErrorText(err))
    }
    setBusy(false)
  }

  return (
    <div className={`cp-root contacts-view${selected ? ' has-selection' : ''}`}>
      <div className="contacts-list-pane cp-list-pane">
        <div className="cp-list-head">
          <div className="cp-title-row">
            <h1 className="contacts-title">Vacantes</h1>
          </div>
          <label className="cp-search">
            <Search size={15} strokeWidth={1.75} />
            <input type="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Buscar vacante o área" aria-label="Buscar vacantes" />
          </label>
        </div>

        {error ? (
          <div className="contacts-empty">
            <p>{error}</p>
          </div>
        ) : !list ? (
          <div className="contacts-empty">
            <p>Cargando…</p>
          </div>
        ) : shown.length === 0 ? (
          <div className="contacts-empty">
            <Briefcase size={32} strokeWidth={1.5} />
            <p className="contacts-empty-title">{list.length ? 'Ninguna vacante con esa búsqueda' : 'Ahora mismo no hay vacantes abiertas'}</p>
          </div>
        ) : (
          <ul className="cp-cards">
            {shown.map((v) => {
              const a = mine.get(v.id)
              return (
                <li key={v.id}>
                  <button type="button" className={`cp-card${v.id === selectedId ? ' on' : ''}`} onClick={() => setSelectedId(v.id)}>
                    <span className="cp-card-top">
                      <strong>{v.title}</strong>
                      {a ? <span className="cp-status vac-en_pausa">Postulado – {APPLICATION_STATUS_LABEL[a.status]}</span> : <span className="cp-status vac-abierta">Abierta</span>}
                    </span>
                    <span className="cp-card-meta">{[v.area || 'Sin área', v.hoursPerWeek ? `${v.hoursPerWeek} por semana` : ''].filter(Boolean).join(' · ')}</span>
                    <span className="cp-card-meta">{seatsText(v)}</span>
                  </button>
                </li>
              )
            })}
          </ul>
        )}
      </div>

      <div className="contacts-detail-pane cp-detail-pane">
        {!selected ? (
          <div className="contacts-empty">
            <p>Elige una vacante para ver de qué trata y postularte.</p>
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
                </div>
                <p className="cp-detail-line">
                  {[selected.area || 'Sin área', seatsText(selected), selected.hoursPerWeek ? `${selected.hoursPerWeek} por semana` : '', selected.closesAt ? `hasta el ${dayLabel(selected.closesAt)}` : '']
                    .filter(Boolean)
                    .join(' · ')}
                </p>
              </div>
            </header>

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

            <section className="cp-section vac-apply">
              <h3>
                <Send size={14} strokeWidth={1.75} /> Postularme
              </h3>
              {applied ? (
                <span className="vac-applied">Postulado – {APPLICATION_STATUS_LABEL[applied.status]}</span>
              ) : (
                <>
                  <label className="sr-only" htmlFor="vac-message">
                    Mensaje
                  </label>
                  <textarea id="vac-message" rows={4} maxLength={MESSAGE_MAX} value={message} placeholder="Cuéntanos por qué te interesa (opcional)" onChange={(e) => setMessage(e.target.value)} disabled={readOnly} />
                  {sendError && <p className="vac-text">{sendError}</p>}
                  <button type="button" className="cp-btn primary" onClick={apply} disabled={busy || readOnly}>
                    <Send size={14} strokeWidth={1.75} />
                    {busy ? 'Enviando…' : 'Postularme'}
                  </button>
                </>
              )}
            </section>
          </div>
        )}
      </div>
    </div>
  )
}
