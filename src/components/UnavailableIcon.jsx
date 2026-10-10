import { Ban, TreePalm } from 'lucide-react'
import { unavailableKindOf } from '../lib/unavailableKinds'

// Icono de una franja "No disponible": palmera (vacaciones, también los antiguos festivos) o el de siempre.
export default function UnavailableIcon({ event, size = 12 }) {
  const kind = unavailableKindOf(event)
  const Icon = kind === 'vacation' ? TreePalm : Ban
  return <Icon size={size} strokeWidth={2} aria-hidden="true" />
}
