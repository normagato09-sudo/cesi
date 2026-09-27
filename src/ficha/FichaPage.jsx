import { useEffect, useState } from 'react'
import { CheckCircle2, LinkIcon, Loader2 } from 'lucide-react'
import TimeZoneSelect from '../components/TimeZoneSelect.jsx'
import WeeklyScheduleEditor from '../components/WeeklyScheduleEditor.jsx'
import { FIELD_LIMITS, contactFormPayload, loadContactForm, saveContactForm, tokenFromPath, validateContactForm } from '../lib/contactForm'
import { findZone, localTimeZone, zonePlace, zoneValue } from '../lib/timezones'
import { emptyWeek, normalizeWeek } from '../lib/weeklySchedule'
import './FichaPage.css'

const CONFIG = { url: import.meta.env.VITE_SUPABASE_URL, anonKey: import.meta.env.VITE_SUPABASE_ANON_KEY }

function defaultAvailability() {
  return emptyWeek().map((e) => (e.day >= 1 && e.day <= 5 ? { ...e, enabled: true, slots: [{ start: '09:00', end: '18:00' }] } : e))
}

// Sin país guardado se propone el del navegador de la persona.
function initialZone(data) {
  const saved = zoneValue(data.timeZone, data.country)
  if (saved) return saved
  const local = localTimeZone()
  return findZone(local) ? zoneValue(local) : null
}

function toValues(data) {
  return {
    name: data.name || '',
    email: data.email || '',
    zone: initialZone(data),
    availability: data.availability ? normalizeWeek(data.availability, defaultAvailability()) : defaultAvailability(),
  }
}

function Shell({ children }) {
  return (
    <div className="ficha">
      <main className="ficha-card">{children}</main>
      <p className="ficha-footer">CESI · Solo ves y cambias tus propios datos de contacto.</p>
    </div>
  )
}

function Message({ icon, title, text }) {
  return (
    <Shell>
      <div className="ficha-message">
        {icon}
        <h1>{title}</h1>
        {text && <p>{text}</p>}
      </div>
    </Shell>
  )
}

function TextField({ label, value, onChange, max, type = 'text', autoComplete, placeholder, required }) {
  return (
    <label className="ficha-field">
      <span>
        {label}
        {!required && <em> (opcional)</em>}
      </span>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        maxLength={max}
        autoComplete={autoComplete}
        placeholder={placeholder}
        required={required}
      />
    </label>
  )
}

export default function FichaPage() {
  const [token] = useState(() => tokenFromPath(window.location.pathname))
  const [state, setState] = useState(token ? 'loading' : 'invalid') // loading | invalid | error | ready
  const [values, setValues] = useState(null)
  const [greetingName, setGreetingName] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)
  const [savedAt, setSavedAt] = useState(null)

  useEffect(() => {
    if (!token) return
    let active = true
    loadContactForm(token, CONFIG)
      .then((data) => {
        if (!active) return
        if (!data) {
          setState('invalid')
          return
        }
        setValues(toValues(data))
        setGreetingName((data.name || '').trim())
        setState('ready')
      })
      .catch(() => active && setState('error'))
    return () => {
      active = false
    }
  }, [token])

  if (state === 'loading') {
    return <Message icon={<Loader2 className="ficha-spin" size={28} strokeWidth={1.75} />} title="Cargando tus datos…" />
  }
  if (state === 'invalid') {
    return (
      <Message
        icon={<LinkIcon size={28} strokeWidth={1.75} />}
        title="Este enlace ya no es válido"
        text="Puede que haya caducado o que lo hayan desactivado. Pide uno nuevo a quien te lo envió."
      />
    )
  }
  if (state === 'error') {
    return (
      <Message
        icon={<LinkIcon size={28} strokeWidth={1.75} />}
        title="No se han podido cargar tus datos"
        text="Comprueba la conexión y vuelve a abrir el enlace."
      />
    )
  }

  const set = (field) => (value) => {
    setValues((v) => ({ ...v, [field]: value }))
    setSavedAt(null)
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError(null)
    setSavedAt(null)
    const problem = validateContactForm(values)
    if (problem) {
      setError(problem)
      return
    }
    setSaving(true)
    try {
      const result = await saveContactForm(token, contactFormPayload(values), CONFIG)
      setSavedAt(result?.savedAt || new Date().toISOString())
    } catch (err) {
      if (err.code === 'invalid_link') setState('invalid')
      else setError(err.code === 'network' ? 'Sin conexión. Inténtalo de nuevo en un momento.' : err.message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <Shell>
      <header className="ficha-header">
        <h1>Tus datos de contacto</h1>
        <p>
          Hola{greetingName ? `, ${greetingName}` : ''}. Rellena tus datos y tu disponibilidad para que podamos organizar las
          reuniones de CESI.
        </p>
      </header>

      <form className="ficha-form" onSubmit={handleSubmit} noValidate>
        <TextField label="Nombre y apellidos" value={values.name} onChange={set('name')} max={FIELD_LIMITS.name} autoComplete="name" required />
        <TextField label="Email" type="email" value={values.email} onChange={set('email')} max={FIELD_LIMITS.email} autoComplete="email" placeholder="nombre@ejemplo.com" />

        <div className="ficha-field">
          <TimeZoneSelect label="País y zona horaria" value={values.zone} onChange={set('zone')} requireZoneChoice />
        </div>

        <div className="ficha-availability">
          <span className="ficha-availability-title">Disponibilidad semanal</span>
          <p className="ficha-hint">
            Cuándo sueles poder reunirte, en {values.zone?.timeZone ? `hora de ${zonePlace(values.zone.timeZone)}` : 'tu hora local'}.
          </p>
          <WeeklyScheduleEditor value={values.availability} onChange={set('availability')} />
        </div>

        {error && (
          <div className="ficha-error" role="alert">
            {error}
          </div>
        )}
        {savedAt && (
          <div className="ficha-saved" role="status">
            <CheckCircle2 size={18} strokeWidth={2} />
            ¡Gracias! Tus datos se han guardado.
          </div>
        )}

        <button type="submit" className="ficha-submit" disabled={saving}>
          {saving ? 'Guardando…' : 'Guardar'}
        </button>
      </form>
    </Shell>
  )
}
