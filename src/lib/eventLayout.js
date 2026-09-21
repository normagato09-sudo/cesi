// Asigna columnas simples a eventos solapados dentro de un mismo día,
// para poder mostrarlos lado a lado en la vista de semana/día.
export function layoutEvents(events) {
  const sorted = [...events].sort((a, b) => a.start - b.start || a.end - b.end)
  const columnEnds = []
  const placed = sorted.map((event) => {
    let colIndex = columnEnds.findIndex((end) => end <= event.start)
    if (colIndex === -1) {
      colIndex = columnEnds.length
      columnEnds.push(event.end)
    } else {
      columnEnds[colIndex] = event.end
    }
    return { event, col: colIndex }
  })
  const colCount = columnEnds.length || 1
  return placed.map((p) => ({ ...p, colCount }))
}

export function isEventOnDay(event, day) {
  const dayStart = new Date(day)
  dayStart.setHours(0, 0, 0, 0)
  const dayEnd = new Date(day)
  dayEnd.setHours(23, 59, 59, 999)
  return event.start <= dayEnd && event.end > dayStart
}
