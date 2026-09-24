import { useState } from 'react'
import { CloudUpload, Cloud, Download, Merge, Smartphone } from 'lucide-react'
import { downloadBackup } from '../lib/backup'
import { useSync, useSyncStatus } from '../lib/sync/syncContext'
import './InitialSyncDialog.css'

const CHOICES = [
  {
    strategy: 'merge',
    Icon: Merge,
    title: 'Fusionarlos',
    text: 'Junta los dos. Si una misma reunión o contacto está en los dos sitios, se queda la versión más reciente.',
  },
  {
    strategy: 'cloud',
    Icon: Cloud,
    title: 'Conservar los de la nube',
    text: 'Los datos de este dispositivo se sustituyen por los de tu cuenta.',
  },
  {
    strategy: 'device',
    Icon: Smartphone,
    title: 'Conservar los de este dispositivo',
    text: 'Los datos de tu cuenta se sustituyen por los de este dispositivo.',
  },
]

// Primer inicio de sesión en un dispositivo que ya tenía datos.
export default function InitialSyncDialog() {
  const sync = useSync()
  const { status, choice } = useSyncStatus()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)

  if (status !== 'needs-choice' && !busy) return null

  const run = async (strategy) => {
    if (strategy === 'cloud' && !window.confirm('Se borrarán los datos de este dispositivo y se usarán los de la nube. ¿Seguir?')) return
    if (strategy === 'device' && !window.confirm('Se sustituirán los datos de tu cuenta por los de este dispositivo. ¿Seguir?')) return
    setBusy(true)
    setError(null)
    try {
      await sync.engine.resolveInitial(strategy)
    } catch {
      setError('No se pudo conectar con el servidor. Comprueba la conexión e inténtalo de nuevo.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="event-form-backdrop">
      <div className="event-form initial-sync" role="dialog" aria-modal="true" aria-labelledby="initial-sync-title">
        <div className="event-form-header">
          <h2 id="initial-sync-title">
            <CloudUpload size={17} strokeWidth={1.75} />
            {choice === 'upload' ? 'Subir tus datos a la nube' : 'Tienes datos en los dos sitios'}
          </h2>
        </div>

        <div className="event-form-body">
          {choice === 'upload' ? (
            <>
              <p className="initial-sync-text">
                Tu cuenta está vacía y este dispositivo tiene reuniones, contactos o ajustes guardados. Súbelos para tenerlos
                también en tus otros dispositivos.
              </p>
              <button type="button" className="event-form-submit initial-sync-main" onClick={() => run('device')} disabled={busy}>
                <CloudUpload size={16} strokeWidth={1.75} />
                {busy ? 'Subiendo…' : 'Subir los datos de este dispositivo'}
              </button>
            </>
          ) : (
            <>
              <p className="initial-sync-text">
                Este dispositivo y tu cuenta tienen datos distintos. ¿Qué quieres hacer?
              </p>
              <ul className="initial-sync-choices">
                {CHOICES.map(({ strategy, Icon, title, text }) => (
                  <li key={strategy}>
                    <button type="button" className="initial-sync-choice" onClick={() => run(strategy)} disabled={busy}>
                      <Icon size={18} strokeWidth={1.75} />
                      <span>
                        <strong>{title}</strong>
                        <span>{text}</span>
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            </>
          )}
          {busy && choice !== 'upload' && <p className="initial-sync-text">Sincronizando…</p>}
          {error && <div className="event-form-error">{error}</div>}
          <p className="initial-sync-note">Si quieres, antes de elegir guarda una copia de seguridad de este dispositivo.</p>
        </div>

        <div className="event-form-footer">
          <button type="button" className="event-form-cancel" onClick={() => sync.signOut()} disabled={busy}>
            Cerrar sesión
          </button>
          <button type="button" className="event-form-cancel initial-sync-backup" onClick={() => downloadBackup()} disabled={busy}>
            <Download size={15} strokeWidth={1.75} />
            Descargar copia de seguridad
          </button>
        </div>
      </div>
    </div>
  )
}
