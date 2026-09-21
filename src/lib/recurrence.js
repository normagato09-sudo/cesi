import { addDays, addWeeks, addMonths, addYears, endOfDay } from 'date-fns'

const STEP = { daily: addDays, weekly: addWeeks, monthly: addMonths, yearly: addYears }
const MAX_OCCURRENCES = 3000
const DEFAULT_HORIZON_YEARS = 2

// Genera las ocurrencias de un evento (único o repetitivo) que solapan [rangeStart, rangeEnd).
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
  const occurrences = []

  // Cada ocurrencia se calcula desde `baseStart` (no desde la anterior) para que un mensual/anual
  // anclado en el día 29-31 no vaya "derivando" hacia atrás tras pasar por un mes más corto.
  for (let index = 0; index < MAX_OCCURRENCES; index++) {
    const cursorStart = step(baseStart, index)
    if (cursorStart > untilDate) break
    const cursorEnd = new Date(cursorStart.getTime() + duration)
    if (cursorEnd > rangeStart && cursorStart < rangeEnd) {
      occurrences.push({
        ...event,
        id: `${event.id}::${cursorStart.toISOString()}`,
        seriesId: event.id,
        isRecurringInstance: true,
        start: cursorStart,
        end: cursorEnd,
      })
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
