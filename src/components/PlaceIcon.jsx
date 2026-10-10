import { MapPin, Users, Video } from 'lucide-react'
import './PlaceIcon.css'

// Icono de dónde se hace la reunión: el color de cada plataforma con un símbolo sencillo (sin
// logotipos), o un punto en el mapa para presencial / por teléfono.
const ICONS = {
  zoom: { Icon: Video, color: '#0b5cff' },
  meet: { Icon: Video, color: '#00832d' },
  teams: { Icon: Users, color: '#5b5fc7' },
  jitsi: { Icon: Video, color: '#1d76ba' },
  in_person: { Icon: MapPin, color: '#6b7280' },
}

export default function PlaceIcon({ place, size = 22 }) {
  const icon = ICONS[place]
  if (!icon) return null
  const { Icon, color } = icon
  return (
    <span className="place-icon" style={{ '--place-color': color, width: size, height: size }} aria-hidden="true">
      <Icon size={Math.round(size * 0.62)} strokeWidth={2.1} />
    </span>
  )
}
