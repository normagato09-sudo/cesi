import { useState } from 'react'
import { Plus, Tags, Trash2, X } from 'lucide-react'
import { GROUP_COLORS, contactsInGroup, nextGroupColor, normalizeGroupName, validateGroupName } from '../lib/groups'
import './GroupsModal.css'

function ColorPicker({ value, onChange, label }) {
  return (
    <div className="group-colors" role="radiogroup" aria-label={label}>
      {GROUP_COLORS.map((color) => (
        <button
          key={color}
          type="button"
          role="radio"
          aria-checked={value === color}
          aria-label={`Color ${color}`}
          className={`group-color${value === color ? ' on' : ''}`}
          style={{ '--group-color': color }}
          onClick={() => onChange(color)}
        />
      ))}
    </div>
  )
}

function GroupRow({ group, groups, count, onRename, onColor, onDelete }) {
  const [name, setName] = useState(group.name)
  const [error, setError] = useState(null)

  const commit = () => {
    const clean = normalizeGroupName(name)
    if (clean === group.name) {
      setName(clean)
      setError(null)
      return
    }
    const problem = validateGroupName(clean, groups, group.id)
    if (problem) {
      setError(problem)
      return
    }
    setError(null)
    setName(clean)
    onRename(group.id, clean)
  }

  const handleDelete = () => {
    const who = count === 0 ? 'No tiene contactos.' : `Sus ${count} contacto${count === 1 ? '' : 's'} se conservarán.`
    if (window.confirm(`¿Borrar el grupo «${group.name}»? ${who}`)) onDelete(group.id)
  }

  return (
    <li className="group-row">
      <div className="group-row-main">
        <span className="group-row-swatch" style={{ '--group-color': group.color }} />
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          onBlur={commit}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault()
              e.currentTarget.blur()
            }
          }}
          aria-label={`Nombre del grupo ${group.name}`}
        />
        <span className="group-row-count">
          {count} contacto{count === 1 ? '' : 's'}
        </span>
        <button type="button" className="group-row-delete" onClick={handleDelete} aria-label={`Borrar el grupo ${group.name}`}>
          <Trash2 size={15} strokeWidth={1.75} />
        </button>
      </div>
      <ColorPicker value={group.color} onChange={(color) => onColor(group.id, color)} label={`Color de ${group.name}`} />
      {error && <p className="group-row-error">{error}</p>}
    </li>
  )
}

// Crear, renombrar, elegir color y borrar grupos de contactos.
export default function GroupsModal({ groups, contacts, onCreate, onRename, onColor, onDelete, onClose }) {
  const [name, setName] = useState('')
  const [color, setColor] = useState(() => nextGroupColor(groups))
  const [error, setError] = useState(null)

  const handleCreate = (e) => {
    e.preventDefault()
    const problem = validateGroupName(name, groups)
    if (problem) {
      setError(problem)
      return
    }
    onCreate({ name: normalizeGroupName(name), color })
    // El siguiente grupo propone otro color distinto.
    setColor(nextGroupColor([...groups, { color }]))
    setName('')
    setError(null)
  }

  return (
    <div className="event-form-backdrop" onClick={onClose}>
      <div className="event-form groups-modal" onClick={(e) => e.stopPropagation()} role="dialog" aria-label="Grupos de contactos">
        <div className="event-form-header">
          <h2>
            <Tags size={17} strokeWidth={1.75} />
            Grupos de contactos
          </h2>
          <button type="button" className="event-form-close" onClick={onClose} aria-label="Cerrar">
            <X size={18} strokeWidth={1.75} />
          </button>
        </div>

        <div className="event-form-body">
          <form className="group-new" onSubmit={handleCreate}>
            <div className="group-new-row">
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Nuevo grupo, p. ej. Profesores"
                aria-label="Nombre del nuevo grupo"
                autoFocus
              />
              <button type="submit" className="event-form-submit">
                <Plus size={15} strokeWidth={2} />
                Crear
              </button>
            </div>
            <ColorPicker value={color} onChange={setColor} label="Color del nuevo grupo" />
            {error && <p className="group-row-error">{error}</p>}
          </form>

          {groups.length === 0 ? (
            <p className="groups-empty">
              Todavía no tienes grupos. Crea uno y asígnalo a tus contactos desde su ficha para poder filtrarlos y
              añadirlos de una vez a una reunión.
            </p>
          ) : (
            <ul className="groups-list">
              {groups.map((g) => (
                <GroupRow
                  key={`${g.id}-${g.updatedAt}`}
                  group={g}
                  groups={groups}
                  count={contactsInGroup(g.id, contacts).length}
                  onRename={onRename}
                  onColor={onColor}
                  onDelete={onDelete}
                />
              ))}
            </ul>
          )}
        </div>

        <div className="event-form-footer">
          <button type="button" className="event-form-submit" onClick={onClose}>
            Hecho
          </button>
        </div>
      </div>
    </div>
  )
}
