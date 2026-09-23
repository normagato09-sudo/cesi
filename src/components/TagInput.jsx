import { useState } from 'react'
import { Tag, X } from 'lucide-react'
import { addTag, sameTag, tagKey } from '../lib/tags'
import './TagInput.css'

const MAX_SUGGESTIONS = 8

// Campo de etiquetas: Enter o coma para añadir, Backspace con el campo vacío para quitar la última.
export default function TagInput({ labelId, value, onChange, suggestions = [] }) {
  const [text, setText] = useState('')

  const commit = (raw) => {
    const next = addTag(value, raw)
    if (next !== value) onChange(next)
    setText('')
  }

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' || e.key === ',') {
      e.preventDefault()
      if (text.trim()) commit(text)
    } else if (e.key === 'Backspace' && text === '' && value.length > 0) {
      onChange(value.slice(0, -1))
    }
  }

  const query = tagKey(text)
  const available = suggestions
    .filter((s) => !value.some((t) => sameTag(t, s)))
    .filter((s) => !query || tagKey(s).includes(query))
    .slice(0, MAX_SUGGESTIONS)

  return (
    <div className="tag-input">
      <div className="tag-input-control">
        {value.map((tag) => (
          <span key={tag} className="tag-chip">
            <Tag size={11} strokeWidth={2} aria-hidden="true" />
            {tag}
            <button type="button" onClick={() => onChange(value.filter((t) => t !== tag))} aria-label={`Quitar etiqueta ${tag}`}>
              <X size={11} strokeWidth={2} />
            </button>
          </span>
        ))}
        <input
          type="text"
          aria-labelledby={labelId}
          value={text}
          onChange={(e) => setText(e.target.value.replace(',', ''))}
          onKeyDown={handleKeyDown}
          onBlur={() => text.trim() && commit(text)}
          placeholder={value.length ? '' : 'Escribe y pulsa Enter'}
          autoComplete="off"
        />
      </div>
      {available.length > 0 && (
        <div className="tag-input-suggestions" aria-label="Etiquetas usadas">
          {available.map((s) => (
            <button key={s} type="button" onMouseDown={(e) => e.preventDefault()} onClick={() => commit(s)}>
              + {s}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
