import { useEffect, useState } from 'react'
import { CalendarDays, CheckCircle2, Clock, Globe, LinkIcon, Loader2 } from 'lucide-react'
import { COMMENT_MAX, loadInvite, sendResponse, tokenFromPath, validateResponse } from '../lib/meetingResponse'
import { durationText, meetingWhen } from '../lib/meetingWhen'
import '../ficha/FichaPage.css'
import './ConfirmPage.css'

const CONFIG = { url: import.meta.env.VITE_SUPABASE_URL, anonKey: import.meta.env.VITE_SUPABASE_ANON_KEY }

const OPTIONS = [
  { value: 'yes', label: 'Voy', icon: '✓' },
  { value: 'no', label: 'No puedo', icon: '✗' },
  { value: 'maybe', label: 'Quizás', icon: '?' },
]
const ANSWER_TEXT = { yes: 'vas', no: 'no puedes', maybe: 'quizás vas' }

function Shell({ children }) {
  return (
    <div className="ficha">
      <main className="ficha-card">{children}</main>
      <p className="ficha-footer">CESI · Solo ves esta reunión y tu propia respuesta.</p>
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

// Día, hora, duración y zona, en la zona de su ficha o, si no tiene, la del navegador.
function MeetingInfo({ invite }) {
  const start = meetingWhen(invite.startsAt, invite.timeZone)
  const end = meetingWhen(invite.endsAt, start.timeZone)
  return (
    <section className="confirm-meeting">
      <h2>{invite.title}</h2>
      <p>
        <CalendarDays size={16} strokeWidth={1.75} aria-hidden="true" />
        <span className="confirm-day">{start.day}</span>
      </p>
      {invite.allDay ? (
        <p>
          <Clock size={16} strokeWidth={1.75} aria-hidden="true" />
          Todo el día
        </p>
      ) : (
        <>
          <p>
            <Clock size={16} strokeWidth={1.75} aria-hidden="true" />
            {start.time} – {end.time}
            {end.day !== start.day && ` (${end.day})`} · {durationText(invite.startsAt, invite.endsAt)}
          </p>
          <p className="confirm-zone">
            <Globe size={16} strokeWidth={1.75} aria-hidden="true" />
            Hora de {start.place} ({start.timeZone})
          </p>
        </>
      )}
    </section>
  )
}

export default function ConfirmPage() {
  const [token] = useState(() => tokenFromPath(window.location.pathname))
  const [state, setState] = useState(token ? 'loading' : 'invalid') // loading | invalid | error | ready
  const [invite, setInvite] = useState(null)
  const [choice, setChoice] = useState(null)
  const [comment, setComment] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)
  const [saved, setSaved] = useState(false)

  useEffect(() => {
    if (!token) return
    let active = true
    loadInvite(token, CONFIG)
      .then((data) => {
        if (!active) return
        if (!data) {
          setState('invalid')
          return
        }
        setInvite(data)
        setChoice(data.needsReconfirm ? null : data.response)
        setComment(data.comment || '')
        setState('ready')
      })
      .catch(() => active && setState('error'))
    return () => {
      active = false
    }
  }, [token])

  if (state === 'loading') {
    return <Message icon={<Loader2 className="ficha-spin" size={28} strokeWidth={1.75} />} title="Cargando la reunión…" />
  }
  if (state === 'invalid') {
    return (
      <Message
        icon={<LinkIcon size={28} strokeWidth={1.75} />}
        title="Este enlace ya no es válido"
        text="Puede que la reunión ya haya terminado o que haya cambiado. Si lo necesitas, pide un enlace nuevo a quien te lo envió."
      />
    )
  }
  if (state === 'error') {
    return (
      <Message
        icon={<LinkIcon size={28} strokeWidth={1.75} />}
        title="No se ha podido cargar la reunión"
        text="Comprueba la conexión y vuelve a abrir el enlace."
      />
    )
  }

  const firstName = (invite.name || '').trim().split(/\s+/)[0]
  const current = invite.needsReconfirm ? null : invite.response

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError(null)
    setSaved(false)
    const problem = validateResponse(choice, comment)
    if (problem) {
      setError(problem)
      return
    }
    setSaving(true)
    try {
      const result = await sendResponse(token, choice, comment, CONFIG)
      setInvite((v) => ({ ...v, response: result?.response || choice, comment: result?.comment ?? comment.trim(), needsReconfirm: false }))
      setComment(result?.comment ?? comment.trim())
      setSaved(true)
    } catch (err) {
      if (err.code === 'invalid_link') setState('invalid')
      else if (err.code === 'meeting_started') setInvite((v) => ({ ...v, canRespond: false }))
      else setError(err.code === 'network' ? 'Sin conexión. Inténtalo de nuevo en un momento.' : err.message)
    } finally {
      setSaving(false)
    }
  }

  // Ya ha empezado: solo se ve la respuesta que dio.
  if (!invite.canRespond) {
    return (
      <Shell>
        <header className="ficha-header">
          <h1>Hola{firstName ? `, ${firstName}` : ''}</h1>
        </header>
        <MeetingInfo invite={invite} />
        <p className="confirm-closed">
          La reunión ya ha empezado, así que ya no se puede cambiar la respuesta.
          {current && ` Respondiste que ${ANSWER_TEXT[current]}.`}
        </p>
      </Shell>
    )
  }

  return (
    <Shell>
      <header className="ficha-header">
        <h1>Hola{firstName ? `, ${firstName}` : ''}</h1>
        <p>¿Puedes confirmar si vienes a esta reunión?</p>
      </header>

      <MeetingInfo invite={invite} />

      {invite.needsReconfirm && (
        <p className="confirm-reconfirm" role="status">
          La reunión ha cambiado de día u hora. {invite.response && `Habías respondido que ${ANSWER_TEXT[invite.response]}: `}
          confirma de nuevo, por favor.
        </p>
      )}

      <form className="ficha-form confirm-form" onSubmit={handleSubmit} noValidate>
        <div className="confirm-options" role="radiogroup" aria-label="Tu respuesta">
          {OPTIONS.map((o) => (
            <button
              key={o.value}
              type="button"
              role="radio"
              aria-checked={choice === o.value}
              className={`confirm-option ${o.value} ${choice === o.value ? 'selected' : ''}`}
              onClick={() => {
                setChoice(o.value)
                setSaved(false)
              }}
            >
              <span className="confirm-option-icon" aria-hidden="true">
                {o.icon}
              </span>
              {o.label}
            </button>
          ))}
        </div>

        <label className="ficha-field">
          <span>
            Comentario<em> (opcional)</em>
          </span>
          <textarea
            className="confirm-comment"
            value={comment}
            onChange={(e) => {
              setComment(e.target.value)
              setSaved(false)
            }}
            maxLength={COMMENT_MAX}
            rows={3}
            placeholder="Por ejemplo: llegaré 10 minutos tarde"
          />
          <em className="confirm-count">
            {comment.length}/{COMMENT_MAX}
          </em>
        </label>

        {error && (
          <div className="ficha-error" role="alert">
            {error}
          </div>
        )}
        {saved && (
          <div className="ficha-saved" role="status">
            <CheckCircle2 size={18} strokeWidth={2} />
            ¡Gracias! Hemos recibido tu respuesta. Puedes cambiarla hasta que empiece la reunión.
          </div>
        )}

        <button type="submit" className="ficha-submit" disabled={saving || !choice}>
          {saving ? 'Enviando…' : current ? 'Cambiar respuesta' : 'Enviar respuesta'}
        </button>
      </form>
    </Shell>
  )
}
