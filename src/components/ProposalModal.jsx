import { format } from 'date-fns'
import { es } from 'date-fns/locale'
import { X, Send, CalendarCheck, Trash2, CalendarClock } from 'lucide-react'
import ProposalShare from './ProposalShare.jsx'
import { ParticipantList } from './Participant.jsx'
import { formatDurationLong, isExpired, optionsOf, proposalShareData } from '../lib/proposals'
import { useScheduling } from '../lib/schedulingContext'
import './EventFormModal.css'
import './ProposalModal.css'

function optionLabel(option) {
  return `${format(option.start, "EEEE d 'de' MMMM", { locale: es })} · ${format(option.start, 'HH:mm')}–${format(option.end, 'HH:mm')}`
}

// Detalle de una propuesta pendiente: confirmar una opción, cancelar o copiar el mensaje otra vez.
export default function ProposalModal({ proposal, onConfirmOption, onCancelProposal, onClose }) {
  const { rawEvents, contacts } = useScheduling()
  const options = optionsOf(proposal, rawEvents)
  const expired = isExpired(options)
  const now = new Date()

  const handleCancel = () => {
    const question = expired ? '¿Borrar esta propuesta caducada?' : '¿Cancelar la propuesta y borrar todas sus opciones provisionales?'
    if (!window.confirm(question)) return
    onCancelProposal(proposal.id)
    onClose()
  }

  return (
    <div className="event-form-backdrop" onClick={onClose}>
      <div className="event-form proposal-modal" onClick={(e) => e.stopPropagation()}>
        <div className="event-form-header">
          <h2>
            <Send size={17} strokeWidth={1.75} />
            {proposal.title}
          </h2>
          <button type="button" className="event-form-close" onClick={onClose} aria-label="Cerrar">
            <X size={18} strokeWidth={1.75} />
          </button>
        </div>

        <div className="event-form-body">
          <p className="proposal-meta">
            {formatDurationLong(proposal.durationMinutes)}
            {expired && <span className="proposal-badge expired">Caducada</span>}
          </p>

          {options.length === 0 ? (
            <p className="proposal-empty">Esta propuesta ya no tiene opciones.</p>
          ) : (
            <ul className="proposal-options">
              {options.map((option, i) => {
                const past = option.end <= now
                return (
                  <li key={option.id} className={past ? 'past' : ''}>
                    <span className="proposal-option-text">
                      <CalendarClock size={14} strokeWidth={1.75} />
                      <span>
                        <strong>Opción {i + 1}:</strong> {optionLabel(option)}
                        {past && ' (ya ha pasado)'}
                      </span>
                    </span>
                    {/* Quién puede en esta opción. */}
                    <ParticipantList item={proposal} contacts={contacts} start={option.start} end={option.end} size="compact" />
                    {!past && (
                      <button
                        type="button"
                        className="proposal-confirm-btn"
                        onClick={() => {
                          onConfirmOption(option)
                          onClose()
                        }}
                      >
                        <CalendarCheck size={14} strokeWidth={1.75} />
                        Confirmar esta opción
                      </button>
                    )}
                  </li>
                )
              })}
            </ul>
          )}

          {!expired && options.length > 0 && (
            <div className="proposal-share-block">
              <h3>Mensaje para enviar</h3>
              <ProposalShare {...proposalShareData(proposal, options, contacts)} copyLabel="Copiar el mensaje otra vez" />
            </div>
          )}
        </div>

        <div className="event-form-footer">
          <button type="button" className="proposal-cancel-btn" onClick={handleCancel}>
            <Trash2 size={14} strokeWidth={1.75} />
            {expired ? 'Borrar propuesta' : 'Cancelar propuesta'}
          </button>
        </div>
      </div>
    </div>
  )
}
