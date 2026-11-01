import { Handshake } from 'lucide-react'
import { allianceOf } from '../../lib/alliances'
import './Alliances.css'

// En mi ficha de un contacto externo: «Compartir con Alianzas» (parte 24). Con seguimiento de
// alianza ya es de Alianzas (no se puede dejar de compartir sin quitarle el seguimiento).
// onChange(true | false): guarda contact.allianceShared.
export default function AllianceShare({ contact, onChange }) {
  const tracked = !!allianceOf(contact)
  return (
    <label className="al-share">
      <input type="checkbox" checked={tracked || !!contact.allianceShared} disabled={tracked} onChange={(e) => onChange(e.target.checked)} />
      <Handshake size={14} strokeWidth={1.75} aria-hidden="true" />
      <span>
        Compartir con Alianzas
        <em>{tracked ? 'Tiene seguimiento de alianza: lo ven Alianzas y Directivo.' : 'Si lo compartes, lo ven y editan Alianzas (Directivo, solo verlo).'}</em>
      </span>
    </label>
  )
}
