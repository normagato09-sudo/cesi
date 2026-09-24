import { addDays, addWeeks, startOfWeek } from 'date-fns'
import { expandEvents } from './recurrence'
import { mergeIntervals, subtractIntervals } from './intervals'
import { scheduleIntervalsOn } from './weeklyAvailability'
import { participantsOf } from './contacts'
import { isRealMeeting } from './notes'
import { normalizeTag, tagKey } from './tags'

// Resumen semanal (sección "Resumen"). Semanas de lunes a domingo.
// Solo cuentan las reuniones: no los bloques "No disponible" ni las opciones provisionales.

export const TOP_CONTACTS = 5

export function weekStartOf(date) {
  return startOfWeek(date, { weekStartsOn: 1 })
}

function totalMs(intervals) {
  return intervals.reduce((sum, i) => sum + (i.end - i.start), 0)
}

function clipTo(intervals, start, end) {
  return intervals
    .map((i) => ({ start: new Date(Math.max(i.start, start)), end: new Date(Math.min(i.end, end)) }))
    .filter((i) => i.end > i.start)
}

// Tiempo en reuniones sin contar dos veces las que se solapan.
function meetingTime(meetings, start, end) {
  return totalMs(clipTo(mergeIntervals(meetings.map((m) => ({ start: m.start, end: m.end }))), start, end))
}

function durationOf(ev) {
  return ev.end - ev.start
}

// Suma { count, ms } por clave; devuelve la lista ordenada por tiempo y luego por número.
function tally(entries) {
  const map = new Map()
  for (const { key, label, ms, extra } of entries) {
    const row = map.get(key) || { key, label, count: 0, ms: 0, ...extra }
    row.count += 1
    row.ms += ms
    map.set(key, row)
  }
  return [...map.values()].sort((a, b) => b.ms - a.ms || b.count - a.count || a.label.localeCompare(b.label, 'es'))
}

// Datos básicos de una semana: reuniones, tiempo en reuniones y tiempo libre dentro del horario.
function weekTotals(rawEvents, weekStart, workingHours, weeklyAvailability) {
  const weekEnd = addDays(weekStart, 7)
  const occurrences = expandEvents(rawEvents, weekStart, weekEnd)
  const meetings = occurrences.filter(isRealMeeting).sort((a, b) => a.start - b.start)

  const days = Array.from({ length: 7 }, (_, i) => {
    const date = addDays(weekStart, i)
    const next = addDays(weekStart, i + 1)
    const ofDay = meetings.filter((m) => m.start < next && m.end > date)
    return { date, meetings: ofDay.length, ms: meetingTime(ofDay, date, next) }
  })

  // Libre = mi horario (el declarado para esa semana o, si no, el habitual) menos las reuniones y
  // los bloques "No disponible" (las opciones provisionales no ocupan: aún no están confirmadas).
  const busy = occurrences.filter((ev) => !ev.provisional).map((ev) => ({ start: ev.start, end: ev.end }))
  const windows = days.flatMap((d) => scheduleIntervalsOn(d.date, workingHours, weeklyAvailability))
  const freeMs = totalMs(subtractIntervals(windows, busy))

  return { weekStart, weekEnd, meetings, days, meetingMs: meetingTime(meetings, weekStart, weekEnd), freeMs }
}

/**
 * Resumen de la semana que empieza en `weekStart` (lunes), comparado con la anterior.
 */
export function computeWeeklyReport(rawEvents, { weekStart, workingHours, weeklyAvailability = [], contacts = [], groups = [] }) {
  const current = weekTotals(rawEvents, weekStart, workingHours, weeklyAvailability)
  const previous = weekTotals(rawEvents, addWeeks(weekStart, -1), workingHours, weeklyAvailability)
  const { meetings, days } = current

  const busiest = days.reduce((best, d, i) => (d.ms > 0 && (best === null || d.ms > days[best].ms) ? i : best), null)

  const byCategory = tally(meetings.map((m) => ({ key: m.category || 'Sin categoría', label: m.category || 'Sin categoría', ms: durationOf(m) })))

  const byTag = tally(
    meetings.flatMap((m) => {
      const seen = new Set()
      return (m.tags || [])
        .filter((t) => {
          const key = tagKey(t)
          if (!key || seen.has(key)) return false
          seen.add(key)
          return true
        })
        .map((t) => ({ key: tagKey(t), label: normalizeTag(t), ms: durationOf(m) }))
    }),
  )

  const people = meetings.map((m) => ({ meeting: m, contacts: participantsOf(m, contacts).contacts }))

  const byGroup = tally(
    people.flatMap(({ meeting, contacts: list }) =>
      groups
        .filter((g) => list.some((c) => (c.groupIds || []).includes(g.id)))
        .map((g) => ({ key: g.id, label: g.name, ms: durationOf(meeting), extra: { color: g.color } })),
    ),
  )

  const topContacts = tally(
    people.flatMap(({ meeting, contacts: list }) =>
      list.map((c) => ({ key: c.id, label: c.name, ms: durationOf(meeting), extra: { contact: c } })),
    ),
  )
    .sort((a, b) => b.count - a.count || b.ms - a.ms || a.label.localeCompare(b.label, 'es'))
    .slice(0, TOP_CONTACTS)

  return {
    weekStart: current.weekStart,
    weekEnd: current.weekEnd,
    meetings,
    count: meetings.length,
    meetingMs: current.meetingMs,
    freeMs: current.freeMs,
    days,
    busiestDayIndex: busiest,
    byCategory,
    byTag,
    byGroup,
    topContacts,
    previous: { count: previous.meetings.length, meetingMs: previous.meetingMs, freeMs: previous.freeMs },
    delta: {
      count: meetings.length - previous.meetings.length,
      meetingMs: current.meetingMs - previous.meetingMs,
      freeMs: current.freeMs - previous.freeMs,
    },
  }
}

// "+2", "−1", "="
export function formatCountDelta(n) {
  if (n === 0) return '='
  return n > 0 ? `+${n}` : `−${-n}`
}

// "+1 h 30 min", "−45 min", "="
export function formatMsDelta(ms) {
  const minutes = Math.round(ms / 60000)
  if (minutes === 0) return '='
  const abs = Math.abs(minutes)
  const h = Math.floor(abs / 60)
  const m = abs % 60
  const text = h === 0 ? `${m} min` : m === 0 ? `${h} h` : `${h} h ${m} min`
  return `${minutes > 0 ? '+' : '−'}${text}`
}

// "3,5 h" (horas con un decimal como mucho)
export function formatHours(ms) {
  const hours = Math.round((ms / 3600000) * 10) / 10
  return `${hours.toLocaleString('es-ES')} h`
}
