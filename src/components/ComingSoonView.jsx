import { Hourglass } from 'lucide-react'
import './ContactsView.css'

// Pantalla que llegará en una parte siguiente (Fichajes, y las del equipo mientras no se abren sus
// datos). `note`: texto debajo del aviso.
export default function ComingSoonView({ title, Icon = Hourglass, note = '' }) {
  return (
    <div className="contacts-view">
      <div className="contacts-empty">
        <Icon size={32} strokeWidth={1.5} />
        <p className="contacts-empty-title">{title}</p>
        <p>Próximamente.</p>
        {note && <p>{note}</p>}
      </div>
    </div>
  )
}
