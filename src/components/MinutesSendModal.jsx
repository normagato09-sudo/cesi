import { useState } from 'react'
import { createPortal } from 'react-dom'
import { Check, Copy, Download, FileText, X } from 'lucide-react'
import { copyText } from '../lib/clipboard'
import { minutesData, minutesFileName, minutesMessage, minutesSentText } from '../lib/minutes'
import './EventFormModal.css'
import './MinutesSendModal.css'

/**
 * «Enviar acta»: el PDF del acta de esta sesión y un mensaje de plantilla (editable) para pegarlo
 * donde se envíe (p. ej. Discord) junto al PDF. Descargar el PDF marca el acta como enviada
 * (onDownloaded con la fecha); si se vuelve a descargar, se actualiza.
 */
export default function MinutesSendModal({ event, session, contacts, tasks, organizerName, sentAt, onDownloaded, onClose }) {
  const [message, setMessage] = useState(() => minutesMessage(event, contacts))
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)
  const [copied, setCopied] = useState(false)

  const handleDownload = async () => {
    setBusy(true)
    setError(null)
    try {
      // jsPDF se carga solo ahora.
      const { buildMinutesPdf, downloadBlob } = await import('../lib/minutesPdf')
      const blob = await buildMinutesPdf(minutesData({ event, session, contacts, tasks, organizerName }))
      downloadBlob(blob, minutesFileName(event))
      onDownloaded(new Date().toISOString())
    } catch {
      setError('No se ha podido generar el PDF. Inténtalo otra vez.')
    } finally {
      setBusy(false)
    }
  }

  const handleCopy = async () => {
    if (await copyText(message)) {
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    }
  }

  return createPortal(
    <div className="event-form-backdrop minutes-send-backdrop" onClick={onClose}>
      <div className="event-form minutes-send" onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true" aria-labelledby="minutes-send-title">
        <div className="event-form-header">
          <h2 id="minutes-send-title">
            <FileText size={17} strokeWidth={1.75} />
            Enviar acta
          </h2>
          <button type="button" className="event-form-close" onClick={onClose} aria-label="Cerrar">
            <X size={18} strokeWidth={1.75} />
          </button>
        </div>

        <div className="event-form-body">
          <p className="minutes-send-intro">
            Descarga el PDF del acta de «{(event.title || '').trim() || 'Reunión'}» y envíalo junto con este mensaje (por
            ejemplo, en Discord: pega el mensaje y adjunta el PDF).
          </p>
          {sentAt && (
            <p className="minutes-send-sent">
              <Check size={14} strokeWidth={2} />
              {minutesSentText(sentAt)}
            </p>
          )}

          <label className="event-form-field">
            <span>Mensaje</span>
            <textarea value={message} onChange={(e) => setMessage(e.target.value)} rows={5} />
          </label>

          {error && <div className="event-form-error">{error}</div>}

          <div className="minutes-send-actions">
            <button type="button" className="minutes-send-btn" onClick={handleCopy}>
              {copied ? <Check size={16} strokeWidth={2} /> : <Copy size={16} strokeWidth={1.75} />}
              {copied ? 'Copiado' : 'Copiar mensaje'}
            </button>
            <button type="button" className="minutes-send-btn primary" onClick={handleDownload} disabled={busy}>
              <Download size={16} strokeWidth={1.75} />
              {busy ? 'Generando…' : 'Descargar PDF'}
            </button>
          </div>
          <p className="minutes-send-hint">Al descargar el PDF, el acta queda marcada como enviada con la fecha de hoy.</p>
        </div>
      </div>
    </div>,
    document.body,
  )
}
