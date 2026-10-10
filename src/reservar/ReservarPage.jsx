import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { CalendarCheck, CheckCircle2, Clock, Globe, LinkIcon, Loader2 } from 'lucide-react'
import TimeZoneSelect from '../components/TimeZoneSelect.jsx'
import PlaceIcon from '../components/PlaceIcon.jsx'
import { cleanOptions, placeLabel, placeOf } from '../lib/videoCall'
import {
  DAY_OFF_TEXT,
  FIELD_LIMITS,
  bookingDays,
  errorText,
  loadBooking,
  minutesLabel,
  sendBooking,
  tokenFromPath,
  validateRequest,
  visitorZone,
  whenText,
  zoneText,
} from '../lib/bookingPage'
import '../ficha/FichaPage.css'
import './ReservarPage.css'

const CONFIG = { url: import.meta.env.VITE_SUPABASE_URL, anonKey: import.meta.env.VITE_SUPABASE_ANON_KEY }
const EMPTY_FORM = { name: '', email: '', phone: '', reason: '' }

function Shell({ children }) {
  return (
    <div className="ficha">
      <main className="ficha-card">{children}</main>
      <p className="ficha-footer">CESI · Solo ves los huecos libres; tus datos solo los recibe quien te envió el enlace.</p>
    </div>
  )
}

function Message({ icon, title, text, children }) {
  return (
    <Shell>
      <div className="ficha-message">
        {icon}
        <h1>{title}</h1>
        {text && <p>{text}</p>}
        {children}
      </div>
    </Shell>
  )
}

