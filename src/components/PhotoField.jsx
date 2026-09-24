import { useRef, useState } from 'react'
import { Camera, Trash2 } from 'lucide-react'
import ContactAvatar from './ContactAvatar.jsx'
import { saveFile } from '../lib/files/files'
import { photoExtension, prepareSquarePhoto } from '../lib/files/image'
import './PhotoField.css'

// Foto de un contacto: elegir (se recorta en cuadrado y se reduce antes de guardarla) o quitar.
// `value` es la referencia del archivo; onChange recibe la nueva referencia o null.
export default function PhotoField({ name, value, onChange }) {
  const inputRef = useRef(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)

  const handleFile = async (e) => {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    setBusy(true)
    setError(null)
    try {
      const blob = await prepareSquarePhoto(file)
      const ref = await saveFile(blob, { folder: 'photos', ext: photoExtension(blob), name: file.name })
      onChange(ref)
    } catch (err) {
      setError(err.message || 'No se pudo guardar la foto.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="photo-field">
      <ContactAvatar name={name || '?'} photo={value} size="lg" />
      <div className="photo-field-actions">
        <button type="button" className="photo-field-btn" onClick={() => inputRef.current?.click()} disabled={busy}>
          <Camera size={14} strokeWidth={1.75} />
          {busy ? 'Preparando…' : value ? 'Cambiar foto' : 'Añadir foto'}
        </button>
        {value && !busy && (
          <button type="button" className="photo-field-btn subtle" onClick={() => onChange(null)}>
            <Trash2 size={14} strokeWidth={1.75} />
            Quitar
          </button>
        )}
        <input
          ref={inputRef}
          type="file"
          accept="image/jpeg,image/png,image/webp,image/heic,image/heif,.heic,.heif"
          onChange={handleFile}
          hidden
        />
      </div>
      {error && <p className="photo-field-error">{error}</p>}
    </div>
  )
}
