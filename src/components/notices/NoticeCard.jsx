import { useState } from 'react'
import { AlertTriangle, Check, Pencil } from 'lucide-react'
import { audienceLabel, dayLabel, readSummary } from '../../lib/notices'
import './Notices.css'

function when(iso) {
  const d = new Date(iso)
  return Number.isNaN(d.getTime()) ? '' : d.toLocaleDateString('es-ES', { day: 'numeric', month: 'short', year: 'numeric' })
}

/**
 * Un aviso: título (en rojo si es importante), texto, para quién y hasta cuándo. Con onRead,
 * el botón «Leído» (o «Marcar como no leído»); con onEdit, «Editar»; showStats: quién lo ha leído.
 */
export default function NoticeCard({ notice: n, onRead = null, onEdit = null, showStats = false, compact = false }) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)
  const read = async (value) => {
    setBusy(true)
    setError(null)
    try {
      await onRead(n, value)
    } catch (err) {
      setError(err.message)
    }
    setBusy(false)
  }

  return (
    <article className={`nt-card${n.important ? ' important' : ''}${n.read_at ? ' read' : ''}${n.expired ? ' expired' : ''}${compact ? ' compact' : ''}`}>
      <header>
        <h3>
          {n.important && <AlertTriangle size={15} strokeWidth={2} aria-label="Importante" />}
          {n.title}
        </h3>
        <span className="nt-meta">
          {audienceLabel(n)} · {n.created_by_name || 'Dirección'} · {when(n.created_at)}
          {n.show_until && ` · ${n.expired ? 'Caducó el' : 'Hasta el'} ${dayLabel(n.show_until)}`}
        </span>
      </header>
      {n.body && <p className="nt-body">{n.body}</p>}
      {showStats && <p className={`nt-stats${n.read_count < n.recipients ? ' pending' : ''}`}>{readSummary(n)}</p>}
      {error && <p className="nt-error">{error}</p>}
      {(onRead || onEdit) && (
        <div className="nt-actions">
          {onEdit && (
            <button type="button" className="sc-btn" onClick={() => onEdit(n)}>
              <Pencil size={14} strokeWidth={1.75} />
              Editar
            </button>
          )}
          {onRead &&
            (n.read_at ? (
              <button type="button" className="sc-btn" disabled={busy} onClick={() => read(false)}>
                Marcar como no leído
              </button>
            ) : (
              <button type="button" className="sc-btn-primary" disabled={busy} onClick={() => read(true)}>
                <Check size={14} strokeWidth={2} />
                Leído
              </button>
            ))}
        </div>
      )}
    </article>
  )
}
