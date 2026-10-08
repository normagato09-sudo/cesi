import { useState } from 'react'
import { CalendarCheck, Check, Copy, Link2, Link2Off, Mail, MessageCircle, RefreshCw, X } from 'lucide-react'
import { copyText } from '../lib/clipboard'
import { SYNC_ENABLED } from '../lib/sync/client'
import { mailtoUrl, whatsappUrl } from '../lib/proposals'
import { weekRangeLabel } from '../lib/weeklyAvailability'
import {
  DURATION_OPTIONS,
  NOTICE_OPTIONS,
  bookingAvailability,
  bookingLinkUrl,
  createBookingLink,
  linkSettings,
  revokeBookingLink,
  updateBookingSettings,
  validateSettings,
} from '../lib/bookings'
import { minutesLabel } from '../lib/bookingPage'
import './EventFormModal.css'
import './ProposalShare.css'
import './ContactLinkModal.css'
import './BookingModals.css'

const noticeLabel = (h) => (h === 0 ? 'Sin antelación mínima' : h < 24 || h % 24 ? `${h} horas` : h === 24 ? '24 horas' : `${h / 24} días`)

function Header({ onClose }) {
  return (
    <div className="event-form-header">
      <h2 id="booking-link-title">
        <CalendarCheck size={17} strokeWidth={1.75} />
        Enlace de reservas
      </h2>
      <button type="button" className="event-form-close" onClick={onClose} aria-label="Cerrar">
        <X size={18} strokeWidth={1.75} />
      </button>
    </div>
  )
}

/**
 * Enlace público /reservar/<token> para que otras personas me pidan una reunión en un hueco libre
 * (ver lib/bookings.js): copiarlo o enviarlo, regenerarlo o desactivarlo, y sus ajustes (nombre
 * que se muestra, duraciones y antelación mínima). `link`: el activo, null si no hay o undefined
 * mientras se carga.
 */
