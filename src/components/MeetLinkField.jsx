import { useEffect, useRef, useState } from 'react'
import { Wand2 } from 'lucide-react'
import PlaceIcon from './PlaceIcon.jsx'
import { getVideoRooms, linkChoices, meetingLinkFor } from '../lib/videoCall'
import './MeetLinkField.css'

// "Enlace de la reunión" con «Generar enlace»: pone el de una de mis salas fijas (Zoom, Meet,
// Teams, las que tenga guardadas en Enlace de reservas › Videollamada) o uno nuevo de Jitsi Meet.
export default function MeetLinkField({ value, onChange }) {
  const [open, setOpen] = useState(false)
  const [choices] = useState(() => linkChoices(getVideoRooms()))
  const ref = useRef(null)

  useEffect(() => {
    if (!open) return
    const close = (e) => {
      if (e.type === 'keydown' ? e.key === 'Escape' : !ref.current?.contains(e.target)) setOpen(false)
    }
    document.addEventListener('pointerdown', close)
    document.addEventListener('keydown', close)
    return () => {
      document.removeEventListener('pointerdown', close)
      document.removeEventListener('keydown', close)
    }
  }, [open])

  const pick = (place) => {
    onChange(meetingLinkFor(place))
    setOpen(false)
  }

  return (
    <div className="event-form-field meet-link-field">
      <label htmlFor="meet-link-input">Enlace de la reunión (opcional)</label>
      <div className="meet-link-row" ref={ref}>
        <input id="meet-link-input" type="text" value={value} onChange={(e) => onChange(e.target.value)} placeholder="https://meet.google.com/..." />
        <button type="button" className="meet-link-generate" onClick={() => setOpen((o) => !o)} aria-expanded={open} aria-haspopup="menu">
          <Wand2 size={15} strokeWidth={1.75} />
          Generar enlace
        </button>
        {open && (
          <div className="meet-link-menu" role="menu">
            {choices.map((p) => (
              <button key={p.id} type="button" role="menuitem" onClick={() => pick(p.id)}>
                <PlaceIcon place={p.id} size={20} />
                <span>
                  {p.label}
                  <em>{p.id === 'jitsi' ? 'Enlace nuevo solo para esta reunión' : 'Tu sala fija'}</em>
                </span>
              </button>
            ))}
            {choices.length === 1 && (
              <p className="meet-link-menu-hint">Guarda tus salas de Zoom, Meet o Teams en Enlace de reservas › Videollamada.</p>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
