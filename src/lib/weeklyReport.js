import { addDays, addMonths, addWeeks, differenceInCalendarDays, getDay, startOfMonth, startOfWeek } from 'date-fns'
import { expandEvents } from './recurrence'
import { mergeIntervals, subtractIntervals } from './intervals'
import { scheduleIntervalsOn } from './weeklyAvailability'
import { participantsOf } from './contacts'
import { isRealMeeting } from './notes'
import { normalizeTag, tagKey } from './tags'
import { NO_PROJECT, NO_PROJECT_LABEL, projectOf } from './projects'
import { isTeamMember } from './team'

// Resumen (sección "Resumen") de una semana o de cualquier periodo, comparado con el anterior.
// Semanas de lunes a domingo. Solo cuentan las reuniones: no los bloques "No disponible" ni las
// opciones provisionales.

export const TOP_CONTACTS = 5
export const NO_DEPARTMENT = '__none__'
export const NO_DEPARTMENT_LABEL = 'Sin miembros del equipo'
export const NO_AREA_LABEL = 'Sin departamento'
// Franjas por hora que se muestran siempre (de 7:00 a 21:00); fuera de ellas, solo si hay reuniones.
export const DEFAULT_FIRST_HOUR = 7
export const DEFAULT_LAST_HOUR = 21
const HOUR_MS = 3600000

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

function meetingsIn(rawEvents, start, end) {
  return expandEvents(rawEvents, start, end)
}

// Datos básicos de un periodo [start, end): reuniones, tiempo en reuniones (en total y por día) y
// tiempo libre dentro del horario.
function periodTotals(rawEvents, start, end, workingHours, weeklyAvailability) {
  const occurrences = meetingsIn(rawEvents, start, end)
  const meetings = occurrences.filter(isRealMeeting).sort((a, b) => a.start - b.start)

  const days = Array.from({ length: differenceInCalendarDays(end, start) }, (_, i) => {
    const date = addDays(start, i)
    const next = addDays(start, i + 1)
    const ofDay = meetings.filter((m) => m.start < next && m.end > date)
    return { date, meetings: ofDay.length, ms: meetingTime(ofDay, date, next), ofDay }
  })

  // Libre = mi horario (el declarado para esa semana o, si no, el habitual) menos las reuniones y
  // los bloques "No disponible" (las opciones provisionales no ocupan: aún no están confirmadas).
  const busy = occurrences.filter((ev) => !ev.provisional).map((ev) => ({ start: ev.start, end: ev.end }))
  const windows = days.flatMap((d) => scheduleIntervalsOn(d.date, workingHours, weeklyAvailability))
  const freeMs = totalMs(subtractIntervals(windows, busy))

  return { start, end, meetings, days, meetingMs: meetingTime(meetings, start, end), freeMs }
}

// Horas por día de la semana (lunes a domingo), sumando todos los días del periodo.
function weekdayTotals(days) {
  const out = Array.from({ length: 7 }, (_, i) => ({ weekday: i, ms: 0, meetings: 0, days: 0 }))
  for (const d of days) {
    const row = out[(getDay(d.date) + 6) % 7]
    row.ms += d.ms
    row.meetings += d.meetings
    row.days += 1
  }
  return out
}

// Horas en reuniones dentro de cada franja de una hora (0–23), sumando todos los días.
// Se muestran de 7 a 21 h, ampliando si hay reuniones antes o después.
function hourTotals(days) {
  const ms = Array(24).fill(0)
  const meetings = Array(24).fill(0)
  for (const d of days) {
    if (d.ofDay.length === 0) continue
    const merged = mergeIntervals(d.ofDay.map((m) => ({ start: m.start, end: m.end })))
    for (let h = 0; h < 24; h++) {
      const from = new Date(d.date)
      from.setHours(h, 0, 0, 0)
      const to = new Date(from.getTime() + HOUR_MS)
      ms[h] += totalMs(clipTo(merged, from, to))
      meetings[h] += d.ofDay.filter((m) => m.start < to && m.end > from).length
    }
  }
  const used = ms.map((v, h) => (v > 0 ? h : null)).filter((h) => h !== null)
  const first = Math.min(DEFAULT_FIRST_HOUR, ...used)
  const last = Math.max(DEFAULT_LAST_HOUR - 1, ...used)
  return Array.from({ length: last - first + 1 }, (_, i) => ({ hour: first + i, ms: ms[first + i], meetings: meetings[first + i] }))
}

// Índice del elemento con más tiempo (null si todos están a 0).
function busiestIndex(rows) {
  return rows.reduce((best, r, i) => (r.ms > 0 && (best === null || r.ms > rows[best].ms) ? i : best), null)
}

