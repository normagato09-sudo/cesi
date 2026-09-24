import { useEffect, useRef, useState } from 'react'
import { Cloud, CloudAlert, CloudCheck, CloudOff, LogOut, RefreshCw } from 'lucide-react'
import { STATUS_TEXT, useSync, useSyncStatus } from '../lib/sync/syncContext'
import './SyncStatus.css'

const ICONS = {
  starting: RefreshCw,
  syncing: RefreshCw,
  synced: CloudCheck,
  offline: CloudOff,
  error: CloudAlert,
  'needs-choice': Cloud,
}

// Estado de la sincronización y "Cerrar sesión" al pie de la barra lateral. En móvil es un
// icono que abre un pequeño menú con lo mismo.
export default function SyncStatus() {
  const sync = useSync()
  const { status, pending } = useSyncStatus()
  const [open, setOpen] = useState(false)
  const rootRef = useRef(null)

  useEffect(() => {
    if (!open) return
    const close = (e) => {
      if (rootRef.current && !rootRef.current.contains(e.target)) setOpen(false)
    }
    document.addEventListener('pointerdown', close)
    return () => document.removeEventListener('pointerdown', close)
  }, [open])

  if (!sync) return null
  const Icon = ICONS[status] || Cloud
  const spinning = status === 'syncing' || status === 'starting'
  const text = STATUS_TEXT[status] || STATUS_TEXT.syncing
  const detail = pending > 0 && status !== 'synced' ? `${pending} cambio${pending === 1 ? '' : 's'} pendiente${pending === 1 ? '' : 's'}` : null

  return (
    <div className={`sync-status status-${status}`} ref={rootRef}>
      <button
        type="button"
        className="sync-status-toggle"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-label={`${text}. Cuenta y sincronización`}
        title={text}
      >
        <Icon size={16} strokeWidth={1.75} className={spinning ? 'spin' : undefined} />
      </button>

      <div className={`sync-status-panel${open ? ' open' : ''}`}>
        <p className="sync-status-line" role="status" aria-live="polite">
          <Icon size={14} strokeWidth={1.75} className={spinning ? 'spin' : undefined} />
          <span>
            {text}
            {detail && <span className="sync-status-detail">{detail}</span>}
          </span>
        </p>
        {sync.email && <p className="sync-status-email" title={sync.email}>{sync.email}</p>}
        <button type="button" className="sync-status-logout" onClick={() => sync.signOut()}>
          <LogOut size={15} strokeWidth={1.75} />
          Cerrar sesión
        </button>
      </div>
    </div>
  )
}
