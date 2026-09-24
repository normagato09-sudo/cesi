import { useEffect, useMemo, useRef, useState } from 'react'
import { ListFilter, X } from 'lucide-react'
import { CATEGORY_OPTIONS } from '../lib/eventStyle'
import { allTags } from '../lib/tags'
import { EMPTY_FILTER, filterCategories, filterLabel, isFilterActive } from '../lib/calendarFilter'
import { NO_PROJECT, NO_PROJECT_LABEL } from '../lib/projects'
import './CalendarFilter.css'

// Botón "Filtrar" con su menú desplegable (categoría, etiqueta y proyecto, combinables).
export function CalendarFilterButton({ filter, onChange, rawEvents, projects = [], onManageProjects }) {
  const [open, setOpen] = useState(false)
  const rootRef = useRef(null)
  const active = isFilterActive(filter)

  const categories = useMemo(() => filterCategories(CATEGORY_OPTIONS, rawEvents), [rawEvents])
  const tags = useMemo(() => allTags(rawEvents.filter((ev) => !ev.isUnavailable)), [rawEvents])

  useEffect(() => {
    if (!open) return
    const handlePointerDown = (e) => {
      if (rootRef.current && !rootRef.current.contains(e.target)) setOpen(false)
    }
    const handleKey = (e) => e.key === 'Escape' && setOpen(false)
    document.addEventListener('pointerdown', handlePointerDown)
    document.addEventListener('keydown', handleKey)
    return () => {
      document.removeEventListener('pointerdown', handlePointerDown)
      document.removeEventListener('keydown', handleKey)
    }
  }, [open])

  return (
    <div className="calendar-filter" ref={rootRef}>
      <button
        type="button"
        className={`header-action-btn calendar-filter-btn${active ? ' active' : ''}`}
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-haspopup="dialog"
        aria-label={active ? `Filtro activo: ${filterLabel(filter, projects)}` : 'Filtrar'}
        title={active ? `Filtro activo: ${filterLabel(filter, projects)}` : 'Filtrar por categoría, etiqueta o proyecto'}
      >
        <ListFilter size={15} strokeWidth={1.75} />
        <span className="header-action-label">Filtrar</span>
        {active && <span className="calendar-filter-dot" aria-hidden="true" />}
      </button>

      {open && (
        <div className="calendar-filter-menu" role="dialog" aria-label="Filtrar el calendario">
          <label className="calendar-filter-field">
            <span>Categoría</span>
            <select
              value={filter.category || ''}
              onChange={(e) => onChange({ ...filter, category: e.target.value || null })}
            >
              <option value="">Todas</option>
              {categories.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </label>
          <label className="calendar-filter-field">
            <span>Etiqueta</span>
            <select value={filter.tag || ''} onChange={(e) => onChange({ ...filter, tag: e.target.value || null })}>
              <option value="">Todas</option>
              {tags.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
          </label>
          {tags.length === 0 && <p className="calendar-filter-hint">Todavía no has usado etiquetas en tus reuniones.</p>}
          <label className="calendar-filter-field">
            <span className="calendar-filter-field-head">
              Proyecto
              {onManageProjects && (
                <button
                  type="button"
                  className="calendar-filter-manage"
                  onClick={(e) => {
                    e.preventDefault()
                    setOpen(false)
                    onManageProjects()
                  }}
                >
                  Gestionar
                </button>
              )}
            </span>
            <select value={filter.project || ''} onChange={(e) => onChange({ ...filter, project: e.target.value || null })}>
              <option value="">Todos</option>
              <option value={NO_PROJECT}>{NO_PROJECT_LABEL}</option>
              {projects.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                  {p.status === 'archived' ? ' (archivado)' : ''}
                </option>
              ))}
            </select>
          </label>
          <div className="calendar-filter-actions">
            <button
              type="button"
              className="calendar-filter-clear"
              onClick={() => onChange(EMPTY_FILTER)}
              disabled={!active}
            >
              Quitar filtro
            </button>
            <button type="button" className="calendar-filter-done" onClick={() => setOpen(false)}>
              Listo
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

// Aviso bien visible bajo la cabecera mientras hay un filtro activo.
export function CalendarFilterBar({ filter, onChange, projects = [] }) {
  if (!isFilterActive(filter)) return null
  return (
    <div className="calendar-filter-bar" role="status">
      <ListFilter size={14} strokeWidth={1.75} />
      <span className="calendar-filter-bar-text">
        Solo se muestran las reuniones de <strong>{filterLabel(filter, projects)}</strong>
      </span>
      <button type="button" onClick={() => onChange(EMPTY_FILTER)}>
        <X size={13} strokeWidth={2} />
        Quitar filtro
      </button>
    </div>
  )
}
