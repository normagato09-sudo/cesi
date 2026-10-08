import { addDays, startOfDay, endOfDay, startOfWeek } from 'date-fns'
import { expandEvents } from './recurrence'
import { getWorkingHours } from './availability'
import { slotIntervalsOn, timeToMinutes } from './weeklySchedule'
import { intersectIntervals, mergeIntervals, subtractIntervals } from './intervals'
import { blockingMessage, commonAvailability, hasAvailability } from './contactAvailability'
import { involvesAttendees, isNotAttending } from './notAttending'

const SMALL_GAP_MS = 15 * 60 * 1000
const ALIGN_MS = 15 * 60 * 1000

function atMinutes(day, minutes) {
  const d = new Date(day)
  d.setHours(0, minutes, 0, 0)
  return d
}

// ¿Hay una franja "No disponible" de todo el día que cubre `day` (00:00)? También las de varios
// días (vacaciones del 22/12 al 06/01): todos sus días, no solo el primero.
function isDayFullyUnavailable(occurrences, day) {
  return occurrences.some((ev) => ev.isUnavailable && ev.allDay && ev.start <= day && ev.end > day)
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
 * Es estricto: solo propone huecos dentro de las franjas de mi horario (`workingHours`, el mismo
 * todas las semanas), y además dentro de [minTime, maxTime) si se indican.
 * Bloquean: las franjas "No disponible" (las de todo el día, el día entero), mis reuniones (también
 * las de todo el día y las opciones provisionales) y `requests`, las solicitudes del enlace de
 * reservas pendientes ([{ start, end }]).
 * Devuelve un candidato por hueco libre, al principio del hueco (alineado a 15 min).
 *
 * Con `notAttending` ("Yo no asisto") no cuentan ni mi horario ni mis reuniones: solo la
 * disponibilidad de los participantes y las reuniones de mi calendario en las que participa
 * alguno de `attendees` ({ participantIds, guests }). Sin nadie con disponibilidad no hay huecos.
 * Sin `notAttending`, las reuniones que organizo sin asistir no ocupan mis huecos.
 */
export function findSlots({
  durationMinutes,
  fromDate,
  toDate,
  minTime = '00:00',
  maxTime = '24:00',
  events,
  workingHours = getWorkingHours(),
  requests = [],
  participants = [],
  notAttending = false,
  attendees = null,
  contacts = [],
  now = new Date(),
}) {
  const durationMs = durationMinutes * 60 * 1000
  const rangeStart = startOfDay(fromDate)
  const rangeEnd = endOfDay(toDate)
  const occurrences = expandEvents(events, addDays(rangeStart, -1), addDays(rangeEnd, 1))

  const blocking = notAttending
    ? occurrences.filter((ev) => involvesAttendees(ev, attendees, contacts))
    : occurrences.filter((ev) => !(ev.allDay && ev.isUnavailable) && !isNotAttending(ev))
  const requested = notAttending ? [] : requests.map((r) => ({ start: new Date(r.start), end: new Date(r.end) }))
  const busy = mergeIntervals([...blocking.map((ev) => ({ start: ev.start, end: ev.end })), ...requested])

  const candidates = []

  for (let day = startOfDay(fromDate); day <= rangeEnd; day = addDays(day, 1)) {
    if (!notAttending && isDayFullyUnavailable(occurrences, day)) continue

    const filter = [{ start: atMinutes(day, timeToMinutes(minTime)), end: atMinutes(day, timeToMinutes(maxTime)) }]
    const future = [{ start: now > day ? now : day, end: endOfDay(day) }]
    const mine = notAttending ? [{ start: day, end: addDays(day, 1) }] : slotIntervalsOn(workingHours, day)
    let windows = intersectIntervals(intersectIntervals(mine, filter), future)
    // Disponibilidad de los participantes, convertida desde su zona horaria a la mía.
    const theirs = commonAvailability(participants, day, addDays(day, 1))
    if (theirs) windows = intersectIntervals(windows, theirs)
    else if (notAttending) windows = []

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
  // "Yo no asisto": sin participantes no hay huecos, así que solo se puede culpar a alguien si
  // queda otro con disponibilidad.
  if (params.notAttending && withAvailability.length < 2) return { blockers: [], combined: false }
  if (!params.notAttending && findSlots({ ...params, participants: [] }).length === 0) return { blockers: [], combined: false }

  const label = periodLabel(params.fromDate, params.toDate, params.now || new Date())
  const blockers = []
  for (const contact of withAvailability) {
    const others = params.participants.filter((p) => p !== contact)
    if (findSlots({ ...params, participants: others }).length > 0) {
      blockers.push({
        contact,
        message: blockingMessage(contact, startOfDay(params.fromDate), endOfDay(params.toDate), { periodLabel: label, others: !!params.notAttending }),
      })
    }
  }
  return { blockers, combined: blockers.length === 0 }
}
