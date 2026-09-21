export function overlaps(aStart, aEnd, bStart, bEnd) {
  return aStart < bEnd && aEnd > bStart
}

// `occurrences` debe venir ya expandida (ver recurrence.js) para el rango relevante.
// excludeSeriesId permite ignorar la propia serie al mover/editar un evento existente.
export function findConflict(occurrences, start, end, { excludeSeriesId } = {}) {
  return occurrences.find((ev) => ev.seriesId !== excludeSeriesId && overlaps(start, end, ev.start, ev.end)) || null
}
