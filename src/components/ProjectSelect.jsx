import { Settings2 } from 'lucide-react'
import { projectOptions } from '../lib/projects'
import './ProjectSelect.css'

// "Proyecto (opcional)": los proyectos activos (y el archivado que ya tuviera la reunión) y un
// botón para abrir la gestión de proyectos.
export default function ProjectSelect({ id, projects, value, onChange, onManage, className = 'event-form-field' }) {
  const options = projectOptions(projects, value)
  return (
    <div className={`${className} project-select`}>
      <span className="project-select-label">
        <label htmlFor={id}>Proyecto (opcional)</label>
        {onManage && (
          <button type="button" className="project-select-manage" onClick={onManage}>
            <Settings2 size={12} strokeWidth={2} />
            Gestionar proyectos
          </button>
        )}
      </span>
      <select id={id} value={value || ''} onChange={(e) => onChange(e.target.value || null)}>
        <option value="">Sin proyecto</option>
        {options.map((p) => (
          <option key={p.id} value={p.id}>
            {p.name}
            {p.status === 'archived' ? ' (archivado)' : ''}
          </option>
        ))}
      </select>
      {projects.length === 0 && onManage && <small className="project-select-hint">Aún no tienes proyectos.</small>}
    </div>
  )
}
