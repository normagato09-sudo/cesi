import { useState } from 'react'
import { Megaphone, RotateCcw, X } from 'lucide-react'
import ProposalShare from './ProposalShare.jsx'
import { useInvites } from '../lib/invitesContext'
import { convocationShareData } from '../lib/notAttending'
import './EventFormModal.css'
import './ProposalShare.css'
import './ContactLinkModal.css'
import './MeetingInvites.css'

// Convocatoria de una reunión que organizo sin asistir: mensaje generado con una plantilla (sin
// IA) que se puede editar antes de copiarlo o enviarlo por WhatsApp o email. Si ya existen los
// enlaces para confirmar asistencia, van en el mensaje.
export default function ConvocationModal({ occurrence, contacts, onClose }) {
  const { invites } = useInvites()
  const share = convocationShareData(occurrence, contacts, { invites })
  // null = el texto generado (se actualiza solo, p. ej. al crear los enlaces); si no, el editado.
  const [edited, setEdited] = useState(null)
  const text = edited ?? share.text

  const stop = (e) => e.stopPropagation()
  const close = (e) => {
    e.stopPropagation()
    onClose()
  }

  return (
    <div className="event-form-backdrop invites-backdrop" onClick={close}>
      <div className="event-form contact-link-modal invites-modal" onClick={stop} role="dialog" aria-labelledby="convocation-title">
        <div className="event-form-header">
          <h2 id="convocation-title">
            <Megaphone size={17} strokeWidth={1.75} />
            Mensaje de convocatoria
          </h2>
          <button type="button" className="event-form-close" onClick={close} aria-label="Cerrar">
            <X size={18} strokeWidth={1.75} />
          </button>
        </div>

        <div className="event-form-body">
          <p className="contact-link-intro">
            Revisa el texto y cámbialo si quieres antes de enviarlo.
            {!share.hasLinks && ' Si pides confirmación de asistencia, los enlaces se añaden al mensaje.'}
          </p>
          <ProposalShare
            text={text}
            subject={share.subject}
            phone={share.phone}
            email={share.email}
            copyLabel="Copiar mensaje"
            onTextChange={setEdited}
            rows={14}
          />
          {edited !== null && edited !== share.text && (
            <button type="button" className="convocation-reset" onClick={() => setEdited(null)}>
              <RotateCcw size={13} strokeWidth={1.75} />
              Volver al texto generado
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
