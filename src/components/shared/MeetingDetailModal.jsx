import { useState } from 'react'
import Modal from './Modal.jsx'
import { STATUS_LABELS, cancelMeeting, errorText, respondMeeting, whenLabel } from '../../lib/sharedCalendar'

function safeLink(link) {
  return /^https?:\/\//i.test(link || '') ? link : null
}

// Ficha de una reunión compartida: cuándo (en mi zona), enlace, descripción y quién ha aceptado.
// Invitado: Aceptar / Rechazar. Organizador: Editar / Cancelar. readOnly («Ver como»): sin botones.
export default function MeetingDetailModal({ client, meeting, meId, zone, readOnly = false, onClose, onChanged, onEdit }) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)
  const isOrganizer = meeting.organizer_id === meId
  const start = new Date(meeting.starts_at)
  const end = new Date(meeting.ends_at)
  const ended = end <= new Date()
  const link = safeLink(meeting.link)

  const run = async (action) => {
    setBusy(true)
    setError(null)
    try {
      await action()
      onChanged()
    } catch (err) {
      setError(errorText(err))
      setBusy(false)
    }
  }

  return (
    <Modal title={meeting.title} onClose={onClose}>
      <div className="sc-meta">
        <span>
          <strong>{whenLabel(start, end, zone)}</strong>
        </span>
        <span>Organiza: {isOrganizer ? 'tú' : meeting.organizer_name}</span>
        <span>
          {meeting.cancelled ? (
            <span className="sc-badge cancelled">Cancelada</span>
          ) : isOrganizer ? (
            <span className="sc-badge accepted">Organizas tú</span>
          ) : (
            <span className={`sc-badge ${meeting.my_status}`}>{STATUS_LABELS[meeting.my_status]}</span>
          )}
        </span>
      </div>

      {link && (
        <a className="sc-link" href={link} target="_blank" rel="noreferrer">
          {link}
        </a>
      )}
      {meeting.link && !link && <p className="sc-desc">{meeting.link}</p>}
      {meeting.description && <p className="sc-desc">{meeting.description}</p>}

      <h3 className="sc-section-title">Participantes</h3>
      <ul className="sc-people">
        {meeting.participants.map((p) => (
          <li key={p.id}>
            <span>
              {p.name}
              {p.id === meeting.organizer_id ? ' (organiza)' : ''}
              {p.id === meId && p.id !== meeting.organizer_id ? ' (tú)' : ''}
            </span>
            <span className={`sc-badge ${p.status}`}>{STATUS_LABELS[p.status]}</span>
          </li>
        ))}
      </ul>

      {error && <p className="sc-message error">{error}</p>}

      {!readOnly && !meeting.cancelled && !ended && (
        <div className="sc-actions">
          {isOrganizer ? (
            <>
              <button
                type="button"
                className="sc-btn-danger"
                disabled={busy}
                onClick={() => window.confirm('¿Cancelar la reunión? Los invitados la verán como cancelada.') && run(() => cancelMeeting(client, meeting.id))}
              >
                Cancelar reunión
              </button>
              <button type="button" className="sc-btn-primary" disabled={busy} onClick={() => onEdit(meeting)}>
                Editar
              </button>
            </>
          ) : (
            <>
              {meeting.my_status !== 'declined' && (
                <button type="button" className="sc-btn-danger" disabled={busy} onClick={() => run(() => respondMeeting(client, meeting.id, 'declined'))}>
                  Rechazar
                </button>
              )}
              {meeting.my_status !== 'accepted' && (
                <button type="button" className="sc-btn-primary" disabled={busy} onClick={() => run(() => respondMeeting(client, meeting.id, 'accepted'))}>
                  Aceptar
                </button>
              )}
            </>
          )}
        </div>
      )}
    </Modal>
  )
}
