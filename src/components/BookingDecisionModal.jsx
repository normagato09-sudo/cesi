import { useState } from 'react'
import { CalendarCheck, CalendarX, UserCheck, X } from 'lucide-react'
import ProposalShare from './ProposalShare.jsx'
import { decisionMessage, matchContact, requestMinutes, requestWhenText } from '../lib/bookings'
import { formatDurationLong } from '../lib/proposals'
import './EventFormModal.css'
import './ProposalShare.css'
import './ContactLinkModal.css'
import './BookingModals.css'

/**
 * Aceptar o rechazar una solicitud del enlace de reservas (`decision`: 'accepted' | 'rejected').
 * Primero se confirma (al aceptar: con qué contacto se vincula o si se guarda como contacto nuevo);
 * después, el mensaje de plantilla para avisar a la persona por WhatsApp o email.
 * onDecide({ saveContact }) hace el cambio y devuelve un aviso opcional (p. ej. si se solapa).
 */
export default function BookingDecisionModal({ request, decision, contacts, linkUrl, onDecide, onClose }) {
  const accepting = decision === 'accepted'
  const contact = matchContact(request, contacts)
  const [saveContact, setSaveContact] = useState(true)
  const [step, setStep] = useState('confirm') // confirm | message
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)
  const [notice, setNotice] = useState(null)
  const share = decisionMessage(request, decision, { url: accepting ? '' : linkUrl })
  const [text, setText] = useState(null)

  const handleConfirm = async () => {
    setBusy(true)
    setError(null)
    try {
      setNotice((await onDecide({ saveContact: !contact && saveContact })) || null)
      setStep('message')
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy(false)
    }
  }

  const Icon = accepting ? CalendarCheck : CalendarX

  return (
    <div className="event-form-backdrop" onClick={onClose}>
      <div className="event-form contact-link-modal" onClick={(e) => e.stopPropagation()} role="dialog" aria-labelledby="booking-decision-title">
        <div className="event-form-header">
          <h2 id="booking-decision-title">
            <Icon size={17} strokeWidth={1.75} />
            {step === 'message' ? 'Avisar a ' + (request.name || 'la persona') : accepting ? 'Aceptar la solicitud' : 'Rechazar la solicitud'}
          </h2>
          <button type="button" className="event-form-close" onClick={onClose} aria-label="Cerrar">
            <X size={18} strokeWidth={1.75} />
          </button>
        </div>

        <div className="event-form-body">
          {step === 'confirm' ? (
            <>
              <dl className="booking-request-details">
                <dt>Quién</dt>
                <dd>{request.name}</dd>
                <dt>Cuándo</dt>
                <dd>
                  {requestWhenText(request)} · {formatDurationLong(requestMinutes(request))}
                </dd>
                {request.email && (
                  <>
                    <dt>Email</dt>
                    <dd>{request.email}</dd>
                  </>
                )}
                {request.phone && (
                  <>
                    <dt>Teléfono</dt>
                    <dd>{request.phone}</dd>
                  </>
                )}
                <dt>Motivo</dt>
                <dd className="booking-request-reason">{request.reason}</dd>
              </dl>

              {accepting &&
                (contact ? (
                  <p className="booking-contact-match">
                    <UserCheck size={15} strokeWidth={1.75} />
                    Se vinculará a tu contacto «{contact.name}».
                  </p>
                ) : (
                  <label className="event-form-checkbox">
                    <input type="checkbox" checked={saveContact} onChange={(e) => setSaveContact(e.target.checked)} />
                    <span>Guardar a {request.name} como contacto nuevo</span>
                  </label>
                ))}

              <p className="contact-link-muted">
                {accepting
                  ? `Se creará la reunión «Reunión con ${request.name}» con el motivo en la descripción.`
                  : 'El hueco vuelve a quedar libre en tu enlace.'}
              </p>

              {error && <div className="event-form-error">{error}</div>}

              <div className="contact-link-manage">
                <button type="button" className="proposal-share-btn" onClick={onClose} disabled={busy}>
                  Cancelar
                </button>
                <button type="button" className={`proposal-share-btn ${accepting ? 'primary' : 'danger'}`} onClick={handleConfirm} disabled={busy}>
                  {busy ? 'Guardando…' : accepting ? 'Aceptar y crear la reunión' : 'Rechazar'}
                </button>
              </div>
            </>
          ) : (
            <>
              {notice && <p className="booking-notice">{notice}</p>}
              <p className="contact-link-intro">
                {accepting ? 'Reunión creada.' : 'Solicitud rechazada.'} Revisa el mensaje y envíaselo
                {request.phone && request.email ? ' por WhatsApp o email' : request.phone ? ' por WhatsApp' : ' por email'}.
              </p>
              <ProposalShare
                text={text ?? share.text}
                subject={share.subject}
                phone={share.phone}
                email={share.email}
                onTextChange={setText}
                rows={7}
              />
            </>
          )}
        </div>
      </div>
    </div>
  )
}
