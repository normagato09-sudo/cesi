import { useEffect, useState } from 'react'
import { format } from 'date-fns'
import { es } from 'date-fns/locale'
import { Check, Copy, Link2, Link2Off, Mail, MessageCircle, RefreshCw, X } from 'lucide-react'
import { copyText } from '../lib/clipboard'
import { SYNC_ENABLED } from '../lib/sync/client'
import { mailtoUrl, whatsappUrl } from '../lib/proposals'
import {
  DEFAULT_LINK_DAYS,
  LINK_DAYS_OPTIONS,
  contactLinkMessage,
  contactLinkUrl,
  createLink,
  getActiveLink,
  revokeLinks,
} from '../lib/contactLinks'
import './EventFormModal.css'
import './ProposalShare.css'
import './ContactLinkModal.css'

// Enlace para que el contacto rellene y edite sus propios datos (página pública /ficha/<token>).
// Sin la sincronización activa no hay enlace posible: se explica qué falta.
export default function ContactLinkModal({ contact, syncActive, onClose }) {
  if (!syncActive) return <SyncRequired onClose={onClose} />
  return <LinkManager contact={contact} onClose={onClose} />
}

function SyncRequired({ onClose }) {
  return (
    <div className="event-form-backdrop" onClick={onClose}>
      <div className="event-form contact-link-modal" onClick={(e) => e.stopPropagation()} role="dialog" aria-labelledby="contact-link-title">
        <div className="event-form-header">
          <h2 id="contact-link-title">
            <Link2 size={17} strokeWidth={1.75} />
            Enlace para que lo rellene
          </h2>
          <button type="button" className="event-form-close" onClick={onClose} aria-label="Cerrar">
            <X size={18} strokeWidth={1.75} />
          </button>
        </div>
        <div className="event-form-body">
          {SYNC_ENABLED ? (
            <p className="contact-link-intro">
              Para crear el enlace hace falta haber iniciado sesión y que la sincronización esté en marcha. Espera a que la
              barra lateral diga «Sincronizado» e inténtalo otra vez.
            </p>
          ) : (
            <p className="contact-link-intro">
              El enlace necesita la sincronización con Supabase, y esta versión de la app no la tiene configurada. En Vercel,
              añade <code>VITE_SUPABASE_URL</code> y <code>VITE_SUPABASE_ANON_KEY</code> en Settings → Environment Variables
              y vuelve a desplegar.
            </p>
          )}
        </div>
      </div>
    </div>
  )
}

function LinkManager({ contact, onClose }) {
  const [link, setLink] = useState(null)
  const [status, setStatus] = useState('loading') // loading | ready | busy
  const [error, setError] = useState(null)
  const [days, setDays] = useState(DEFAULT_LINK_DAYS)
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    let active = true
    getActiveLink(contact.id)
      .then((found) => active && setLink(found))
      .catch((err) => active && setError(err.message))
      .finally(() => active && setStatus('ready'))
    return () => {
      active = false
    }
  }, [contact.id])

  const run = async (action) => {
    setStatus('busy')
    setError(null)
    try {
      await action()
    } catch (err) {
      setError(err.message)
    } finally {
      setStatus('ready')
    }
  }

  const handleCreate = () => run(async () => setLink(await createLink(contact.id, days)))

  const handleRegenerate = () => {
    if (!window.confirm('El enlace actual dejará de funcionar. ¿Crear uno nuevo?')) return
    run(async () => setLink(await createLink(contact.id, days)))
  }

  const handleRevoke = () => {
    if (!window.confirm('El enlace dejará de funcionar. ¿Desactivarlo?')) return
    run(async () => {
      await revokeLinks(contact.id)
      setLink(null)
    })
  }

  const url = link ? contactLinkUrl(link.token) : ''
  const message = link ? contactLinkMessage(contact, url) : ''

  const handleCopy = async () => {
    if (await copyText(url)) {
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    }
  }

  const busy = status !== 'ready'

  return (
    <div className="event-form-backdrop" onClick={onClose}>
      <div className="event-form contact-link-modal" onClick={(e) => e.stopPropagation()} role="dialog" aria-labelledby="contact-link-title">
        <div className="event-form-header">
          <h2 id="contact-link-title">
            <Link2 size={17} strokeWidth={1.75} />
            Enlace para que lo rellene
          </h2>
          <button type="button" className="event-form-close" onClick={onClose} aria-label="Cerrar">
            <X size={18} strokeWidth={1.75} />
          </button>
        </div>

        <div className="event-form-body">
          <p className="contact-link-intro">
            {contact.name || 'Este contacto'} podrá ver y cambiar su nombre, email, teléfono, organización, cargo, país y
            disponibilidad desde el enlace, sin acceso a nada más. No verá tus notas, grupos ni reuniones.
          </p>

          {status === 'loading' ? (
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
              <p className="contact-link-muted">
                Caduca el {format(new Date(link.expires_at), "d 'de' MMMM 'de' yyyy", { locale: es })}.
              </p>
              <div className="proposal-share-actions">
                <a className="proposal-share-btn" href={whatsappUrl(message, contact.phone)} target="_blank" rel="noreferrer">
                  <MessageCircle size={15} strokeWidth={1.75} />
                  Enviar por WhatsApp
                </a>
                <a className="proposal-share-btn" href={mailtoUrl(message, contact.email, 'Tus datos de contacto')}>
                  <Mail size={15} strokeWidth={1.75} />
                  Enviar por email
                </a>
              </div>
            </>
          ) : (
            !error && <p className="contact-link-muted">Todavía no hay ningún enlace activo.</p>
          )}

          {status !== 'loading' && (
            <div className="contact-link-manage">
              <label className="event-form-field contact-link-days">
                <span>Caduca en</span>
                <select value={days} onChange={(e) => setDays(Number(e.target.value))} disabled={busy}>
                  {LINK_DAYS_OPTIONS.map((d) => (
                    <option key={d} value={d}>
                      {d} días
                    </option>
                  ))}
                </select>
              </label>
              {link ? (
                <>
                  <button type="button" className="proposal-share-btn" onClick={handleRegenerate} disabled={busy}>
                    <RefreshCw size={15} strokeWidth={1.75} />
                    Regenerar link
                  </button>
                  <button type="button" className="proposal-share-btn danger" onClick={handleRevoke} disabled={busy}>
                    <Link2Off size={15} strokeWidth={1.75} />
                    Desactivar link
                  </button>
                </>
              ) : (
                <button type="button" className="proposal-share-btn primary" onClick={handleCreate} disabled={busy}>
                  <Link2 size={15} strokeWidth={1.75} />
                  {status === 'busy' ? 'Creando…' : 'Crear enlace'}
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
