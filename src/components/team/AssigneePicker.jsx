import { useMemo, useState } from 'react'
import { X } from 'lucide-react'

function normalize(text) {
  return (text || '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
}

// «Asignada a» de Directivo y la ceo: varias personas (con buscador) o un área entera.
// people: [{ id, name, area }]; areas: [{ id, name }]. form: { mode, assignees, assignArea }.
export default function AssigneePicker({ people, areas, form, onChange, error = null }) {
  const [query, setQuery] = useState('')
  const selected = new Set(form.assignees)
  const byId = useMemo(() => new Map(people.map((p) => [p.id, p])), [people])
  const matches = useMemo(() => {
    const q = normalize(query.trim())
    return q ? people.filter((p) => normalize(p.name).includes(q)) : people
  }, [people, query])
  const inArea = form.assignArea ? people.filter((p) => p.area === form.assignArea) : []

  const toggle = (id) => onChange({ assignees: selected.has(id) ? form.assignees.filter((x) => x !== id) : [...form.assignees, id] })

  return (
    <div className={`sc-field tw-assign${error ? ' invalid' : ''}`}>
      <span>Asignada a</span>
      <div className="tw-filters" role="radiogroup" aria-label="Cómo asignarla">
        {[
          { id: 'people', label: 'Personas' },
          { id: 'area', label: 'Un área entera' },
        ].map((m) => (
          <button
            key={m.id}
            type="button"
            role="radio"
            aria-checked={form.mode === m.id}
            className={`tw-filter${form.mode === m.id ? ' on' : ''}`}
            onClick={() => onChange({ mode: m.id })}
          >
            {m.label}
          </button>
        ))}
      </div>

      {form.mode === 'area' ? (
        <>
          <select value={form.assignArea} onChange={(e) => onChange({ assignArea: e.target.value })} aria-label="Área entera">
            <option value="">Elige el área</option>
            {areas.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name}
              </option>
            ))}
          </select>
          {form.assignArea && (
            <span className="sc-zone">
              {inArea.length === 0
                ? 'Nadie del equipo tiene esa área todavía.'
                : `Se asigna a quienes la tienen al guardar (${inArea.length}): ${inArea.map((p) => p.name).join(', ')}.`}
            </span>
          )}
        </>
      ) : (
        <>
          {form.assignees.length > 0 ? (
            <ul className="tw-chips" aria-label="Personas asignadas">
              {form.assignees.map((id) => (
                <li key={id} className="tw-chip">
                  {byId.get(id)?.name || 'Persona'}
                  <button type="button" aria-label={`Quitar a ${byId.get(id)?.name || 'esta persona'}`} onClick={() => toggle(id)}>
                    <X size={12} strokeWidth={2} />
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            <span className="sc-zone">Sin asignar</span>
          )}
          <input type="search" value={query} placeholder="Buscar persona…" onChange={(e) => setQuery(e.target.value)} aria-label="Buscar persona" />
          <ul className="tw-pick-list">
            {matches.length === 0 ? (
              <li className="sc-zone">Nadie con ese nombre.</li>
            ) : (
              matches.map((p) => (
                <li key={p.id}>
                  <label>
                    <input type="checkbox" checked={selected.has(p.id)} onChange={() => toggle(p.id)} />
                    <span>{p.name}</span>
                    {p.area && <span className="tw-pick-area">{areas.find((a) => a.id === p.area)?.name || ''}</span>}
                  </label>
                </li>
              ))
            )}
          </ul>
        </>
      )}
      {error && <span className="sc-error">{error}</span>}
    </div>
  )
}
