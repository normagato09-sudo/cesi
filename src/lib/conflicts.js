export function overlaps(aStart, aEnd, bStart, bEnd) {
  return aStart < bEnd && aEnd > bStart
}

// Al mover/editar un evento existente se ignora a sí mismo: toda su serie (excludeSeriesId) o,
// si se cambia solo un día de la serie, esa ocurrencia (excludeId).
export function isExcluded(ev, { excludeSeriesId, excludeId } = {}) {
  return (!!excludeSeriesId && ev.seriesId === excludeSeriesId) || (!!excludeId && ev.id === excludeId)
}

// `occurrences` debe venir ya expandida (ver recurrence.js) para el rango relevante.
export function findConflict(occurrences, start, end, exclude = {}) {
  return occurrences.find((ev) => !isExcluded(ev, exclude) && overlaps(start, end, ev.start, ev.end)) || null
}
