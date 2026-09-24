import { contactInitials } from '../lib/contacts'
import { useFileUrl } from '../hooks/useFileUrl'
import './ContactAvatar.css'

// size: 'xs' (chips), 'sm' (listas compactas), 'md' (lista de contactos), 'lg' (ficha), 'xl' (equipo)
// Con `photo` (referencia de archivo) muestra la foto; si no hay o aún no ha cargado, las iniciales.
export default function ContactAvatar({ name, photo = null, size = 'md' }) {
  const url = useFileUrl(photo)
  if (url) {
    return (
      <span className={`contact-avatar photo ${size}`} aria-hidden="true">
        <img src={url} alt="" draggable="false" />
      </span>
    )
  }
  return (
    <span className={`contact-avatar ${size}`} aria-hidden="true">
      {contactInitials(name)}
    </span>
  )
}
