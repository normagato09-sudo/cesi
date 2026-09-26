import { WEEKDAY_DISPLAY_ORDER, normalizeWeek, timeToMinutes } from './weeklySchedule'
import {
  SPAIN_ZONE,
  wallTime,
  zonePlace,
  zonedDateTime,
} from './timezones'
import { intersectIntervals, mergeIntervals } from './intervals'

// Disponibilidad habitual de un contacto: mismo formato que mi horario (varias franjas por día),
// introducida en la zona horaria del contacto o, si no tiene, en hora de España.

export function contactZone(contact) {
  return contact.timeZone || SPAIN_ZONE
}

export function contactWeek(contact) {
  return contact.availability ? normalizeWeek(contact.availability, null) : null
}

export function hasAvailability(contact) {
  const week = contactWeek(contact)
  return !!week && week.some((d) => d.enabled && d.slots.length > 0)
}

const DAY_MS = 86400000

// Recorre las fechas de calendario (en la zona `tz`) que tocan el intervalo [from, to).
function zoneDatesBetween(from, to, tz) {
  const first = wallTime(from, tz)
  const last = wallTime(new Date(to.getTime() - 1), tz)
  const out = []
  for (let t = Date.UTC(first.year, first.month - 1, first.day); t <= Date.UTC(last.year, last.month - 1, last.day); t += DAY_MS) {
    const d = new Date(t)
    out.push({ year: d.getUTCFullYear(), month: d.getUTCMonth() + 1, day: d.getUTCDate(), weekday: d.getUTCDay() })
  }
  return out
}

function instant(date, minutes, tz) {
  return zonedDateTime({ ...date, hour: Math.floor(minutes / 60), minute: minutes % 60 }, tz).date
}

/**
 * Franjas en las que el contacto está disponible dentro de [from, to), como instantes
 * (Date) listos para compararlos con mi calendario. Convierte cada franja desde la zona del
 * contacto con Intl, así que respeta el horario de verano de los dos países.
 * Devuelve null si el contacto no tiene disponibilidad (= no restringe).
 */
export function availabilityIntervals(contact, from, to) {
  const week = contactWeek(contact)
  if (!week || !hasAvailability(contact)) return null
  const tz = contactZone(contact)
  const intervals = []
  for (const date of zoneDatesBetween(from, to, tz)) {
    const entry = week.find((w) => w.day === date.weekday)
    if (!entry?.enabled) continue
    for (const slot of entry.slots) {
      intervals.push({ start: instant(date, timeToMinutes(slot.start), tz), end: instant(date, timeToMinutes(slot.end), tz) })
    }
  }
  return intersectIntervals(mergeIntervals(intervals), [{ start: from, end: to }])
}

// Intersección de la disponibilidad de todos los contactos que la tienen (null si ninguno la tiene).
export function commonAvailability(contacts, from, to) {
  let common = null
  for (const contact of contacts) {
    const own = availabilityIntervals(contact, from, to)
    if (!own) continue
    common = common ? intersectIntervals(common, own) : own
  }
  return common
}

// ---------------------------------------------------------------------------
// Textos
// ---------------------------------------------------------------------------

const DAY_SHORT = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb']
const DAY_PLURAL = ['los domingos', 'los lunes', 'los martes', 'los miércoles', 'los jueves', 'los viernes', 'los sábados']

// Líneas para la ficha: ["Lun: 09:00–14:00, 16:00–19:00", ...]
export function availabilityLines(contact) {
  const week = contactWeek(contact)
  if (!week) return []
  return WEEKDAY_DISPLAY_ORDER.map((d) => week.find((w) => w.day === d))
    .filter((e) => e.enabled && e.slots.length)
    .map((e) => `${DAY_SHORT[e.day]}: ${e.slots.map((s) => `${s.start}–${s.end}`).join(', ')}`)
}

export function availabilityZoneNote(contact) {
  return contact.timeZone ? `hora de ${zonePlace(contact.timeZone)}` : 'hora de España'
}

function joinList(parts) {
  return parts.length > 1 ? `${parts.slice(0, -1).join(', ')} y ${parts[parts.length - 1]}` : parts[0]
}

const MIDDAY_MINUTES = 14 * 60

// En mi hora: ¿toda su disponibilidad es de mañana, de tarde o solo ciertos días?
function describeWindows(intervals, contact) {
  const minutesOf = (d) => d.getHours() * 60 + d.getMinutes()
  const allAfternoon = intervals.every((i) => minutesOf(i.start) >= MIDDAY_MINUTES)
  const allMorning = intervals.every((i) => minutesOf(i.end) <= MIDDAY_MINUTES && i.end.getDate() === i.start.getDate())
  if (allAfternoon) return { can: 'por las tardes', mine: 'por la tarde' }
  if (allMorning) return { can: 'por las mañanas', mine: 'por la mañana' }
  const week = contactWeek(contact)
  const days = WEEKDAY_DISPLAY_ORDER.filter((d) => week.find((w) => w.day === d)?.enabled)
  if (days.length > 0 && days.length < 7) return { can: joinList(days.map((d) => DAY_PLURAL[d])), mine: 'en esos momentos' }
  return { can: 'en su horario habitual', mine: 'en esas franjas' }
}

// "Ana solo puede por las tardes y tú no tienes huecos libres por la tarde esta semana"
export function blockingMessage(contact, from, to, { periodLabel }) {
  const intervals = availabilityIntervals(contact, from, to) || []
  const name = contact.name.split(' ')[0] || contact.name
  if (intervals.length === 0) return `${name} no tiene disponibilidad ${periodLabel}.`
  const { can, mine } = describeWindows(intervals, contact)
  return `${name} solo puede ${can} y tú no tienes huecos libres ${mine} ${periodLabel}.`
}