function Field({ label, optional, children }) {
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

// Página pública /reservar/<token>: elegir duración y hueco, y pedir la reunión.
export default function ReservarPage() {
  const [token] = useState(() => tokenFromPath(window.location.pathname))
  // País y zona de quien reserva (por defecto, los de su navegador): todas las horas van en esa zona.
  const [zone, setZone] = useState(visitorZone)
  const tz = zone.timeZone
  const [state, setState] = useState(token ? 'loading' : 'invalid') // loading | invalid | error | ready | sent
  const [data, setData] = useState(null)
  const [minutes, setMinutes] = useState(null)
  const [slot, setSlot] = useState(null) // Date
  const [form, setForm] = useState(EMPTY_FORM)
  const [error, setError] = useState(null)
  const [sending, setSending] = useState(false)
  // Dónde hacer la reunión (entre las opciones que ofrece el enlace).
  const [place, setPlace] = useState(null)
  const [sent, setSent] = useState(null)
  const formRef = useRef(null)

  // Lo que devuelve cesi_booking_get (null: el enlace no vale).
  const apply = useCallback((result) => {
    if (!result) {
      setState('invalid')
      return
    }
    setData(result)
    // Si solo hay una opción, ya queda elegida.
    const options = cleanOptions(result.videoOptions)
    setPlace((p) => (p && options.includes(p) ? p : options.length === 1 ? options[0] : null))
    setMinutes((m) => (m && result.durations.includes(m) ? m : result.durations[0]))
    setState('ready')
  }, [])

  const reload = () => loadBooking(token, CONFIG).then(apply)

  useEffect(() => {
    if (!token) return
    let active = true
    loadBooking(token, CONFIG)
      .then((result) => active && apply(result))
      .catch(() => active && setState('error'))
    return () => {
      active = false
    }
  }, [token, apply])

  const days = useMemo(
    () =>
      data && minutes
        ? bookingDays({ until: data.until, free: data.free, daysOff: data.daysOff, minutes, stepMinutes: data.stepMinutes, tz })
        : [],
    [data, minutes, tz],
  )
  const anySlot = days.some((d) => d.slots.length > 0)
  // Versiones de Supabase anteriores no devuelven opciones: entonces no se pregunta.
  const placeOptions = data && Array.isArray(data.videoOptions) ? cleanOptions(data.videoOptions) : []

  useEffect(() => {
    if (slot) formRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }, [slot])

  if (state === 'loading') {
    return <Message icon={<Loader2 className="ficha-spin" size={28} strokeWidth={1.75} />} title="Cargando los huecos libres…" />
  }
  if (state === 'invalid') {
    return (
      <Message
        icon={<LinkIcon size={28} strokeWidth={1.75} />}
        title="Este enlace ya no está activo"
        text="Puede que lo hayan cambiado o desactivado. Pide uno nuevo a quien te lo envió."
      />
    )
  }
  if (state === 'error') {
    return (
      <Message
        icon={<LinkIcon size={28} strokeWidth={1.75} />}
        title="No se han podido cargar los huecos"
        text="Comprueba la conexión y vuelve a abrir el enlace."
      />
    )
  }
  if (state === 'sent' && sent) {
    return (
      <Message
        icon={<CheckCircle2 size={30} strokeWidth={1.75} className="reservar-ok" />}
        title="Solicitud enviada"
        text={`Has pedido una reunión el ${whenText(sent.start, sent.tz)}, de ${minutesLabel(sent.minutes)}${sent.place ? ` (${placeLabel(sent.place)})` : ''}. Te avisaremos por ${sent.channel} cuando esté confirmada${sent.place && sent.place !== 'in_person' ? ', con el enlace de la reunión' : ''}.`}
      >
        <button type="button" className="reservar-link-btn" onClick={() => window.location.reload()}>
          Pedir otra reunión
        </button>
      </Message>
    )
  }

  const title = data.name ? `Reserva una reunión con ${data.name}` : 'Reserva una reunión'
  const set = (field) => (e) => setForm((f) => ({ ...f, [field]: e.target.value }))

  const pickDuration = (m) => {
    setMinutes(m)
    setSlot(null)
    setError(null)
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError(null)
    const problem = placeOptions.length > 0 && !place ? 'Elige dónde quieres hacer la reunión.' : validateRequest(form)
    if (problem) {
      setError(problem)
      return
    }
    setSending(true)
    try {
      await sendBooking(token, { start: slot, minutes, ...form, tz, place: placeOptions.length > 0 ? place : null }, CONFIG)
      setSent({ start: slot, minutes, tz, place: placeOptions.length > 0 ? place : null, channel: form.email.trim() ? 'email' : 'teléfono o WhatsApp' })
      setState('sent')
    } catch (err) {
      if (err.code === 'invalid_link') {
        setState('invalid')
        return
      }
      setError(errorText(err.code))
      // El hueco ya no está: se recargan los huecos y se elige otro.
      if (err.code === 'slot_taken' || err.code === 'invalid_slot') {
        setSlot(null)
        await reload().catch(() => {})
      }
    } finally {
      setSending(false)
    }
  }

  return (
    <Shell>
      <header className="ficha-header">
        <h1>{title}</h1>
        <p>Elige cuánto tiempo necesitas y un hueco libre. Después cuéntame quién eres y el motivo, y te confirmaré la reunión.</p>
      </header>

      <section className="reservar-section reservar-country" aria-labelledby="reservar-country">
        <h2 id="reservar-country">
          <Globe size={16} strokeWidth={1.9} aria-hidden="true" />
          ¿Desde qué país reservas?
        </h2>
        <TimeZoneSelect
          value={zone}
          onChange={(next) => {
            // Con varias zonas, la primera del país hasta que elija otra.
            if (next?.country) setZone({ country: next.country, timeZone: next.timeZone })
          }}
        />
      </section>

      <section className="reservar-section" aria-labelledby="reservar-duration">
        <h2 id="reservar-duration">Duración</h2>
        <div className="reservar-chips" role="radiogroup" aria-labelledby="reservar-duration">
          {data.durations.map((m) => (
            <button
              key={m}
              type="button"
              role="radio"
              aria-checked={minutes === m}
              className={`reservar-chip${minutes === m ? ' active' : ''}`}
              onClick={() => pickDuration(m)}
            >
              <Clock size={14} strokeWidth={2} aria-hidden="true" />
              {minutesLabel(m)}
            </button>
          ))}
        </div>
      </section>

      <section className="reservar-section" aria-labelledby="reservar-days">
        <h2 id="reservar-days">Hueco</h2>
        <p className="reservar-zone">
          <Globe size={14} strokeWidth={1.9} aria-hidden="true" />
          {zoneText(tz)}
        </p>
        {days.length === 0 || !anySlot ? (
          <p className="reservar-empty">Ahora mismo no hay huecos libres. Vuelve a probar más adelante.</p>
        ) : null}
        <ul className="reservar-days">
          {days.map((day) => (
            <li key={day.key} className="reservar-day">
              <h3>{day.label.charAt(0).toUpperCase() + day.label.slice(1)}</h3>
              {day.off ? (
                <p className="reservar-day-off">{DAY_OFF_TEXT[day.off]}</p>
              ) : day.slots.length === 0 ? (
                <p className="reservar-day-none">Sin huecos</p>
              ) : (
                <div className="reservar-slots">
                  {day.slots.map((s) => {
                    const active = slot && slot.getTime() === s.start.getTime()
                    return (
                      <button
                        key={s.start.toISOString()}
                        type="button"
                        className={`reservar-slot${active ? ' active' : ''}`}
                        aria-pressed={!!active}
                        onClick={() => {
                          setSlot(s.start)
                          setError(null)
                        }}
                      >
                        {s.time}
                      </button>
                    )
                  })}
                </div>
              )}
            </li>
          ))}
        </ul>
      </section>

      {slot && (
        <form className="ficha-form reservar-form" onSubmit={handleSubmit} noValidate ref={formRef}>
          <p className="reservar-summary">
            <CalendarCheck size={18} strokeWidth={1.75} aria-hidden="true" />
            <span>
              {whenText(slot, tz)} · {minutesLabel(minutes)}
            </span>
          </p>
          {placeOptions.length > 0 && (
            <div className="reservar-places" role="radiogroup" aria-labelledby="reservar-place-title">
              <span id="reservar-place-title" className="reservar-places-title">
                ¿Dónde hacemos la reunión?
              </span>
              <div className="reservar-places-list">
                {placeOptions.map((id) => (
                  <button
                    key={id}
                    type="button"
                    role="radio"
                    aria-checked={place === id}
                    className={`reservar-place${place === id ? ' active' : ''}`}
                    onClick={() => {
                      setPlace(id)
                      setError(null)
                    }}
                  >
                    <PlaceIcon place={id} />
                    {placeOf(id).label}
                  </button>
                ))}
              </div>
            </div>
          )}
          <Field label="Nombre y apellidos">
            <input type="text" value={form.name} onChange={set('name')} maxLength={FIELD_LIMITS.name} autoComplete="name" required />
          </Field>
          <Field label="Email">
            <input type="email" value={form.email} onChange={set('email')} maxLength={FIELD_LIMITS.email} autoComplete="email" placeholder="nombre@ejemplo.com" />
          </Field>
          <Field label="Teléfono">
            <input type="tel" value={form.phone} onChange={set('phone')} maxLength={FIELD_LIMITS.phone} autoComplete="tel" placeholder="+34 600 000 000" />
          </Field>
          <p className="ficha-hint">Escribe al menos el email o el teléfono para poder avisarte.</p>
          <Field label="Motivo de la reunión">
            <textarea value={form.reason} onChange={set('reason')} maxLength={FIELD_LIMITS.reason} rows={4} required />
          </Field>

          {error && (
            <div className="ficha-error" role="alert">
              {error}
            </div>
          )}

          <button type="submit" className="ficha-submit" disabled={sending}>
            {sending ? 'Enviando…' : 'Pedir la reunión'}
          </button>
        </form>
      )}
      {!slot && error && (
        <div className="ficha-error" role="alert">
          {error}
        </div>
      )}
    </Shell>
  )
}