export default function BookingLinkModal({ syncActive, link, onLinkChange, rawEvents, weeklyAvailability, onClose }) {
  const [settings, setSettings] = useState(() => linkSettings(link))
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)
  const [savedNote, setSavedNote] = useState(null)
  const [copied, setCopied] = useState(false)
  const loading = link === undefined

  if (!syncActive) {
    return (
      <div className="event-form-backdrop" onClick={onClose}>
        <div className="event-form contact-link-modal" onClick={(e) => e.stopPropagation()} role="dialog" aria-labelledby="booking-link-title">
          <Header onClose={onClose} />
          <div className="event-form-body">
            <p className="contact-link-intro">
              {SYNC_ENABLED
                ? 'El enlace de reservas necesita haber iniciado sesión y que la sincronización esté en marcha. Espera a que la barra lateral diga «Sincronizado» e inténtalo otra vez.'
                : 'El enlace de reservas necesita la sincronización con Supabase, y esta versión de la app no la tiene configurada.'}
            </p>
          </div>
        </div>
      </div>
    )
  }

  const published = bookingAvailability({ rawEvents, weeklyAvailability })
  const url = link ? bookingLinkUrl(link.token) : ''
  const message = `Hola. Puedes reservar una reunión conmigo en este enlace, eligiendo el hueco que mejor te venga: ${url}`

  const run = async (action) => {
    setBusy(true)
    setError(null)
    setSavedNote(null)
    try {
      await action()
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy(false)
    }
  }

  const create = () => {
    const problem = validateSettings(settings)
    if (problem) return setError(problem)
    run(async () => onLinkChange(await createBookingLink(settings, published), published))
  }

  const handleRegenerate = () => {
    if (!window.confirm('El enlace actual dejará de funcionar (las solicitudes que ya te han enviado se conservan). ¿Crear uno nuevo?')) return
    create()
  }

  const handleRevoke = () => {
    if (!window.confirm('Nadie podrá reservar con el enlace actual. ¿Desactivarlo?')) return
    run(async () => {
      await revokeBookingLink()
      onLinkChange(null)
    })
  }

  const handleSaveSettings = () => {
    const problem = validateSettings(settings)
    if (problem) return setError(problem)
    run(async () => {
      onLinkChange(await updateBookingSettings(link.token, settings))
      setSavedNote('Ajustes guardados.')
    })
  }

  const handleCopy = async () => {
    if (await copyText(url)) {
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    }
  }

  const toggleDuration = (m) =>
    setSettings((s) => ({ ...s, durations: s.durations.includes(m) ? s.durations.filter((d) => d !== m) : [...s.durations, m].sort((a, b) => a - b) }))

  const weeksText =
    published.weeks.length === 0
      ? 'Ahora mismo no tienes ninguna semana declarada, así que el enlace no mostrará huecos. Decláralas en «Disponibilidad de la semana».'
      : `Se ofrecen huecos de ${published.weeks.length === 1 ? 'la semana' : 'las semanas'} ${published.weeks.map(weekRangeLabel).join(', ')}.`

  return (
    <div className="event-form-backdrop" onClick={onClose}>
      <div className="event-form contact-link-modal" onClick={(e) => e.stopPropagation()} role="dialog" aria-labelledby="booking-link-title">
        <Header onClose={onClose} />

        <div className="event-form-body">
          <p className="contact-link-intro">
            Quien abra el enlace verá solo tus huecos libres de las semanas en las que has declarado tu disponibilidad (nunca tus
            reuniones), elegirá uno y te dejará su nombre, su email o teléfono y el motivo. La solicitud te llega a Inicio para
            aceptarla o rechazarla.
          </p>
          <p className="contact-link-muted">{weeksText}</p>

          {loading ? (
            <p className="contact-link-muted">Buscando el enlace…</p>
          ) : link ? (
            <>
              <div className="contact-link-url">
                <input type="text" value={url} readOnly aria-label="Enlace" onFocus={(e) => e.target.select()} />
                <button type="button" className="proposal-share-btn primary" onClick={handleCopy}>
                  {copied ? <Check size={15} strokeWidth={2} /> : <Copy size={15} strokeWidth={1.75} />}
                  {copied ? 'Copiado' : 'Copiar'}
                </button>
              </div>
              <div className="proposal-share-actions">
                <a className="proposal-share-btn" href={whatsappUrl(message)} target="_blank" rel="noreferrer">
                  <MessageCircle size={15} strokeWidth={1.75} />
                  Enviar por WhatsApp
                </a>
                <a className="proposal-share-btn" href={mailtoUrl(message, '', 'Reserva una reunión')}>
                  <Mail size={15} strokeWidth={1.75} />
                  Enviar por email
                </a>
              </div>
            </>
          ) : (
            <p className="contact-link-muted">Todavía no tienes ningún enlace activo.</p>
          )}

          {!loading && (
            <fieldset className="booking-settings" disabled={busy}>
              <legend>Ajustes</legend>
              <label className="event-form-field">
                <span>Nombre que se muestra</span>
                <input
                  type="text"
                  value={settings.displayName}
                  maxLength={80}
                  onChange={(e) => setSettings((s) => ({ ...s, displayName: e.target.value }))}
                  placeholder="Tu nombre"
                />
                <em className="event-form-hint">
                  La página dirá «{settings.displayName.trim() ? `Reserva una reunión con ${settings.displayName.trim()}` : 'Reserva una reunión'}».
                </em>
              </label>
              <div className="event-form-field">
                <span id="booking-durations">Duraciones que se pueden elegir</span>
                <div className="booking-durations" role="group" aria-labelledby="booking-durations">
                  {DURATION_OPTIONS.map((m) => (
                    <label key={m} className={`booking-duration${settings.durations.includes(m) ? ' active' : ''}`}>
                      <input type="checkbox" checked={settings.durations.includes(m)} onChange={() => toggleDuration(m)} />
                      {minutesLabel(m)}
                    </label>
                  ))}
                </div>
              </div>
              <label className="event-form-field">
                <span>Antelación mínima</span>
                <select value={settings.minNoticeHours} onChange={(e) => setSettings((s) => ({ ...s, minNoticeHours: Number(e.target.value) }))}>
                  {NOTICE_OPTIONS.map((h) => (
                    <option key={h} value={h}>
                      {noticeLabel(h)}
                    </option>
                  ))}
                </select>
              </label>
              {link && (
                <button type="button" className="proposal-share-btn" onClick={handleSaveSettings}>
                  Guardar ajustes
                </button>
              )}
              {savedNote && <p className="contact-link-muted">{savedNote}</p>}
            </fieldset>
          )}

          {!loading && (
            <div className="contact-link-manage">
              {link ? (
                <>
                  <button type="button" className="proposal-share-btn" onClick={handleRegenerate} disabled={busy}>
                    <RefreshCw size={15} strokeWidth={1.75} />
                    Regenerar enlace
                  </button>
                  <button type="button" className="proposal-share-btn danger" onClick={handleRevoke} disabled={busy}>
                    <Link2Off size={15} strokeWidth={1.75} />
                    Desactivar enlace
                  </button>
                </>
              ) : (
                <button type="button" className="proposal-share-btn primary" onClick={create} disabled={busy}>
                  <Link2 size={15} strokeWidth={1.75} />
                  {busy ? 'Creando…' : 'Crear enlace'}
                </button>
              )}
            </div>
          )}

          {error && <div className="event-form-error">{error}</div>}
        </div>
      </div>
    </div>
  )
}
