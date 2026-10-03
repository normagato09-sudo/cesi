import { addDays, startOfDay, endOfDay, isSameDay, startOfWeek } from 'date-fns'
import { expandEvents } from './recurrence'
import { getWorkingHours } from './availability'
import { timeToMinutes } from './weeklySchedule'
import { scheduleIntervalsOn } from './weeklyAvailability'
import { intersectIntervals, mergeIntervals, subtractIntervals } from './intervals'
import { blockingMessage, commonAvailability, hasAvailability } from './contactAvailability'

const SMALL_GAP_MS = 15 * 60 * 1000
const ALIGN_MS = 15 * 60 * 1000

function atMinutes(day, minutes) {
  const d = new Date(day)
  d.setHours(0, minutes, 0, 0)
  return d
}

function isDayFullyUnavailable(occurrences, day) {
  return occurrences.some(
    (ev) => ev.isUnavailable && ev.allDay && isSameDay(ev.start, day) && ev.start <= day && ev.end >= day,
  )
}

// Redondea hacia arriba al siguiente cuarto de hora (10:07 → 10:15).
function alignUp(date) {
  return new Date(Math.ceil(date.getTime() / ALIGN_MS) * ALIGN_MS)
}

function scoreCandidate(slotEnd, gap) {
  let score = 0
  const leftoverAfter = gap.end - slotEnd
  if (leftoverAfter > 0 && leftoverAfter < SMALL_GAP_MS) score -= 2
  if (leftoverAfter === 0) score += 1
  return score
}

/**
 * Busca huecos libres de `durationMinutes` entre fromDate y toDate (incl.).
 * Es estricto: solo propone huecos dentro de las franjas del horario de cada día (el de su semana
 * declarada en `weeklyAvailability` o, si no está declarada, el habitual), y además
 * dentro de [minTime, maxTime) si se indican.
 * Devuelve un candidato por hueco libre, al principio del hueco (alineado a 15 min).
 */
export function findSlots({
  durationMinutes,
  fromDate,
  toDate,
  minTime = '00:00',
  maxTime = '24:00',
  events,
  workingHours = getWorkingHours(),
  weeklyAvailability = [],
  participants = [],
  now = new Date(),
}) {
  const durationMs = durationMinutes * 60 * 1000
  const rangeStart = startOfDay(fromDate)
  const rangeEnd = endOfDay(toDate)
  const occurrences = expandEvents(events, addDays(rangeStart, -1), addDays(rangeEnd, 1))

  const busy = mergeIntervals(
    occurrences.filter((ev) => !(ev.allDay && ev.isUnavailable)).map((ev) => ({ start: ev.start, end: ev.end })),
  )

  const candidates = []

  for (let day = startOfDay(fromDate); day <= rangeEnd; day = addDays(day, 1)) {
    if (isDayFullyUnavailable(occurrences, day)) continue

    const filter = [{ start: atMinutes(day, timeToMinutes(minTime)), end: atMinutes(day, timeToMinutes(maxTime)) }]
    const future = [{ start: now > day ? now : day, end: endOfDay(day) }]
    let windows = intersectIntervals(intersectIntervals(scheduleIntervalsOn(day, workingHours, weeklyAvailability), filter), future)
    // Disponibilidad de los participantes, convertida desde su zona horaria a la mía.
    const theirs = commonAvailability(participants, day, addDays(day, 1))
    if (theirs) windows = intersectIntervals(windows, theirs)

    for (const gap of subtractIntervals(windows, busy)) {
      const slotStart = alignUp(gap.start)
      const slotEnd = new Date(slotStart.getTime() + durationMs)
      if (slotEnd > gap.end) continue
      candidates.push({ start: slotStart, end: slotEnd, score: scoreCandidate(slotEnd, gap) })
    }
  }

  return candidates.sort((a, b) => a.start - b.start)
}

export function findFirstSlot(params) {
  const candidates = findSlots(params)
  return candidates[0] || null
}

export function findBestSlot(params) {
  const candidates = findSlots(params)
  if (candidates.length === 0) return null
  return [...candidates].sort((a, b) => b.score - a.score || a.start - b.start)[0]
}

export function findMultipleSlots(params, limit = 5) {
  const candidates = findSlots(params)
  const top = [...candidates].sort((a, b) => b.score - a.score || a.start - b.start).slice(0, limit)
  return top.sort((a, b) => a.start - b.start)
}

function periodLabel(fromDate, toDate, now) {
  const from = startOfDay(fromDate)
  const to = startOfDay(toDate)
  if (from.getTime() === to.getTime()) return 'ese día'
  const weekStart = startOfWeek(now, { weekStartsOn: 1 })
  const weekEnd = endOfDay(addDays(weekStart, 6))
  if (from >= startOfDay(weekStart) && to <= weekEnd) return 'esta semana'
  return 'en esas fechas'
}

/**
 * Cuando no hay huecos, averigua qué participante lo impide: aquel sin cuya disponibilidad sí
 * habría huecos. Devuelve { blockers: [{ contact, message }], combined } donde `combined` indica
 * que ninguno lo impide por sí solo pero juntos no coinciden nunca.
 * Si sin participantes tampoco hay huecos, el problema es mi horario: blockers vacío.
 */
export function explainNoSlots(params) {
  const withAvailability = (params.participants || []).filter(hasAvailability)
  if (withAvailability.length === 0) return { blockers: [], combined: false }
  if (findSlots({ ...params, participants: [] }).length === 0) return { blockers: [], combined: false }

  const label = periodLabel(params.fromDate, params.toDate, params.now || new Date())
  const blockers = []
  for (const contact of withAvailability) {
    const others = params.participants.filter((p) => p !== contact)
    if (findSlots({ ...params, participants: others }).length > 0) {
      blockers.push({
        contact,
        message: blockingMessage(contact, startOfDay(params.fromDate), endOfDay(params.toDate), { periodLabel: label }),
      })
    }
  }
  return { blockers, combined: blockers.length === 0 }
}
