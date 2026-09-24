import { useState } from 'react'
import { Archive, ArchiveRestore, FolderKanban, Plus, Trash2, X } from 'lucide-react'
import { ColorPicker } from './GroupsModal.jsx'
import { meetingCountByProject, nextProjectColor, normalizeProjectName, validateProjectName } from '../lib/projects'
import './GroupsModal.css'
import './ProjectsModal.css'

function meetingsText(count) {
  return `${count} reunión${count === 1 ? '' : 'es'}`
}

function ProjectRow({ project, projects, count, onUpdate, onDelete }) {
  const [name, setName] = useState(project.name)
  const [error, setError] = useState(null)
  const archived = project.status === 'archived'

  const commit = () => {
    const clean = normalizeProjectName(name)
    if (clean === project.name) {
      setName(clean)
      setError(null)
      return
    }
    const problem = validateProjectName(clean, projects, project.id)
    if (problem) {
      setError(problem)
      return
    }
    setError(null)
    setName(clean)
    onUpdate(project.id, { name: clean })
  }

  const handleDelete = () => {
    const what = count === 0 ? 'No tiene reuniones.' : `Sus ${meetingsText(count)} se conservarán, sin proyecto.`
    if (window.confirm(`¿Borrar el proyecto «${project.name}»? ${what}`)) onDelete(project.id)
  }

  return (
    <li className={`group-row${archived ? ' project-archived' : ''}`}>
      <div className="group-row-main">
        <span className="group-row-swatch" style={{ '--group-color': project.color }} />
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
          aria-label={`Nombre del proyecto ${project.name}`}
        />
        <span className="group-row-count">{meetingsText(count)}</span>
        <button
          type="button"
          className="group-row-delete project-row-archive"
          onClick={() => onUpdate(project.id, { status: archived ? 'active' : 'archived' })}
          aria-label={archived ? `Reactivar el proyecto ${project.name}` : `Archivar el proyecto ${project.name}`}
          title={archived ? 'Reactivar' : 'Archivar'}
        >
          {archived ? <ArchiveRestore size={15} strokeWidth={1.75} /> : <Archive size={15} strokeWidth={1.75} />}
        </button>
        <button type="button" className="group-row-delete" onClick={handleDelete} aria-label={`Borrar el proyecto ${project.name}`} title="Borrar">
          <Trash2 size={15} strokeWidth={1.75} />
        </button>
      </div>
      <ColorPicker value={project.color} onChange={(color) => onUpdate(project.id, { color })} label={`Color de ${project.name}`} />
      {error && <p className="group-row-error">{error}</p>}
    </li>
  )
}

// Crear, renombrar, elegir color, archivar y borrar proyectos.
export default function ProjectsModal({ projects, rawEvents, onCreate, onUpdate, onDelete, onClose }) {
  const [name, setName] = useState('')
  const [color, setColor] = useState(() => nextProjectColor(projects))
  const [error, setError] = useState(null)
  const counts = meetingCountByProject(rawEvents)
  const active = projects.filter((p) => p.status !== 'archived')
  const archived = projects.filter((p) => p.status === 'archived')

  const handleCreate = (e) => {
    e.preventDefault()
    const problem = validateProjectName(name, projects)
    if (problem) {
      setError(problem)
      return
    }
    onCreate({ name: normalizeProjectName(name), color, status: 'active' })
    setColor(nextProjectColor([...projects, { color }]))
    setName('')
    setError(null)
  }

  const renderList = (list) => (
    <ul className="groups-list">
      {list.map((p) => (
        <ProjectRow
          key={`${p.id}-${p.updatedAt}`}
          project={p}
          projects={projects}
          count={counts[p.id] || 0}
          onUpdate={onUpdate}
          onDelete={onDelete}
        />
      ))}
    </ul>
  )

  return (
    <div className="event-form-backdrop projects-backdrop" onClick={onClose}>
      <div className="event-form groups-modal" onClick={(e) => e.stopPropagation()} role="dialog" aria-label="Proyectos">
        <div className="event-form-header">
          <h2>
            <FolderKanban size={17} strokeWidth={1.75} />
            Proyectos
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
                placeholder="Nuevo proyecto, p. ej. Curso de doblaje"
                aria-label="Nombre del nuevo proyecto"
                autoFocus
              />
              <button type="submit" className="event-form-submit">
                <Plus size={15} strokeWidth={2} />
                Crear
              </button>
            </div>
            <ColorPicker value={color} onChange={setColor} label="Color del nuevo proyecto" />
            {error && <p className="group-row-error">{error}</p>}
          </form>

          {projects.length === 0 ? (
            <p className="groups-empty">
              Todavía no tienes proyectos. Crea uno y elígelo en tus reuniones para filtrarlas en el calendario y ver en el
              resumen cuántas horas le dedicas.
            </p>
          ) : (
            <>
              {active.length > 0 ? renderList(active) : <p className="groups-empty">No tienes proyectos activos.</p>}
              {archived.length > 0 && (
                <>
                  <h3 className="projects-subtitle">Archivados</h3>
                  <p className="projects-hint">No se ofrecen en las reuniones nuevas, pero sus reuniones los conservan.</p>
                  {renderList(archived)}
                </>
              )}
            </>
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
