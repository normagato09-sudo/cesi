import { useEffect, useState } from 'react'
import { ArrowLeft, Briefcase, ClipboardList, Search, Send, Users } from 'lucide-react'
import { dayLabel, listOpenVacancies, seatsText, vacancyErrorText } from '../lib/vacancyBoard'
import { APPLICATION_STATUS_LABEL, LIMITS, applicationErrorText, applyResultText, applyToVacancy, emptyApplication, myApplications, validateApplication } from '../lib/vacancyApplications'
import { countryName } from '../lib/timezones'
import './ContactsView.css'
import './StudentsView.css'
import './CoursesPage.css'
import './Vacancies.css'

function Field({ label, optional = false, children }) {
  return (
    <label className="vac-field">
      <span>
        {label}
        {optional && <em> (opcional)</em>}
      </span>
      {children}
    </label>
  )
}

// El formulario de «Postularme» (motivo, experiencia, disponibilidad y contacto).
function ApplyForm({ client, vacancy, me, readOnly, onSent }) {
  const [form, setForm] = useState(() => emptyApplication({ email: me?.email, discord: me?.discord }))
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)
  const set = (patch) => setForm((f) => ({ ...f, ...patch }))

  const send = async (e) => {
    e.preventDefault()
    const invalid = validateApplication(form)
    if (invalid) return setError(invalid)
    setBusy(true)
    setError(null)
    try {
      const result = await applyToVacancy(client, vacancy.id, form)
      const text = applyResultText(result)
      if (text) setError(text)
      else onSent()
    } catch (err) {
      setError(applicationErrorText(err))
    }
    setBusy(false)
  }

  return (
    <form className="vac-apply" onSubmit={send}>
      <p className="cp-muted">
        Se envía con tu nombre y tu país del perfil: <strong>{me?.name || 'Sin nombre'}</strong>
        {me?.country ? ` · ${countryName(me.country)}` : ''}.
      </p>
      <Field label="¿Por qué te interesa?">
        <textarea rows={4} maxLength={LIMITS.motivation} value={form.motivation} onChange={(e) => set({ motivation: e.target.value })} disabled={readOnly} />
      </Field>
      <Field label="Experiencia" optional>
        <textarea rows={3} maxLength={LIMITS.experience} value={form.experience} onChange={(e) => set({ experience: e.target.value })} disabled={readOnly} placeholder="Lo que has hecho antes que tenga que ver" />
      </Field>
      <Field label="Disponibilidad" optional>
        <input type="text" maxLength={LIMITS.availability} value={form.availability} onChange={(e) => set({ availability: e.target.value })} disabled={readOnly} placeholder="Por ejemplo: tardes, 4 h a la semana" />
      </Field>
      <div className="vac-row">
        <Field label="Discord" optional>
          <input type="text" maxLength={LIMITS.discord} value={form.discord} onChange={(e) => set({ discord: e.target.value })} disabled={readOnly} autoComplete="off" />
        </Field>
        <Field label="Correo" optional>
          <input type="email" maxLength={LIMITS.email} value={form.email} onChange={(e) => set({ email: e.target.value })} disabled={readOnly} autoComplete="email" />
        </Field>
      </div>
      {error && <p className="vac-error">{error}</p>}
      <button type="submit" className="cp-btn primary" disabled={busy || readOnly}>
        <Send size={14} strokeWidth={1.75} />
        {busy ? 'Enviando…' : 'Postularme'}
      </button>
    </form>
  )
}

/**
 * «Vacantes» para alumnos y equipo (parte 40), con el diseño de Cursos: las abiertas y, en cada una,
 * «Postularme» con el formulario. «Mis candidaturas»: las suyas con su estado (solo las ve cada uno).
 * me: { name, country, email, discord } de su perfil. readOnly («Ver como»): sin enviar.
 */
export default function OpenVacancies({ client, me = null, readOnly = false }) {
  const [list, setList] = useState(null)
  const [mine, setMine] = useState(() => new Map())
  const [error, setError] = useState(null)
  const [reload, setReload] = useState(0)
  const [selectedId, setSelectedId] = useState(null)
  const [query, setQuery] = useState('')

  useEffect(() => {
    if (!client) return
    let active = true
    listOpenVacancies(client).then(
      (rows) => {
        if (!active) return
        setList(rows)
        setError(null)
      },
      (err) => active && setError(err?.code === 'PGRST202' ? applicationErrorText(err) : vacancyErrorText(err)),
    )
    if (!readOnly) myApplications(client).then((m) => active && setMine(m), () => {})
    return () => {
      active = false
    }
  }, [client, readOnly, reload])

  const q = query.trim().toLocaleLowerCase('es')
  const shown = (list || []).filter((v) => !q || `${v.title} ${v.area}`.toLocaleLowerCase('es').includes(q))
  const selected = (list || []).find((v) => v.id === selectedId) || null
  const applied = selected ? mine.get(selected.id) : null
  // Mis candidaturas (también las de vacantes ya cerradas).
  const history = [...mine.values()].sort((a, b) => (b.created_at || '').localeCompare(a.created_at || ''))

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
                      {a ? <span className="cp-status vac-en_pausa">Enviada · {APPLICATION_STATUS_LABEL[a.status] || a.status}</span> : <span className="cp-status vac-abierta">Abierta</span>}
                    </span>
                    <span className="cp-card-meta">{[v.area || 'Sin área', v.hoursPerWeek ? `${v.hoursPerWeek} por semana` : ''].filter(Boolean).join(' · ')}</span>
                    <span className="cp-card-meta">{seatsText(v)}</span>
                  </button>
                </li>
              )
            })}
          </ul>
        )}

        {history.length > 0 && (
          <section className="vac-mine" aria-label="Mis candidaturas">
            <h2>
              <ClipboardList size={14} strokeWidth={1.75} /> Mis candidaturas
            </h2>
            <ul>
              {history.map((a) => (
                <li key={a.id}>
                  <span>{a.title}</span>
                  <span className={`vac-app-status st-${a.status}`}>{APPLICATION_STATUS_LABEL[a.status] || a.status}</span>
                </li>
              ))}
            </ul>
          </section>
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

            <section className="cp-section">
              <h3>
                <Send size={14} strokeWidth={1.75} /> Postularme
              </h3>
              {applied ? (
                <p className="vac-applied">Candidatura enviada · {APPLICATION_STATUS_LABEL[applied.status] || applied.status}</p>
              ) : (
                <ApplyForm key={selected.id} client={client} vacancy={selected} me={me} readOnly={readOnly} onSent={() => setReload((n) => n + 1)} />
              )}
            </section>
          </div>
        )}
      </div>
    </div>
  )
}
