import { format } from 'date-fns'
import { es } from 'date-fns/locale'
import { CalendarClock, X } from 'lucide-react'
import './MeetingInvites.css'

// Aviso tras cambiar la hora de una reunión con enlaces de confirmación: hay que reenviarlos.
export default function InviteNotice({ notices, onOpen, onDismiss }) {
  if (notices.length === 0) return null
  return (
    <div className="invite-notices" role="status">
      {notices.map((notice) => (
        <div key={`${notice.eventId}|${notice.key}`} className="invite-notice">
          <CalendarClock size={18} strokeWidth={1.75} aria-hidden="true" />
          <p>
            «{notice.title}» ha cambiado de hora ({format(notice.start, "EEEE d 'de' MMMM, HH:mm", { locale: es })}). Las
            respuestas que había quedan a confirmar de nuevo: reenvía los enlaces.
          </p>
          <div className="invite-notice-actions">
            <button type="button" className="invite-notice-open" onClick={() => onOpen(notice)}>
              Reenviar enlaces
            </button>
            <button type="button" className="invite-notice-close" onClick={() => onDismiss(notice)} aria-label="Cerrar aviso">
              <X size={16} strokeWidth={1.75} />
            </button>
          </div>
        </div>
      ))}
    </div>
  )
}
