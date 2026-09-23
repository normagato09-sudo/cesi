import { addDays, startOfDay, endOfDay, isSameDay } from 'date-fns'
import { expandEvents } from './recurrence'
import { getWorkingHours } from './availability'
import { slotIntervalsOn, timeToMinutes } from './weeklySchedule'
import { intersectIntervals, mergeIntervals, subtractIntervals } from './intervals'
import { countOfTypeOnDay, ruleWindowsOn, rulesForType } from './rules'

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

// Reglas del tipo de reunión cuya duración máxima es menor que la buscada.
export function rulesExceededByDuration(rules, meetingType, durationMinutes) {
  return rulesForType(rules, meetingType).filter((r) => r.maxDurationMinutes && durationMinutes > r.maxDurationMinutes)
}

/**
 * Busca huecos libres de `durationMinutes` entre fromDate y toDate (incl.).
 * Es estricto: solo propone huecos dentro de las franjas del horario habitual, y además
 * dentro de [minTime, maxTime) si se indican. Cada bloque ocupado se amplía con `bufferMinutes`.
 * Si se indica `meetingType` ({ category, tags }), se aplican también las reglas activas de ese
 * tipo: días y franja permitidos, duración máxima y máximo de reuniones por día.
 * Devuelve un candidato por hueco libre, al principio del hueco (alineado a 15 min), con las
 * reglas aplicadas en `rules`.
 */
export function findSlots({
  durationMinutes,
  fromDate,
  toDate,
  minTime = '00:00',
  maxTime = '24:00',
  events,
  workingHours = getWorkingHours(),
  bufferMinutes = 0,
  rules = [],
  meetingType = null,
  now = new Date(),
}) {
  const applicable = meetingType ? rulesForType(rules, meetingType) : []
  if (rulesExceededByDuration(applicable, meetingType, durationMinutes).length > 0) return []

  const durationMs = durationMinutes * 60 * 1000
  const bufferMs = bufferMinutes * 60 * 1000
  const rangeStart = startOfDay(fromDate)
  const rangeEnd = endOfDay(toDate)
  const occurrences = expandEvents(events, addDays(rangeStart, -1), addDays(rangeEnd, 1))

  // Cada bloque ocupado se amplía con el margen entre reuniones por delante y por detrás.
  const busy = mergeIntervals(
    occurrences
      .filter((ev) => !(ev.allDay && ev.isUnavailable))
      .map((ev) => ({ start: new Date(ev.start.getTime() - bufferMs), end: new Date(ev.end.getTime() + bufferMs) })),
  )

  const candidates = []

  for (let day = startOfDay(fromDate); day <= rangeEnd; day = addDays(day, 1)) {
    if (isDayFullyUnavailable(occurrences, day)) continue

    // Cuántas reuniones más de este tipo caben hoy según las reglas con máximo por día.
    let remainingToday = Infinity
    for (const rule of applicable) {
      if (rule.maxPerDay) remainingToday = Math.min(remainingToday, rule.maxPerDay - countOfTypeOnDay(rule, occurrences, day))
    }
    if (remainingToday <= 0) continue

    const filter = [{ start: atMinutes(day, timeToMinutes(minTime)), end: atMinutes(day, timeToMinutes(maxTime)) }]
    const future = [{ start: now > day ? now : day, end: endOfDay(day) }]
    let windows = intersectIntervals(intersectIntervals(slotIntervalsOn(workingHours, day), filter), future)
    for (const rule of applicable) windows = intersectIntervals(windows, ruleWindowsOn(rule, day))

    let addedToday = 0
    for (const gap of subtractIntervals(windows, busy)) {
      if (addedToday >= remainingToday) break
      const slotStart = alignUp(gap.start)
      const slotEnd = new Date(slotStart.getTime() + durationMs)
      if (slotEnd > gap.end) continue
      candidates.push({ start: slotStart, end: slotEnd, score: scoreCandidate(slotEnd, gap), rules: applicable })
      addedToday++
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
