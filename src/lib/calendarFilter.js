import { eventHasTag } from './tags'
import { NO_PROJECT, NO_PROJECT_LABEL } from './projects'

// Filtro del calendario por categoría, etiqueta y/o proyecto: { category, tag, project }
// (null = cualquiera; project = NO_PROJECT para las reuniones sin proyecto). Se combinan.
// Oculta las reuniones que no coinciden; los bloques "No disponible" se siguen viendo.

export const EMPTY_FILTER = { category: null, tag: null, project: null }

export function isFilterActive(filter) {
  return !!(filter?.category || filter?.tag || filter?.project)
}

export function eventMatchesFilter(event, filter) {
  if (!isFilterActive(filter) || event.isUnavailable) return true
  if (filter.category && event.category !== filter.category) return false
  if (filter.tag && !eventHasTag(event, filter.tag)) return false
  if (filter.project === NO_PROJECT && event.projectId) return false
  if (filter.project && filter.project !== NO_PROJECT && event.projectId !== filter.project) return false
  return true
}

export function filterEvents(events, filter) {
  if (!isFilterActive(filter)) return events
  return events.filter((ev) => eventMatchesFilter(ev, filter))
}

function projectLabel(id, projects) {
  if (!id) return null
  if (id === NO_PROJECT) return NO_PROJECT_LABEL
  return projects.find((p) => p.id === id)?.name || 'Proyecto borrado'
}

// "Cliente · #entrevista · Curso de doblaje"
export function filterLabel(filter, projects = []) {
  return [filter.category, filter.tag && `#${filter.tag}`, projectLabel(filter.project, projects)].filter(Boolean).join(' · ')
}

// Categorías que se pueden elegir: las de siempre y las que usan las reuniones guardadas.
export function filterCategories(baseCategories, events) {
  const list = [...baseCategories]
  for (const ev of events) {
    if (!ev.isUnavailable && ev.category && !list.includes(ev.category)) list.push(ev.category)
  }
  return list
}
