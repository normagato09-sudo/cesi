import { eventHasTag } from './tags'

// Filtro del calendario por categoría y/o etiqueta: { category, tag } (null = cualquiera).
// Oculta las reuniones que no coinciden; los bloques "No disponible" se siguen viendo.

export const EMPTY_FILTER = { category: null, tag: null }

export function isFilterActive(filter) {
  return !!(filter?.category || filter?.tag)
}

export function eventMatchesFilter(event, filter) {
  if (!isFilterActive(filter) || event.isUnavailable) return true
  if (filter.category && event.category !== filter.category) return false
  if (filter.tag && !eventHasTag(event, filter.tag)) return false
  return true
}

export function filterEvents(events, filter) {
  if (!isFilterActive(filter)) return events
  return events.filter((ev) => eventMatchesFilter(ev, filter))
}

// "Cliente · #entrevista"
export function filterLabel(filter) {
  return [filter.category, filter.tag && `#${filter.tag}`].filter(Boolean).join(' · ')
}

// Categorías que se pueden elegir: las de siempre y las que usan las reuniones guardadas.
export function filterCategories(baseCategories, events) {
  const list = [...baseCategories]
  for (const ev of events) {
    if (!ev.isUnavailable && ev.category && !list.includes(ev.category)) list.push(ev.category)
  }
  return list
}
