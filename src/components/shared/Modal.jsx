import { useEffect } from 'react'
import { createPortal } from 'react-dom'
import { X } from 'lucide-react'
import './SharedCalendar.css'

// Ventana sencilla del calendario compartido (se cierra con Escape o pulsando fuera).
export default function Modal({ title, wide = false, onClose, children }) {
  useEffect(() => {
    const onKey = (e) => e.key === 'Escape' && onClose()
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose])

  return createPortal(
    <div className="sc-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className={`sc-modal${wide ? ' wide' : ''}`} role="dialog" aria-modal="true" aria-label={title}>
        <div className="sc-modal-head">
          <h2>{title}</h2>
          <button type="button" className="sc-close" onClick={onClose} aria-label="Cerrar">
            <X size={18} strokeWidth={1.75} />
          </button>
        </div>
        {children}
      </div>
    </div>,
    document.body,
  )
}
