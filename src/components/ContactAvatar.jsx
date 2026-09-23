import { contactInitials } from '../lib/contacts'
import './ContactAvatar.css'

// size: 'xs' (chips), 'sm' (listas compactas), 'md' (lista de contactos), 'lg' (ficha)
export default function ContactAvatar({ name, size = 'md' }) {
  return (
    <span className={`contact-avatar ${size}`} aria-hidden="true">
      {contactInitials(name)}
    </span>
  )
}
