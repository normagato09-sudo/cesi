import { Archive } from 'lucide-react'
import './ArchivedNotice.css'

// Aviso de que quien reserva coincide con un contacto archivado, con la opción de desarchivarlo
// (en Solicitudes pendientes y al aceptar o rechazar la solicitud).
export default function ArchivedNotice({ contact, onUnarchive, compact = false }) {
  return (
    <span className={`archived-notice${compact ? ' compact' : ''}`} role="status">
      <Archive size={14} strokeWidth={1.75} aria-hidden="true" />
      <span>{compact ? 'Esta persona está archivada' : `Esta persona está archivada (contacto «${contact.name}»).`}</span>
      {onUnarchive && (
        <button type="button" onClick={() => onUnarchive(contact.id)}>
          Desarchivar
        </button>
      )}
    </span>
  )
}
