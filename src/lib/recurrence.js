import { addDays, addWeeks, addMonths, addYears, endOfDay, format } from 'date-fns'

const STEP = { daily: addDays, weekly: addWeeks, monthly: addMonths, yearly: addYears }
const MAX_OCCURRENCES = 3000
const DEFAULT_HORIZON_YEARS = 2

// Día (hora local, 'AAAA-MM-DD') con el que se identifica cada día de una serie: clave de
// notesByDate y de exceptions. Es el día que le toca según la serie, aunque se haya movido.
export function dateKey(date) {
  return format(new Date(date), 'yyyy-MM-dd')
}

// Excepciones de una serie (exceptions { 'AAAA-MM-DD': cambio }):
//   { cancelled: true }  ese día no hay reunión;
//   { start, end, title, participantIds, ... }  ese día tiene sus propios datos (solo los que
//   cambian respecto a la serie).
export function exceptionOf(event, key) {
  const exception = event.exceptions?.[key]
  return exception && typeof exception === 'object' ? exception : null
}

// Genera las ocurrencias de un evento (único o repetitivo) que solapan [rangeStart, rangeEnd).
// En las series, los días cancelados no salen y los cambiados llevan sus propios datos
// (isException: true). originalStart es la hora que le tocaba según la serie.
export function expandEvent(event, rangeStart, rangeEnd) {
  const baseStart = new Date(event.start)
  const baseEnd = new Date(event.end)
  const duration = baseEnd - baseStart

  if (!event.recurrence) {
    return baseStart < rangeEnd && baseEnd > rangeStart
      ? [{ ...event, start: baseStart, end: baseEnd, seriesId: event.id, isRecurringInstance: false }]
      : []
  }

  const { freq, until } = event.recurrence
  const step = STEP[freq]
  if (!step) return []

  const untilDate = until ? endOfDay(new Date(until)) : endOfDay(addYears(baseStart, DEFAULT_HORIZON_YEARS))
  const hasExceptions = event.exceptions && Object.keys(event.exceptions).length > 0
  const occurrences = []

  // Cada ocurrencia se calcula desde `baseStart` (no desde la anterior) para que un mensual/anual
  // anclado en el día 29-31 no vaya "derivando" hacia atrás tras pasar por un mes más corto.
  for (let index = 0; index < MAX_OCCURRENCES; index++) {
    const cursorStart = step(baseStart, index)
    if (cursorStart > untilDate) break
    let start = cursorStart
    let end = new Date(cursorStart.getTime() + duration)
    const key = hasExceptions ? dateKey(cursorStart) : null
    const exception = key ? exceptionOf(event, key) : null
    if (exception?.cancelled) continue
    if (exception) {
      if (exception.start) start = new Date(exception.start)
      if (exception.end) end = new Date(exception.end)
    }
    if (end > rangeStart && start < rangeEnd) {
      const occurrence = {
        ...event,
        id: `${event.id}::${cursorStart.toISOString()}`,
        seriesId: event.id,
        isRecurringInstance: true,
        originalStart: cursorStart,
        start,
        end,
      }
      if (exception) {
        const fields = { ...exception }
        delete fields.start
        delete fields.end
        delete fields.cancelled
        Object.assign(occurrence, fields, { isException: true })
      }
      occurrences.push(occurrence)
    }
  }
  return occurrences
}

export function expandEvents(events, rangeStart, rangeEnd) {
  return events.flatMap((ev) => expandEvent(ev, rangeStart, rangeEnd))
}

export const RECURRENCE_LABELS = {
  daily: 'Cada día',
  weekly: 'Cada semana',
  monthly: 'Cada mes',
  yearly: 'Cada año',
}
