import { useState } from 'react'
import { ArrowDown, ArrowUp, Building2, Plus, Trash2, X } from 'lucide-react'
import { NO_DEPARTMENT_LABEL, departmentUsage, normalizeDepartmentName, validateDepartmentName } from '../lib/departments'
import './GroupsModal.css'
import './DepartmentsModal.css'

function usageText({ members, vacancies }) {
  const parts = []
  if (members > 0) parts.push(`${members} miembro${members === 1 ? '' : 's'}`)
  if (vacancies > 0) parts.push(`${vacancies} vacante${vacancies === 1 ? '' : 's'}`)
  return parts.length > 0 ? parts.join(' · ') : 'Sin usar'
}

function DepartmentRow({ name, index, list, usage, onRename, onMove, onRemove }) {
  const [value, setValue] = useState(name)
  const [error, setError] = useState(null)
  // Al borrar uno que se usa, primero se elige a dónde pasar sus miembros y vacantes.
  const [removing, setRemoving] = useState(false)
  const others = list.filter((d) => d !== name)
  const [target, setTarget] = useState(others[0] || '')
  const inUse = usage.members + usage.vacancies > 0

  const commit = () => {
    const clean = normalizeDepartmentName(value)
    if (clean === name) {
      setValue(clean)
      setError(null)
      return
    }
    const problem = validateDepartmentName(clean, list, name)
    if (problem) {
      setError(problem)
      return
    }
    setError(null)
    onRename(name, clean)
  }

  const handleDelete = () => {
    if (inUse) {
      setRemoving(true)
      return
    }
    if (window.confirm(`¿Borrar el departamento «${name}»? No lo usa nadie.`)) onRemove(name, '')
  }

  return (
    <li className="group-row department-row">
      <div className="group-row-main">
        <input
          type="text"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onBlur={commit}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault()
              e.currentTarget.blur()
            }
          }}
          aria-label={`Nombre del departamento ${name}`}
        />
        <span className="group-row-count">{usageText(usage)}</span>
        <button
          type="button"
          className="group-row-delete department-move"
          onClick={() => onMove(index, -1)}
          disabled={index === 0}
          aria-label={`Subir ${name}`}
          title="Subir"
        >
          <ArrowUp size={15} strokeWidth={1.75} />
        </button>
        <button
          type="button"
          className="group-row-delete department-move"
          onClick={() => onMove(index, 1)}
          disabled={index === list.length - 1}
          aria-label={`Bajar ${name}`}
          title="Bajar"
        >
          <ArrowDown size={15} strokeWidth={1.75} />
        </button>
        <button type="button" className="group-row-delete" onClick={handleDelete} aria-label={`Borrar el departamento ${name}`} title="Borrar">
          <Trash2 size={15} strokeWidth={1.75} />
        </button>
      </div>
      {error && <p className="group-row-error">{error}</p>}
      {removing && (
        <div className="department-reassign" role="group" aria-label={`Borrar ${name}`}>
          <p>
            «{name}» lo usan {usageText(usage)}. ¿A qué departamento los pasas antes de borrarlo?
          </p>
          <div className="department-reassign-row">
            <select value={target} onChange={(e) => setTarget(e.target.value)} aria-label="Pasar a">
              {others.map((d) => (
                <option key={d} value={d}>
                  {d}
                </option>
              ))}
              <option value="">{NO_DEPARTMENT_LABEL}</option>
            </select>
            <button type="button" className="event-form-cancel" onClick={() => setRemoving(false)}>
              Cancelar
            </button>
            <button type="button" className="department-reassign-confirm" onClick={() => onRemove(name, target)}>
              Pasar y borrar
            </button>
          </div>
        </div>
      )}
    </li>
  )
}

// Añadir, renombrar (se actualiza en miembros y vacantes), ordenar y borrar departamentos.
export default function DepartmentsModal({ departments, contacts, vacancies, onAdd, onRename, onMove, onRemove, onClose }) {
  const [name, setName] = useState('')
  const [error, setError] = useState(null)

  const handleAdd = (e) => {
    e.preventDefault()
    const problem = validateDepartmentName(name, departments)
    if (problem) {
      setError(problem)
      return
    }
    onAdd(normalizeDepartmentName(name))
    setName('')
    setError(null)
  }

  return (
    <div className="event-form-backdrop" onClick={onClose}>
      <div className="event-form groups-modal" onClick={(e) => e.stopPropagation()} role="dialog" aria-label="Departamentos">
        <div className="event-form-header">
          <h2>
            <Building2 size={17} strokeWidth={1.75} />
            Departamentos
          </h2>
          <button type="button" className="event-form-close" onClick={onClose} aria-label="Cerrar">
            <X size={18} strokeWidth={1.75} />
          </button>
        </div>

        <div className="event-form-body">
          <form className="group-new" onSubmit={handleAdd}>
            <div className="group-new-row">
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Nuevo departamento"
                aria-label="Nombre del nuevo departamento"
                autoFocus
              />
              <button type="submit" className="event-form-submit">
                <Plus size={15} strokeWidth={2} />
                Añadir
              </button>
            </div>
            {error && <p className="group-row-error">{error}</p>}
          </form>

          <p className="departments-hint">
            Al renombrar un departamento se cambia en todos los miembros del equipo y las vacantes que lo tienen. El orden
            es el de los desplegables y filtros.
          </p>

          {departments.length === 0 ? (
            <p className="groups-empty">No hay departamentos.</p>
          ) : (
            <ul className="groups-list">
              {departments.map((d, i) => (
                <DepartmentRow
                  key={`${d}-${i}`}
                  name={d}
                  index={i}
                  list={departments}
                  usage={departmentUsage(d, contacts, vacancies)}
                  onRename={onRename}
                  onMove={onMove}
                  onRemove={onRemove}
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
