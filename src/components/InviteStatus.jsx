import { CalendarCheck } from 'lucide-react'
import { STATUS_ICON, STATUS_TEXT, inviteStatus } from '../lib/meetingInvites'
import './MeetingInvites.css'

// Respuesta de un participante a la confirmación de asistencia: "✓ Va", "✗ No puede", "? Quizás",
// "A confirmar de nuevo" o "Sin responder", con su comentario. Solo elementos en línea (va dentro
// de la lista de participantes).
export function InviteBadge({ invite, showComment = true }) {
  const status = inviteStatus(invite)
  const previous = status === 'reconfirm' ? STATUS_TEXT[invite.response] : null
  return (
    <span className="invite-badge-block">
      <span className={`invite-badge ${status}`}>
        {STATUS_ICON[status] && <span aria-hidden="true">{STATUS_ICON[status]} </span>}
        {STATUS_TEXT[status]}
        {previous && <span className="invite-badge-previous"> (antes: {previous.toLowerCase()})</span>}
      </span>
      {showComment && invite?.comment && <span className="invite-comment">«{invite.comment}»</span>}
    </span>
  )
}

// "4 van · 1 no puede · 2 sin responder"
export function InviteSummary({ text, compact = false }) {
  if (!text) return null
  return (
    <span className={`invite-summary ${compact ? 'compact' : ''}`}>
      <CalendarCheck size={compact ? 12 : 14} strokeWidth={1.75} aria-hidden="true" />
      {text}
    </span>
  )
}
