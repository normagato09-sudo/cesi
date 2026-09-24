import { useState } from 'react'
import { Briefcase, X } from 'lucide-react'
import { VACANCY_STATUS, newVacancy } from '../lib/vacancies'
import { addArea } from '../lib/team'
import { departmentKey } from '../lib/departments'
import './EventFormModal.css'

const NEW_AREA = '__new__'

// Crear o editar una vacante: título, departamento (la lista de Equipo), descripción, requisitos,
// fecha de apertura y estado.
export default function VacancyFormModal({ initialVacancy = null, areas, onAddArea, onSubmit, onClose }) {
  const seed = initialVacancy || newVacancy()
  const [title, setTitle] = useState(seed.title)
  const [area, setArea] = useState(seed.area)
  const [addingArea, setAddingArea] = useState(false)
  const [newAreaName, setNewAreaName] = useState('')
  const [description, setDescription] = useState(seed.description)
  const [requirements, setRequirements] = useState(seed.requirements)
  const [openedAt, setOpenedAt] = useState(seed.openedAt)
  const [status, setStatus] = useState(seed.status)
  const [error, setError] = useState(null)

  const confirmNewArea = () => {
    const clean = newAreaName.replace(/\s+/g, ' ').trim()
    if (!clean) return
    const next = addArea(areas, clean)
    if (next !== areas) onAddArea(clean)
    setArea(next.find((a) => departmentKey(a) === departmentKey(clean)) || clean)
    setAddingArea(false)
    setNewAreaName('')
  }

  const handleSubmit = (e) => {
    e.preventDefault()
    if (!title.trim()) return setError('Ponle un título a la vacante.')
    if (!openedAt) return setError('Indica la fecha de apertura.')
    onSubmit({ title: title.trim(), area, description: description.trim(), requirements: requirements.trim(), openedAt, status })
    onClose()
  }

  return (
    <div className="event-form-backdrop" onClick={onClose}>
      <form className="event-form" onClick={(e) => e.stopPropagation()} onSubmit={handleSubmit} noValidate>
        <div className="event-form-header">
          <h2>
            <Briefcase size={17} strokeWidth={1.75} />
            {initialVacancy ? 'Editar vacante' : 'Nueva vacante'}
          </h2>
          <button type="button" className="event-form-close" onClick={onClose} aria-label="Cerrar">
            <X size={18} strokeWidth={1.75} />
          </button>
        </div>

        <div className="event-form-body">
          <label className="event-form-field">
            <span>Título</span>
            <input type="text" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Profesor/a de doblaje" autoFocus />
          </label>

          <div className="event-form-row">
            <label className="event-form-field">
              <span>Departamento</span>
              {addingArea ? (
                <span className="vacancy-new-area">
                  <input
                    type="text"
                    value={newAreaName}
                    onChange={(e) => setNewAreaName(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault()
                        confirmNewArea()
                      }
                    }}
                    placeholder="Nombre del departamento"
                    aria-label="Nombre del nuevo departamento"
                    autoFocus
                  />
                  <button type="button" className="event-form-submit" onClick={confirmNewArea}>
                    Añadir
                  </button>
                </span>
              ) : (
                <select value={area} onChange={(e) => (e.target.value === NEW_AREA ? setAddingArea(true) : setArea(e.target.value))}>
                  <option value="">Sin departamento</option>
                  {areas.map((a) => (
                    <option key={a} value={a}>
                      {a}
                    </option>
                  ))}
                  {area && !areas.includes(area) && <option value={area}>{area}</option>}
                  <option value={NEW_AREA}>+ Añadir un departamento…</option>
                </select>
              )}
            </label>
            <label className="event-form-field">
              <span>Estado</span>
              <select value={status} onChange={(e) => setStatus(e.target.value)}>
                {Object.entries(VACANCY_STATUS).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
            </label>
          </div>

          <label className="event-form-field">
            <span>Fecha de apertura</span>
            <input type="date" value={openedAt} onChange={(e) => setOpenedAt(e.target.value)} />
          </label>

          <label className="event-form-field">
            <span>Descripción (opcional)</span>
            <textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={3} placeholder="Qué hará la persona, horario, modalidad…" />
          </label>

          <label className="event-form-field">
            <span>Requisitos (opcional)</span>
            <textarea value={requirements} onChange={(e) => setRequirements(e.target.value)} rows={3} placeholder="Experiencia, formación, idiomas…" />
          </label>

          {error && <div className="event-form-error">{error}</div>}
        </div>

        <div className="event-form-footer">
          <button type="button" className="event-form-cancel" onClick={onClose}>
            Cancelar
          </button>
          <button type="submit" className="event-form-submit">
            {initialVacancy ? 'Guardar cambios' : 'Crear vacante'}
          </button>
        </div>
      </form>
    </div>
  )
}
