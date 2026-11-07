import { useRef } from 'react'
import { Bold, List, ListOrdered } from 'lucide-react'
import RichText from './RichText.jsx'
import { listLines, wrapSelection } from '../lib/richText'

/**
 * Texto con formato sencillo (negrita y listas, ver lib/richText.js): la barra de botones, el
 * cuadro de texto y «Así se verá». value / onChange(texto). Se guarda como texto; se pinta con
 * RichText (nunca como HTML).
 */
export default function RichTextField({ id, label, value, onChange, maxLength, rows = 5, placeholder = '', disabled = false }) {
  const area = useRef(null)
  const apply = (fn) => {
    const el = area.current
    if (!el || disabled) return
    const next = fn(value, el.selectionStart, el.selectionEnd)
    if (!next) return
    onChange(next.value)
    requestAnimationFrame(() => {
      el.focus()
      el.setSelectionRange(next.start, next.end)
    })
  }
  return (
    <div className="rtf">
      <label htmlFor={id}>{label}</label>
      <div className="rtf-tools" role="toolbar" aria-label="Formato">
        <button type="button" onClick={() => apply((v, s, e) => wrapSelection(v, s, e, '**', '**', 'negrita'))} aria-label="Negrita" title="Negrita" disabled={disabled}>
          <Bold size={15} strokeWidth={2} />
        </button>
        <button type="button" onClick={() => apply((v, s, e) => listLines(v, s, e, false))} aria-label="Lista con puntos" title="Lista con puntos" disabled={disabled}>
          <List size={15} strokeWidth={2} />
        </button>
        <button type="button" onClick={() => apply((v, s, e) => listLines(v, s, e, true))} aria-label="Lista numerada" title="Lista numerada" disabled={disabled}>
          <ListOrdered size={15} strokeWidth={2} />
        </button>
      </div>
      <textarea id={id} ref={area} rows={rows} maxLength={maxLength} value={value} placeholder={placeholder} disabled={disabled} onChange={(e) => onChange(e.target.value)} />
      {value.trim() && (
        <div className="rtf-preview">
          <span>Así se verá</span>
          <RichText text={value} />
        </div>
      )}
    </div>
  )
}
