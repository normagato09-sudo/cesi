import {
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

export function getVisibleRange(date, view) {
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
