import { useRef, useState } from 'react'
import { X, DatabaseBackup, Download, Upload } from 'lucide-react'
import { downloadBackup, readBackupFile, restoreBackup } from '../lib/backup'
import { useSync } from '../lib/sync/syncContext'
import './EventFormModal.css'
import './BackupModal.css'

function plural(n, one, many) {
  return `${n} ${n === 1 ? one : many}`
}

export default function BackupModal({ onClose, onRestored }) {
  const fileRef = useRef(null)
  const synced = !!useSync()
  const [status, setStatus] = useState(null)

  const handleDownload = () => {
    try {
      const backup = downloadBackup()
      setStatus({
        type: 'ok',
        text: `Copia descargada con ${plural(backup.events.length, 'reunión', 'reuniones')} y ${plural(backup.contacts.length, 'contacto', 'contactos')}.`,
      })
    } catch {
      setStatus({ type: 'error', text: 'No se pudo generar la copia.' })
    }
  }

  const handleFile = async (e) => {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    setStatus(null)
    try {
      const data = await readBackupFile(file)
      const ok = window.confirm(
        `Vas a importar una copia con ${plural(data.events.length, 'reunión', 'reuniones')} y ` +
          `${plural(data.contacts.length, 'contacto', 'contactos')}.\n\n` +
          (synced ? 'Esto SUSTITUYE todos los datos actuales de este dispositivo y de tu cuenta (' : 'Esto SUSTITUYE todos los datos actuales de este dispositivo (') +
          'reuniones con sus notas, contactos, grupos, horario, disponibilidad de cada semana, preferencias, reglas y propuestas). ¿Continuar?',
      )
      if (!ok) return
      restoreBackup(data)
      onRestored()
      setStatus({ type: 'ok', text: 'Copia importada. Los datos se han restaurado.' })
    } catch (err) {
      setStatus({ type: 'error', text: err.message || 'No se pudo importar la copia.' })
    }
  }

  return (
    <div className="event-form-backdrop" onClick={onClose}>
      <div className="event-form backup-modal" onClick={(e) => e.stopPropagation()}>
        <div className="event-form-header">
          <h2>
            <DatabaseBackup size={17} strokeWidth={1.75} />
            Copia de seguridad
          </h2>
          <button type="button" className="event-form-close" onClick={onClose} aria-label="Cerrar">
            <X size={18} strokeWidth={1.75} />
          </button>
        </div>

        <div className="event-form-body">
          <p className="backup-hint">
            {synced
              ? 'Tus datos se guardan en este dispositivo y se sincronizan con tu cuenta. Al importar una copia también se sustituyen los datos de tu cuenta en todos tus dispositivos.'
              : 'Tus reuniones y contactos se guardan solo en este dispositivo, en este navegador. Descarga una copia de vez en cuando para no perderlos o para pasarlos a otro dispositivo.'}
          </p>
          <p className="backup-hint backup-files-note">
            Las fotos y los CV no van dentro de la copia: solo su referencia.{' '}
            {synced
              ? 'Siguen guardados en tu cuenta (Supabase Storage) y se vuelven a ver al importar la copia con la misma cuenta.'
              : 'Están guardados en este navegador; si importas la copia en otro dispositivo, allí se verán las iniciales en lugar de las fotos.'}
          </p>

          <button type="button" className="backup-action" onClick={handleDownload}>
            <Download size={17} strokeWidth={1.75} />
            <span>
              <strong>Descargar copia</strong>
              <small>Guarda un archivo .json con todos tus datos.</small>
            </span>
          </button>

          <button type="button" className="backup-action" onClick={() => fileRef.current?.click()}>
            <Upload size={17} strokeWidth={1.75} />
            <span>
              <strong>Importar copia</strong>
              <small>Sustituye los datos actuales por los del archivo.</small>
            </span>
          </button>
          <input
            ref={fileRef}
            type="file"
            accept="application/json,.json"
            className="backup-file-input"
            onChange={handleFile}
            tabIndex={-1}
            aria-hidden="true"
          />

          {status && (
            <div className={status.type === 'error' ? 'event-form-error' : 'backup-ok'} role="status">
              {status.text}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