/**
 * Resumen del periodo [start, end), comparado con [prevStart, prevEnd) (el anterior: la semana,
 * el mes o los meses anteriores, o los mismos días justo antes).
 */
export function computeReport(
  rawEvents,
  { start, end, prevStart, prevEnd, workingHours, weeklyAvailability = [], contacts = [], groups = [], projects = [] },
) {
  const current = periodTotals(rawEvents, start, end, workingHours, weeklyAvailability)
  const previous = periodTotals(rawEvents, prevStart, prevEnd, workingHours, weeklyAvailability)
  const { meetings } = current
  const days = current.days.map((d) => ({ date: d.date, meetings: d.meetings, ms: d.ms }))

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

  // Por proyecto; las reuniones sin proyecto (o de uno borrado) van en "Sin proyecto".
  const byProject = tally(
    meetings.map((m) => {
      const project = projectOf(m, projects)
      return project
        ? { key: project.id, label: project.name, ms: durationOf(m), extra: { color: project.color } }
        : { key: NO_PROJECT, label: NO_PROJECT_LABEL, ms: durationOf(m), extra: { color: null } }
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

  // Por departamento de los miembros del equipo que participan: una reunión con varios
  // departamentos cuenta en cada uno; sin nadie del equipo, en "Sin miembros del equipo".
  const byDepartment = tally(
    people.flatMap(({ meeting, contacts: list }) => {
      const members = list.filter(isTeamMember)
      if (members.length === 0) return [{ key: NO_DEPARTMENT, label: NO_DEPARTMENT_LABEL, ms: durationOf(meeting) }]
      const areas = [...new Set(members.map((c) => (c.teamProfile.area || '').trim()))]
      return areas.map((area) => ({ key: area || NO_AREA_LABEL, label: area || NO_AREA_LABEL, ms: durationOf(meeting) }))
    }),
  )

  // Todas las personas (contactos) con las que me he reunido: más reuniones primero.
  const byPerson = tally(
    people.flatMap(({ meeting, contacts: list }) =>
      list.map((c) => ({ key: c.id, label: c.name, ms: durationOf(meeting), extra: { contact: c } })),
    ),
  ).sort((a, b) => b.count - a.count || b.ms - a.ms || a.label.localeCompare(b.label, 'es'))

  const byWeekday = weekdayTotals(current.days)
  const byHour = hourTotals(current.days)

  return {
    start,
    end,
    // Nombres de siempre (el resumen era solo semanal).
    weekStart: start,
    weekEnd: end,
    meetings,
    count: meetings.length,
    meetingMs: current.meetingMs,
    freeMs: current.freeMs,
    days,
    busiestDayIndex: busiestIndex(days),
    byCategory,
    byTag,
    byGroup,
    byProject,
    byDepartment,
    byPerson,
    topContacts: byPerson.slice(0, TOP_CONTACTS),
    byWeekday,
    busiestWeekdayIndex: busiestIndex(byWeekday),
    byHour,
    busiestHourIndex: busiestIndex(byHour),
    previous: { count: previous.meetings.length, meetingMs: previous.meetingMs, freeMs: previous.freeMs },
    delta: {
      count: meetings.length - previous.meetings.length,
      meetingMs: current.meetingMs - previous.meetingMs,
      freeMs: current.freeMs - previous.freeMs,
    },
  }
}

/**
 * Resumen de la semana que empieza en `weekStart` (lunes), comparado con la anterior.
 */
export function computeWeeklyReport(rawEvents, { weekStart, ...options }) {
  return computeReport(rawEvents, {
    ...options,
    start: weekStart,
    end: addDays(weekStart, 7),
    prevStart: addWeeks(weekStart, -1),
    prevEnd: weekStart,
  })
}

/**
 * Evolución: horas y número de reuniones de las últimas `count` semanas (unit 'week') o meses
 * ('month'), terminando en la que contiene `until` (incluida). [{ start, end, ms, meetings }]
 */
export function meetingEvolution(rawEvents, { unit, until, count = 12 }) {
  const last = unit === 'month' ? startOfMonth(until) : weekStartOf(until)
  const step = unit === 'month' ? addMonths : addWeeks
  const first = step(last, -(count - 1))
  const meetings = meetingsIn(rawEvents, first, step(last, 1)).filter(isRealMeeting)
  return Array.from({ length: count }, (_, i) => {
    const start = step(first, i)
    const end = step(first, i + 1)
    const inside = meetings.filter((m) => m.start < end && m.end > start)
    return { start, end, ms: meetingTime(inside, start, end), meetings: inside.filter((m) => m.start >= start).length }
  })
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
