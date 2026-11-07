import { Download } from 'lucide-react'
import { openRoomFile, sizeText } from '../lib/courseRoom'

// Un archivo del aula: al pulsarlo se abre con un enlace temporal (partes 41 y 42).
export default function FileChip({ client, path, name, size, onError }) {
  return (
    <button type="button" className="room-file" onClick={() => openRoomFile(client, path, onError)}>
      <Download size={14} strokeWidth={1.75} />
      <span>{name || 'Archivo'}</span>
      {size ? <em>{sizeText(size)}</em> : null}
    </button>
  )
}
