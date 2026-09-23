import {
  addDays,
  startOfDay,
  endOfDay,
  startOfMonth,
  endOfMonth,
  startOfWeek,
  endOfWeek,
  eachDayOfInterval,
  isSameDay,
  isSameMonth,
} from 'date-fns'

// Semanas de lunes a domingo
const WEEK_OPTS = { weekStartsOn: 1 }

export function getMonthGridDays(date) {
  const start = startOfWeek(startOfMonth(date), WEEK_OPTS)
  const end = endOfWeek(endOfMonth(date), WEEK_OPTS)
  return eachDayOfInterval({ start, end })
}

export function getWeekDays(date) {
  const start = startOfWeek(date, WEEK_OPTS)
  const end = endOfWeek(date, WEEK_OPTS)
  return eachDayOfInterval({ start, end })
}

// Número de días que muestra la vista Semana en móvil.
export const COMPACT_WEEK_DAYS = 3

export function getCompactWeekDays(date) {
  const start = startOfDay(date)
  return Array.from({ length: COMPACT_WEEK_DAYS }, (_, i) => addDays(start, i))
}

// compactWeek: en móvil la vista Semana muestra COMPACT_WEEK_DAYS días desde `date`.
export function getVisibleRange(date, view, { compactWeek = false } = {}) {
  if (view === 'week' && compactWeek) {
    return { start: startOfDay(date), end: endOfDay(addDays(date, COMPACT_WEEK_DAYS - 1)) }
  }
  if (view === 'month') {
    const start = startOfWeek(startOfMonth(date), WEEK_OPTS)
    const end = endOfWeek(endOfMonth(date), WEEK_OPTS)
    return { start, end }
  }
  if (view === 'week') {
    return { start: startOfWeek(date, WEEK_OPTS), end: endOfWeek(date, WEEK_OPTS) }
  }
  // day
  const start = new Date(date)
  start.setHours(0, 0, 0, 0)
  const end = new Date(date)
  end.setHours(23, 59, 59, 999)
  return { start, end }
}

export { isSameDay, isSameMonth }
