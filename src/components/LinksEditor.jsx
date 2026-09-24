import { ArrowDown, ArrowUp, Link2, Plus, Trash2 } from 'lucide-react'
import { linkSite, newLink } from '../lib/links'
import './Links.css'

// Lista "Enlaces" del formulario: la URL que se pega y un nombre opcional; se pueden borrar y
// cambiar de orden. Las redes conocidas se reconocen solas.
export default function LinksEditor({ links, onChange }) {
  const update = (id, patch) => onChange(links.map((l) => (l.id === id ? { ...l, ...patch } : l)))
  const move = (index, delta) => {
    const to = index + delta
    if (to < 0 || to >= links.length) return
    const next = [...links]
    const [item] = next.splice(index, 1)
    next.splice(to, 0, item)
    onChange(next)
  }

  return (
    <div className="links-editor">
      {links.length === 0 && <p className="links-empty">Sin enlaces. Pega aquí sus redes, su web o su portfolio.</p>}
      {links.map((l, i) => {
        const site = l.url.trim() ? linkSite(l.url) : null
        return (
          <div key={l.id} className="links-editor-row">
            <span className="links-editor-icon" aria-hidden="true">
              {site ? <SiteBadge site={site} /> : <Link2 size={15} strokeWidth={1.75} />}
            </span>
            <div className="links-editor-inputs">
              <input
                type="text"
                inputMode="url"
                value={l.url}
                onChange={(e) => update(l.id, { url: e.target.value })}
                placeholder="instagram.com/usuario"
                aria-label="Dirección del enlace"
                autoCapitalize="off"
                autoCorrect="off"
                spellCheck={false}
              />
              <input
                type="text"
                value={l.label}
                onChange={(e) => update(l.id, { label: e.target.value })}
                placeholder={site ? `Nombre (opcional, p. ej. ${site.name})` : 'Nombre (opcional)'}
                aria-label="Nombre del enlace"
              />
            </div>
            <div className="links-editor-actions">
              <button type="button" onClick={() => move(i, -1)} disabled={i === 0} aria-label={`Subir enlace ${i + 1}`} title="Subir">
                <ArrowUp size={14} strokeWidth={1.75} />
              </button>
              <button type="button" onClick={() => move(i, 1)} disabled={i === links.length - 1} aria-label={`Bajar enlace ${i + 1}`} title="Bajar">
                <ArrowDown size={14} strokeWidth={1.75} />
              </button>
              <button type="button" onClick={() => onChange(links.filter((x) => x.id !== l.id))} aria-label={`Quitar enlace ${i + 1}`} title="Quitar">
                <Trash2 size={14} strokeWidth={1.75} />
              </button>
            </div>
          </div>
        )
      })}
      <button type="button" className="team-add-btn" onClick={() => onChange([...links, newLink()])}>
        <Plus size={14} strokeWidth={1.75} />
        Añadir enlace
      </button>
    </div>
  )
}

// Nombre de la red conocida, con su color.
export function SiteBadge({ site }) {
  return (
    <span className="site-badge" style={{ '--site-color': site.color }}>
      {site.name}
    </span>
  )
}
