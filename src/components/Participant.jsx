import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { CalendarClock, Check, TriangleAlert, X } from 'lucide-react'
import {
  STATUS,
  availabilityStatus,
  localTimeInfo,
  participantEntries,
  statusCountsText,
  unreasonableTimeWarning,
} from '../lib/participants'
import './Participant.css'

const LONG_PRESS_MS = 450
const TIP_VISIBLE_MS = 3000

function StatusGlyph({ status }) {
  if (status === STATUS.CAN) return <Check size={11} strokeWidth={3} />
  if (status === STATUS.CANNOT) return <X size={11} strokeWidth={3} />
  if (status === STATUS.ANY) return <CalendarClock size={11} strokeWidth={2.5} />
  return <span className="participant-status-q">?</span>
}

// Indicador de disponibilidad con su explicación al pasar el ratón o al mantenerlo pulsado.
function StatusIndicator({ status, message }) {
  const ref = useRef(null)
  const pressTimer = useRef(null)
  const hideTimer = useRef(null)
  const longPressed = useRef(false)
  const [tip, setTip] = useState(null) // { left, top, below }

  useEffect(
    () => () => {
      clearTimeout(pressTimer.current)
      clearTimeout(hideTimer.current)
    },
    [],
  )

  const show = () => {
    const rect = ref.current?.getBoundingClientRect()
    if (!rect) return
    const below = rect.top < 70
    setTip({ center: rect.left + rect.width / 2, width: Math.min(260, window.innerWidth - 16), top: below ? rect.bottom + 6 : rect.top - 6, below })
  }
  const hide = () => setTip(null)

  // Centrado sobre el indicador sin salirse de la pantalla (se mide al pintarlo).
  const placeTip = (el) => {
    if (!el || !tip) return
    const w = el.offsetWidth
    el.style.left = `${Math.max(8, Math.min(tip.center - w / 2, window.innerWidth - w - 8))}px`
  }

  return (
    <span
      ref={ref}
      className={`participant-status ${status}`}
      role="img"
      aria-label={message}
      onPointerEnter={(e) => e.pointerType === 'mouse' && show()}
      onPointerLeave={(e) => e.pointerType === 'mouse' && hide()}
      onPointerDown={(e) => {
        if (e.pointerType === 'mouse') return
        longPressed.current = false
        clearTimeout(pressTimer.current)
        pressTimer.current = setTimeout(() => {
          longPressed.current = true
          show()
          clearTimeout(hideTimer.current)
          hideTimer.current = setTimeout(hide, TIP_VISIBLE_MS)
        }, LONG_PRESS_MS)
      }}
      onPointerUp={() => clearTimeout(pressTimer.current)}
      onPointerCancel={() => clearTimeout(pressTimer.current)}
      onContextMenu={(e) => e.preventDefault()}
      onClick={(e) => {
        // Tras mantenerlo pulsado no se abre lo que haya debajo (p. ej. la reunión).
        if (longPressed.current) {
          e.preventDefault()
          e.stopPropagation()
          longPressed.current = false
        }
      }}
    >
      <StatusGlyph status={status} />
      {tip &&
        createPortal(
          <span
            ref={placeTip}
            className={`participant-tip${tip.below ? ' below' : ''}`}
            role="tooltip"
            style={{ left: 8, top: tip.top, maxWidth: tip.width }}
          >
            {message}
          </span>,
          document.body,
        )}
    </span>
  )
}

/**
 * Un participante de una reunión: contacto (`contact`) o invitado suelto (`guest`, texto).
 * - size="full": indicador de disponibilidad, nombre, bandera, país y hora local de la reunión
 *   (y el aviso de hora poco razonable). Si no cabe, país y hora bajan debajo del nombre.
 * - size="compact": indicador y nombre.
 * Sin `start`/`end` (aún no hay hora) el indicador dice si tiene disponibilidad apuntada.
 * `onOpenContact`: el nombre abre la ficha. `onRemove`: botón para quitarlo (chips del formulario).
 * `children`: datos extra debajo (email, "Guardar como contacto"…).
 */
export default function Participant({ contact = null, guest = null, start = null, end = null, size = 'full', onOpenContact, onRemove, children }) {
  const name = contact ? contact.name : guest
  const { status, message } = availabilityStatus(contact, start, end)

  const nameEl =
    contact && onOpenContact ? (
      <button type="button" className="participant-name link" onClick={() => onOpenContact(contact.id)} title="Ver ficha del contacto">
        {name}
      </button>
    ) : (
      <span className="participant-name">{name}</span>
    )

  if (size === 'compact') {
    return (
      <span className={`participant compact ${status}`}>
        <StatusIndicator status={status} message={`${name}: ${message}`} />
        {nameEl}
      </span>
    )
  }

  const place = contact ? localTimeInfo(contact, start) : null
  const warning = unreasonableTimeWarning(contact, start, end)
  return (
    <span className={`participant full ${status}`}>
      <StatusIndicator status={status} message={message} />
      <span className="participant-body">
        <span className="participant-line">
          {nameEl}
          {place && <span className="participant-place">{place.text}</span>}
          {!contact && <span className="participant-place muted">Invitado sin ficha</span>}
        </span>
        {warning && (
          <span className="participant-warning">
            <TriangleAlert size={12} strokeWidth={2} />
            {warning}
          </span>
        )}
        {children}
      </span>
      {onRemove && (
        <button
          type="button"
          className="participant-remove"
          onClick={(e) => {
            e.stopPropagation()
            onRemove()
          }}
          aria-label={`Quitar a ${name}`}
        >
          <X size={12} strokeWidth={2} />
        </button>
      )}
    </span>
  )
}

/**
 * Lista de participantes de una reunión, propuesta u opción (`item`, con participantIds/guests),
 * con el recuento encima si hay más de uno ("8 pueden · 1 no puede · 2 sin disponibilidad").
 * `extra(entry)`: contenido extra de cada participante en tamaño completo.
 */
export function ParticipantList({ item, contacts, start = null, end = null, size = 'full', onOpenContact, extra, className = '' }) {
  const entries = participantEntries(item, contacts, start, end)
  if (entries.length === 0) return null
  // Solo elementos en línea, para que la lista pueda ir dentro de una fila que es un botón.
  return (
    <span className={`participant-list-block ${size} ${className}`}>
      {entries.length > 1 && <span className="participant-counts">{statusCountsText(entries)}</span>}
      <span className={`participant-list ${size}`} role="list">
        {entries.map((entry) => (
          <span key={entry.key} role="listitem" className="participant-list-item">
            <Participant contact={entry.contact} guest={entry.guest} start={start} end={end} size={size} onOpenContact={onOpenContact}>
              {size === 'full' && extra ? extra(entry) : null}
            </Participant>
          </span>
        ))}
      </span>
    </span>
  )
}
