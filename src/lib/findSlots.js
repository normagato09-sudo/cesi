import { addDays, startOfDay, endOfDay, isSameDay } from 'date-fns'
import { expandEvents } from './recurrence'
import { getWorkingHours } from './availability'
import { slotIntervalsOn } from './weeklySchedule'

const SMALL_GAP_MS = 15 * 60 * 1000

function combine(day, hhmm) {
  const [h, m] = hhmm.split(':').map(Number)
  const d = new Date(day)
  d.setHours(h, m, 0, 0)
  return d
}

function isDayFullyUnavailable(occurrences, day) {
  return occurrences.some(
    (ev) => ev.isUnavailable && ev.allDay && isSameDay(ev.start, day) && ev.start <= day && ev.end >= day,
  )
}

function mergeIntervals(intervals) {
  const sorted = [...intervals].sort((a, b) => a.start - b.start)
  const merged = []
  for (const interval of sorted) {
    const last = merged[merged.length - 1]
    if (last && interval.start <= last.end) {
      last.end = new Date(Math.max(last.end, interval.end))
    } else {
      merged.push({ start: interval.start, end: interval.end })
    }
  }
  return merged
}

function freeGapsInWindow(busy, windowStart, windowEnd) {
  if (windowEnd <= windowStart) return []
  const gaps = []
  let cursor = windowStart
  for (const b of busy) {
    if (b.end <= cursor) continue
    if (b.start >= windowEnd) break
    if (b.start > cursor) gaps.push({ start: cursor, end: new Date(Math.min(b.start, windowEnd)) })
    cursor = new Date(Math.max(cursor, b.end))
    if (cursor >= windowEnd) break
  }
  if (cursor < windowEnd) gaps.push({ start: cursor, end: windowEnd })
  return gaps.filter((g) => g.end - g.start > 0)
}

function scoreCandidate(slotStart, slotEnd, gap, day) {
  let score = 0
  if (slotIntervalsOn(getWorkingHours(), day).some((w) => slotStart >= w.start && slotEnd <= w.end)) score += 3
  const leftoverAfter = gap.end - slotEnd
  if (leftoverAfter > 0 && leftoverAfter < SMALL_GAP_MS) score -= 2
  if (leftoverAfter === 0) score += 1
  return score
}

/**
 * Busca huecos libres de `durationMinutes` entre fromDate y toDate (incl.), dentro de la
 * franja horaria [minTime, maxTime) de cada día. No usa IA: la puntuación de "mejor hueco"
 * es una suma de reglas simples (dentro del horario habitual, evita dejar fragmentos < 15 min).
 */
export function findSlots({
  durationMinutes,
  fromDate,
  toDate,
  minTime,
  maxTime,
  events,
  bufferMinutes = 0,
  now = new Date(),
}) {
  const durationMs = durationMinutes * 60 * 1000
  const bufferMs = bufferMinutes * 60 * 1000
  const rangeStart = startOfDay(fromDate)
  const rangeEnd = endOfDay(toDate)
  const occurrences = expandEvents(events, rangeStart, rangeEnd)

  const candidates = []

  for (let day = startOfDay(fromDate); day <= rangeEnd; day = addDays(day, 1)) {
    if (isDayFullyUnavailable(occurrences, day)) continue

    let windowStart = combine(day, minTime)
    const windowEnd = combine(day, maxTime)
    if (isSameDay(day, now) && now > windowStart) windowStart = now
    if (windowEnd <= windowStart) continue

    // Cada bloque ocupado se amplía con el margen entre reuniones por delante y por detrás.
    const busyToday = mergeIntervals(
      occurrences
        .filter((ev) => !(ev.allDay && ev.isUnavailable))
        .map((ev) => ({ start: new Date(ev.start.getTime() - bufferMs), end: new Date(ev.end.getTime() + bufferMs) }))
        .filter((b) => b.start < windowEnd && b.end > windowStart),
    )

    const gaps = freeGapsInWindow(busyToday, windowStart, windowEnd)
    for (const gap of gaps) {
      if (gap.end - gap.start < durationMs) continue
      const slotStart = gap.start
      const slotEnd = new Date(slotStart.getTime() + durationMs)
      candidates.push({
        start: slotStart,
        end: slotEnd,
        score: scoreCandidate(slotStart, slotEnd, gap, day),
      })
    }
  }

  return candidates
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
