import { useState } from 'react'
import { Check, Copy, Mail, MessageCircle, Share2 } from 'lucide-react'
import { mailtoUrl, whatsappUrl } from '../lib/proposals'
import { copyText } from '../lib/clipboard'
import './ProposalShare.css'

// Texto listo para enviar con los botones Copiar, Compartir, WhatsApp y Email.
export default function ProposalShare({ text, subject, phone, email, copyLabel = 'Copiar' }) {
  const [copied, setCopied] = useState(false)
  const canShare = typeof navigator !== 'undefined' && typeof navigator.share === 'function'

  const handleCopy = async () => {
    if (await copyText(text)) {
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    }
  }

  const handleShare = async () => {
    try {
      await navigator.share({ title: subject, text })
    } catch {
      // Compartir cancelado por la usuaria: no hace falta avisar.
    }
  }

  return (
    <div className="proposal-share">
      <textarea className="proposal-share-text" value={text} readOnly rows={5} aria-label="Mensaje para enviar" />
      <div className="proposal-share-actions">
        <button type="button" className="proposal-share-btn primary" onClick={handleCopy}>
          {copied ? <Check size={15} strokeWidth={2} /> : <Copy size={15} strokeWidth={1.75} />}
          {copied ? 'Copiado' : copyLabel}
        </button>
        {canShare && (
          <button type="button" className="proposal-share-btn" onClick={handleShare}>
            <Share2 size={15} strokeWidth={1.75} />
            Compartir
          </button>
        )}
        <a className="proposal-share-btn" href={whatsappUrl(text, phone)} target="_blank" rel="noreferrer">
          <MessageCircle size={15} strokeWidth={1.75} />
          WhatsApp
        </a>
        <a className="proposal-share-btn" href={mailtoUrl(text, email, subject)}>
          <Mail size={15} strokeWidth={1.75} />
          Email
        </a>
      </div>
    </div>
  )
}
