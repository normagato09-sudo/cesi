import { useEffect, useMemo, useState } from 'react'
import { Check, Copy, Mail, MessageCircle, Send, X } from 'lucide-react'
import { copyText } from '../lib/clipboard'
import { SYNC_ENABLED } from '../lib/sync/client'
import { mailtoUrl, whatsappUrl } from '../lib/proposals'
import { participantEntries } from '../lib/participants'
import { useInvites } from '../lib/invitesContext'
import {
  canAskConfirmation,
  inviteMessage,
  invitesOf,
  meetingInviteUrl,
  occurrenceSummary,
  participantKeyOf,
  participantZone,
} from '../lib/meetingInvites'
import { meetingWhen } from '../lib/meetingWhen'
import { InviteBadge, InviteSummary } from './InviteStatus.jsx'
import './EventFormModal.css'
import './ProposalShare.css'
import './ContactLinkModal.css'
import './MeetingInvites.css'

// "Pedir confirmación": un enlace por participante (/confirmar/<token>) para que diga si va, con
// su mensaje listo para copiar o enviar por WhatsApp o email. Las respuestas llegan solas.
export default function MeetingInvitesModal({ occurrence, contacts, now = new Date(), onClose }) {
  const { enabled, invites, ensureInvites } = useInvites()
  const [status, setStatus] = useState('loading') // loading | ready
  const [error, setError] = useState(null)
  const [copied, setCopied] = useState(null)

  const entries = useMemo(() => participantEntries(occurrence, contacts), [occurrence, contacts])
  const participantsKey = entries.map(participantKeyOf).join('|')
  const open = canAskConfirmation(occurrence, now)

  useEffect(() => {
    if (!enabled) return
    let active = true
    // Si ya ha empezado no se crean enlaces nuevos: solo se ven las respuestas.
    const run = open ? ensureInvites(occurrence, entries) : Promise.resolve()
    run
      .catch((err) => active && setError(err.message))
      .finally(() => active && setStatus('ready'))
    return () => {
      active = false
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- se piden al abrir y si cambian los participantes
  }, [enabled, occurrence.id, participantsKey, open])

  const byKey = invitesOf(invites, occurrence)
  const summary = occurrenceSummary(invites, occurrence, contacts)

  const handleCopy = async (key, text) => {
    if (await copyText(text)) {
      setCopied(key)
      setTimeout(() => setCopied((k) => (k === key ? null : k)), 2000)
    }
  }

  const stop = (e) => e.stopPropagation()
  const close = (e) => {
    e.stopPropagation()
    onClose()
  }

  return (
    <div className="event-form-backdrop invites-backdrop" onClick={close}>
      <div className="event-form contact-link-modal invites-modal" onClick={stop} role="dialog" aria-labelledby="invites-title">
        <div className="event-form-header">
          <h2 id="invites-title">
            <Send size={17} strokeWidth={1.75} />
            Pedir confirmación
          </h2>
          <button type="button" className="event-form-close" onClick={close} aria-label="Cerrar">
            <X size={18} strokeWidth={1.75} />
          </button>
        </div>

        <div className="event-form-body">
          {!enabled ? (
            <p className="contact-link-intro">
              {SYNC_ENABLED
                ? 'Para pedir confirmación hace falta haber iniciado sesión y que la sincronización esté en marcha.'
                : 'Los enlaces de confirmación necesitan la sincronización con Supabase, y esta versión de la app no la tiene configurada.'}
            </p>
          ) : entries.length === 0 ? (
            <p className="contact-link-intro">Esta reunión no tiene participantes.</p>
          ) : (
            <>
              <p className="contact-link-intro">
                Cada participante recibe su propio enlace para decir si va a «{occurrence.title}»
                {occurrence.recurrence ? ' este día' : ''}. Solo verá el título, el día y la hora (en su zona horaria), y
                podrá cambiar su respuesta hasta que empiece la reunión.
              </p>
              {!open && <p className="invites-closed">La reunión ya ha empezado: ya no se pueden pedir ni cambiar respuestas.</p>}
              <InviteSummary text={summary} />

              {status === 'loading' ? (
                <p className="contact-link-muted">Preparando los enlaces…</p>
              ) : (
                <ul className="invites-list">
                  {entries.map((entry) => {
                    const key = participantKeyOf(entry)
                    const invite = byKey.get(key)
                    const url = invite ? meetingInviteUrl(invite.token) : ''
                    const timeZone = participantZone(entry)
                    const when = meetingWhen(occurrence.start, timeZone)
                    const message = invite
                      ? inviteMessage({ name: entry.name, title: occurrence.title, start: occurrence.start, allDay: occurrence.allDay, timeZone }, url)
                      : ''
                    return (
                      <li key={key} className="invites-item">
                        <div className="invites-item-head">
                          <span className="invites-name">
                            {entry.name}
                            {entry.guest && <span className="invites-guest"> · invitado</span>}
                          </span>
                          {invite && <InviteBadge invite={invite} />}
                        </div>
                        {!occurrence.allDay && (
                          <span className="invites-when">
                            Su hora: {when.day}, {when.time} ({when.place})
                          </span>
                        )}
                        {invite && open && (
                          <>
                            <input
                              className="invites-url"
                              type="text"
                              value={url}
                              readOnly
                              aria-label={`Enlace de ${entry.name}`}
                              onFocus={(e) => e.target.select()}
                            />
                            <div className="proposal-share-actions">
                              <button type="button" className="proposal-share-btn" onClick={() => handleCopy(key, message)} title="Copia el mensaje con el enlace">
                                {copied === key ? <Check size={15} strokeWidth={2} /> : <Copy size={15} strokeWidth={1.75} />}
                                {copied === key ? 'Copiado' : 'Copiar'}
                              </button>
                              <a className="proposal-share-btn" href={whatsappUrl(message, entry.contact?.phone)} target="_blank" rel="noreferrer">
                                <MessageCircle size={15} strokeWidth={1.75} />
                                WhatsApp
                              </a>
                              <a className="proposal-share-btn" href={mailtoUrl(message, entry.contact?.email, `Confirma tu asistencia: ${occurrence.title}`)}>
                                <Mail size={15} strokeWidth={1.75} />
                                Email
                              </a>
                            </div>
                          </>
                        )}
                      </li>
                    )
                  })}
                </ul>
              )}
            </>
          )}
          {error && <div className="event-form-error">{error}</div>}
        </div>
      </div>
    </div>
  )
}
