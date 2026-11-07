import { useEffect, useState } from 'react'
import { ArrowLeft, Briefcase, CheckCircle2, Loader2 } from 'lucide-react'
import { dayLabel, seatsText } from '../lib/vacancyBoard'
import { LIMITS, applyResultText, emptyApplication, validateApplication } from '../lib/vacancyApplications'
import { loadPublicVacancies, sendPublicApplication } from '../lib/vacanciesPublic'
import '../ficha/FichaPage.css'
import './VacantesPage.css'

const CONFIG = { url: import.meta.env.VITE_SUPABASE_URL, anonKey: import.meta.env.VITE_SUPABASE_ANON_KEY }

function Field({ label, optional = false, children }) {
  return (
    <label className="ficha-field">
      <span>
        {label}
        {optional && <em> (opcional)</em>}
      </span>
      {children}
    </label>
  )
}

function Shell({ children }) {
  return (
    <div className="ficha">
      <main className="ficha-card">{children}</main>
      <p className="ficha-footer">CIFA · Tus datos solo los ven la dirección y RRHH, para valorar tu candidatura.</p>
    </div>
  )
}

// El formulario de una vacante (sin cuenta): nombre, correo, Discord (opcional), lo mismo que en la
// app y la casilla de consentimiento. «website» es el campo oculto contra robots.
function ApplyForm({ vacancy, onBack, onSent }) {
  const [form, setForm] = useState(emptyApplication)
  const [error, setError] = useState(null)
  const [sending, setSending] = useState(false)
  const set = (patch) => setForm((f) => ({ ...f, ...patch }))

  const send = async (e) => {
    e.preventDefault()
    const invalid = validateApplication(form, { publicForm: true })
    if (invalid) return setError(invalid)
    setSending(true)
    setError(null)
    try {
      const result = await sendPublicApplication(CONFIG, vacancy.id, form)
      const text = applyResultText(result)
      if (text) setError(text)
      else return onSent()
    } catch (err) {
      setError(err.message)
    }
    setSending(false)
  }

  return (
    <>
      <button type="button" className="vacantes-back" onClick={onBack}>
        <ArrowLeft size={16} strokeWidth={1.75} /> Todas las vacantes
      </button>
      <header className="ficha-header">
        <h1>{vacancy.title}</h1>
        <p>{[vacancy.area, seatsText(vacancy), vacancy.hoursPerWeek ? `${vacancy.hoursPerWeek} por semana` : '', vacancy.closesAt ? `hasta el ${dayLabel(vacancy.closesAt)}` : ''].filter(Boolean).join(' · ')}</p>
      </header>
      {vacancy.description && (
        <section className="vacantes-block">
          <h2>Descripción</h2>
          <p>{vacancy.description}</p>
        </section>
      )}
      {vacancy.requirements && (
        <section className="vacantes-block">
          <h2>Requisitos</h2>
          <p>{vacancy.requirements}</p>
        </section>
      )}

      <form className="ficha-form" onSubmit={send} noValidate>
        <h2 className="vacantes-form-title">Postularme</h2>
        <Field label="Nombre">
          <input type="text" value={form.name} maxLength={LIMITS.name} onChange={(e) => set({ name: e.target.value })} autoComplete="name" required />
        </Field>
        <Field label="Correo">
          <input type="email" value={form.email} maxLength={LIMITS.email} onChange={(e) => set({ email: e.target.value })} autoComplete="email" required />
        </Field>
        <Field label="Discord" optional>
          <input type="text" value={form.discord} maxLength={LIMITS.discord} onChange={(e) => set({ discord: e.target.value })} autoComplete="off" />
        </Field>
        <Field label="¿Por qué te interesa?">
          <textarea rows={4} value={form.motivation} maxLength={LIMITS.motivation} onChange={(e) => set({ motivation: e.target.value })} required />
        </Field>
        <Field label="Experiencia" optional>
          <textarea rows={3} value={form.experience} maxLength={LIMITS.experience} onChange={(e) => set({ experience: e.target.value })} />
        </Field>
        <Field label="Disponibilidad" optional>
          <input type="text" value={form.availability} maxLength={LIMITS.availability} onChange={(e) => set({ availability: e.target.value })} placeholder="Por ejemplo: tardes, 4 h a la semana" />
        </Field>
        {/* Campo oculto: las personas no lo ven; si llega relleno, es un robot. */}
        <div className="vacantes-hp" aria-hidden="true">
          <label>
            Web
            <input type="text" tabIndex={-1} autoComplete="off" value={form.website} onChange={(e) => set({ website: e.target.value })} />
          </label>
        </div>
        <label className="vacantes-consent">
          <input type="checkbox" checked={form.consent} onChange={(e) => set({ consent: e.target.checked })} />
          <span>Acepto que CIFA guarde y use estos datos solo para valorar mi candidatura y contactar conmigo.</span>
        </label>
        {error && <p className="ficha-error">{error}</p>}
        <button type="submit" className="ficha-submit" disabled={sending}>
          {sending ? 'Enviando…' : 'Enviar candidatura'}
        </button>
      </form>
    </>
  )
}

// Página pública /vacantes: las abiertas, y al elegir una, de qué trata y el formulario.
export default function VacantesPage() {
  const [list, setList] = useState(null)
  const [error, setError] = useState(null)
  const [selectedId, setSelectedId] = useState(null)
  const [sent, setSent] = useState(null) // la vacante a la que se ha enviado

  useEffect(() => {
    let active = true
    loadPublicVacancies(CONFIG).then(
      (rows) => active && setList(rows),
      (err) => active && setError(err.message),
    )
    return () => {
      active = false
    }
  }, [])

  const selected = (list || []).find((v) => v.id === selectedId) || null

  if (sent) {
    return (
      <Shell>
        <div className="ficha-message">
          <CheckCircle2 size={36} strokeWidth={1.75} color="#16a34a" />
          <h1>¡Candidatura enviada!</h1>
          <p>Hemos recibido tu candidatura a «{sent.title}». Si encajas, te escribiremos al correo o por Discord.</p>
          <button
            type="button"
            className="vacantes-back"
            onClick={() => {
              setSent(null)
              setSelectedId(null)
            }}
          >
            Ver otras vacantes
          </button>
        </div>
      </Shell>
    )
  }

  if (selected) {
    return (
      <Shell>
        <ApplyForm key={selected.id} vacancy={selected} onBack={() => setSelectedId(null)} onSent={() => setSent(selected)} />
      </Shell>
    )
  }

  return (
    <Shell>
      <header className="ficha-header">
        <h1>Vacantes en CIFA</h1>
        <p>Elige una vacante para ver de qué trata y enviar tu candidatura. No hace falta tener cuenta.</p>
      </header>
      {error ? (
        <p className="ficha-error">{error}</p>
      ) : !list ? (
        <div className="ficha-message">
          <Loader2 size={28} className="ficha-spin" />
        </div>
      ) : list.length === 0 ? (
        <div className="ficha-message">
          <Briefcase size={32} strokeWidth={1.5} />
          <p>Ahora mismo no hay vacantes abiertas. Vuelve a mirar más adelante.</p>
        </div>
      ) : (
        <ul className="vacantes-list">
          {list.map((v) => (
            <li key={v.id}>
              <button type="button" onClick={() => setSelectedId(v.id)}>
                <strong>{v.title}</strong>
                <span>{[v.area, v.hoursPerWeek ? `${v.hoursPerWeek} por semana` : '', seatsText(v)].filter(Boolean).join(' · ')}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </Shell>
  )
}
