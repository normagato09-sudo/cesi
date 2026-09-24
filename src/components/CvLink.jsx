import { useState } from 'react'
import { ExternalLink, FileText } from 'lucide-react'
import { getFileBlob } from '../lib/files/files'
import { linkUrl } from '../lib/team'

// Abre el CV de un candidato: un PDF guardado (Storage o este dispositivo) o un enlace.
export default function CvLink({ cv, className = 'cv-link' }) {
  const [error, setError] = useState(null)
  if (!cv) return null

  if (cv.url) {
    return (
      <a className={className} href={linkUrl(cv.url)} target="_blank" rel="noreferrer">
        <ExternalLink size={14} strokeWidth={1.75} />
        Ver CV (enlace)
      </a>
    )
  }

  const open = async () => {
    setError(null)
    // La pestaña se abre antes de descargar para que el navegador no la bloquee.
    const win = window.open('', '_blank')
    const blob = await getFileBlob(cv).catch(() => null)
    if (!blob) {
      win?.close()
      setError('No se puede abrir el CV ahora (¿sin conexión?).')
      return
    }
    const url = URL.createObjectURL(blob)
    if (win) win.location.href = url
    else {
      const a = document.createElement('a')
      a.href = url
      a.download = cv.name || 'cv.pdf'
      a.click()
    }
    setTimeout(() => URL.revokeObjectURL(url), 60000)
  }

  return (
    <>
      <button type="button" className={className} onClick={open} title={cv.name || 'CV'}>
        <FileText size={14} strokeWidth={1.75} />
        Ver CV{cv.name ? ` (${cv.name})` : ''}
      </button>
      {error && <span className="cv-link-error">{error}</span>}
    </>
  )
}
