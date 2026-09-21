import { startOfWeek, endOfWeek, startOfDay, endOfDay, addDays } from 'date-fns'
import { expandEvents } from './recurrence'
import { workingHoursForDay } from './availability'

const WEEK_OPTS = { weekStartsOn: 1 }
const DEFAULT_REF = { start: '09:00', end: '18:00' }
export const WEEKDAY_SHORT_LABELS = ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo']

function clip(aStart, aEnd, bStart, bEnd) {
  const start = new Date(Math.max(aStart, bStart))
  const end = new Date(Math.min(aEnd, bEnd))
  return end > start ? end - start : 0
}

function combine(day, hhmm) {
  const [h, m] = hhmm.split(':').map(Number)
  const d = new Date(day)
  d.setHours(h, m, 0, 0)
  return d
}

export function computeSummary(events, workingHours, now = new Date()) {
  const todayStart = startOfDay(now)
  const todayEnd = endOfDay(now)
  const weekStart = startOfWeek(now, WEEK_OPTS)
  const weekEnd = endOfWeek(now, WEEK_OPTS)

  const weekOccurrences = expandEvents(events, weekStart, weekEnd)
  const todayOccurrences = weekOccurrences.filter((ev) => ev.start < todayEnd && ev.end > todayStart)

  const todayRef = workingHoursForDay(workingHours, now.getDay()) || DEFAULT_REF
  const refStart = combine(now, todayRef.start)
  const refEnd = combine(now, todayRef.end)
  const refTotalMs = Math.max(0, refEnd - refStart)

  const occupiedTodayMs = todayOccurrences.reduce((sum, ev) => sum + clip(ev.start, ev.end, refStart, refEnd), 0)
  const meetingsToday = todayOccurrences.filter((ev) => !ev.isUnavailable).length

  const meetingsThisWeek = weekOccurrences.filter((ev) => !ev.isUnavailable).length
  const occupiedByDay = [0, 0, 0, 0, 0, 0, 0] // 0=lunes..6=domingo (offset desde weekStart)
  for (const ev of weekOccurrences) {
    const dayIndex = Math.floor((startOfDay(ev.start) - weekStart) / 86400000)
    if (dayIndex >= 0 && dayIndex < 7) {
      occupiedByDay[dayIndex] += clip(ev.start, ev.end, weekStart, weekEnd)
    }
  }
  const occupiedThisWeekMs = occupiedByDay.reduce((a, b) => a + b, 0)
  const busiestDayIndex = occupiedByDay.every((m) => m === 0)
    ? null
    : occupiedByDay.indexOf(Math.max(...occupiedByDay))

  const upcoming = expandEvents(events, now, addDays(now, 30))
    .filter((ev) => !ev.isUnavailable && ev.start >= now)
    .sort((a, b) => a.start - b.start)
  const nextMeeting = upcoming[0] || null

  return {
    today: {
      meetings: meetingsToday,
      occupiedMs: occupiedTodayMs,
      freeMs: Math.max(0, refTotalMs - occupiedTodayMs),
    },
    week: {
      meetings: meetingsThisWeek,
      occupiedMs: occupiedThisWeekMs,
      busiestDayIndex,
    },
    nextMeeting,
  }
}

export function formatDuration(ms) {
  const totalMinutes = Math.round(ms / 60000)
  const h = Math.floor(totalMinutes / 60)
  const m = totalMinutes % 60
  if (h === 0) return `${m} min`
  if (m === 0) return `${h} h`
  return `${h} h ${m} min`
}
