import { availabilityIntervals, availabilityLines, availabilityZoneNote, contactWeek, contactZone, hasAvailability } from './contactAvailability'
import { participantsOf } from './contacts'
import { SPAIN_ZONE, countryFlag, dayShift, findCountry, findZone, formatTimeInZone, localTimeZone, sameClock, wallTime, zonePlace } from './timezones'

// Cómo se muestra cada participante de una reunión (componente Participant):
//   - si puede según su disponibilidad habitual (convertida desde su zona horaria);
//   - bandera, país y hora local de la reunión;
//   - aviso si la hora le cae fuera de lo razonable y no tiene disponibilidad apuntada.

export const STATUS = { CAN: 'can', CANNOT: 'cannot', UNKNOWN: 'unknown', ANY: 'any' }

export const STATUS_LABELS = {
  can: 'Puede',
  cannot: 'No puede',
  unknown: 'Sin disponibilidad apuntada',
  any: 'Tiene disponibilidad apuntada',
}

const DAY_PLURAL = ['los domingos', 'los lunes', 'los martes', 'los miércoles', 'los jueves', 'los viernes', 'los sábados']
const DAY_NAME = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado']
const MIDDAY = '14:00'

// Motivo corto para los avisos: "jueves solo por la mañana", "sábado no tiene disponibilidad".
function shortReason(weekday, entry, zoneNote) {
  const day = DAY_NAME[weekday]
  if (!entry?.enabled || entry.slots.length === 0) return `${day} no tiene disponibilidad`
  if (entry.slots.every((s) => s.end <= MIDDAY)) return `${day} solo por la mañana`
  if (entry.slots.every((s) => s.start >= MIDDAY)) return `${day} solo por la tarde`
  return `${day} solo ${slotsText(entry.slots)}${zoneNote ? `, ${zoneNote.trim().slice(1, -1)}` : ''}`
}

// '09:00' → '9:00'
const shortTime = (hhmm) => hhmm.replace(/^0(\d)/, '$1')

function slotsText(slots) {
  const parts = slots.map((s) => `de ${shortTime(s.start)} a ${shortTime(s.end)}`)
  return parts.length > 1 ? `${parts.slice(0, -1).join(', ')} y ${parts[parts.length - 1]}` : parts[0]
}

// ¿Cubren las franjas todo [start, end)? (ya vienen unidas y recortadas a ese intervalo)
function covers(intervals, start, end) {
  return intervals.some((i) => i.start <= start && i.end >= end)
}

/**
 * Estado de un contacto (o de un invitado, contact = null) para una reunión [start, end):
 * { status: 'can' | 'cannot' | 'unknown' | 'any', message }.
 * Sin hora (p. ej. al elegir participantes antes de buscar hueco): 'any' si tiene disponibilidad
 * apuntada (el mensaje la resume) o 'unknown' si no.
 */
export function availabilityStatus(contact, start, end, myZone = localTimeZone()) {
  if (!contact || !hasAvailability(contact)) return { status: STATUS.UNKNOWN, message: STATUS_LABELS.unknown }
  if (!start || !end) {
    return {
      status: STATUS.ANY,
      message: `Disponibilidad habitual (${availabilityZoneNote(contact)}): ${availabilityLines(contact).join('; ')}`,
    }
  }
  const from = new Date(start)
  const to = new Date(end)
  const tz = contactZone(contact)
  const ok = covers(availabilityIntervals(contact, from, to) || [], from, to)
  // El día de la semana y las franjas, en su hora.
  const weekday = wallTime(from, tz).weekday
  const entry = contactWeek(contact).find((d) => d.day === weekday)
  const days = DAY_PLURAL[weekday]
  const zoneNote = sameClock(from, tz, myZone) ? '' : ` (hora de ${zonePlace(tz)})`
  if (ok) return { status: STATUS.CAN, message: `Puede: ${days} ${slotsText(entry.slots)}${zoneNote}` }
  const reason = shortReason(weekday, entry, zoneNote)
  if (!entry?.enabled || entry.slots.length === 0) {
    return { status: STATUS.CANNOT, message: `No puede: ${days} no tiene disponibilidad`, reason }
  }
  return { status: STATUS.CANNOT, message: `No puede: ${days} solo ${slotsText(entry.slots)}${zoneNote}`, reason }
}

/**
 * Bandera, país (con la zona si el país tiene varias) y hora local de la reunión:
 * "🇪🇸 España · 18:00", "🇪🇸 España (Canarias) · 17:00",
 * "🇲🇽 México (Ciudad de México) · 10:00 (día siguiente)". Sin hora, solo el lugar.
 */
export function localTimeInfo(contact, start, myZone = localTimeZone()) {
  const tz = contactZone(contact)
  const code = contact.country || findZone(tz)?.country.code || null
  const country = findCountry(code)
  let place = country?.name || zonePlace(tz)
  if (country && country.zones.length > 1 && !(code === 'ES' && tz === SPAIN_ZONE)) {
    const zone = country.zones.find((z) => z.id === tz)
    place += ` (${zone ? zone.place : zonePlace(tz)})`
  }
  const flag = countryFlag(code)
  const where = flag ? `${flag} ${place}` : place
  if (!start) return { flag, place, time: null, shift: 0, text: where }
  const date = new Date(start)
  const time = formatTimeInZone(date, tz)
  const shift = dayShift(date, myZone, tz)
  const note = shift > 0 ? ' (día siguiente)' : shift < 0 ? ' (día anterior)' : ''
  return { flag, place, time, shift, text: `${where} · ${time}${note}` }
}

const REASONABLE_START = 8 * 60
const REASONABLE_END = 20 * 60

/**
 * Aviso de hora poco razonable para quien no tiene disponibilidad apuntada: si la reunión cae
 * fuera de 08:00–20:00 en su hora local ("Para Ana serían las 02:00"). null si no hace falta.
 */
export function unreasonableTimeWarning(contact, start, end) {
  if (!contact || !start || !end || hasAvailability(contact)) return null
  const tz = contactZone(contact)
  const s = wallTime(new Date(start), tz)
  const e = wallTime(new Date(end), tz)
  const sMin = s.hour * 60 + s.minute
  const eMin = e.hour * 60 + e.minute
  const sameDay = s.year === e.year && s.month === e.month && s.day === e.day
  if (sMin >= REASONABLE_START && sameDay && eMin <= REASONABLE_END) return null
  const name = contact.name.split(' ')[0] || contact.name
  return `Para ${name} ${s.hour === 1 ? 'sería la' : 'serían las'} ${formatTimeInZone(new Date(start), tz)}`
}

/**
 * Participantes de una reunión, propuesta u opción (con participantIds/guests o nombres antiguos)
 * para [start, end): [{ key, contact, guest, name, status, message }].
 */
export function participantEntries(item, contacts, start, end, myZone) {
  const { contacts: people, guests } = participantsOf(item, contacts)
  return [
    ...people.map((contact) => ({ key: contact.id, contact, guest: null, name: contact.name, ...availabilityStatus(contact, start, end, myZone) })),
    ...guests.map((guest) => ({ key: `guest:${guest}`, contact: null, guest, name: guest, ...availabilityStatus(null, start, end, myZone) })),
  ]
}

function plural(n, one, many) {
  return `${n} ${n === 1 ? one : many}`
}

// "8 pueden · 1 no puede · 2 sin disponibilidad" (sin las partes a cero).
export function statusCountsText(entries) {
  const count = (status) => entries.filter((e) => e.status === status).length
  const parts = []
  const can = count(STATUS.CAN)
  const cannot = count(STATUS.CANNOT)
  const unknown = count(STATUS.UNKNOWN)
  const any = count(STATUS.ANY)
  if (can) parts.push(plural(can, 'puede', 'pueden'))
  if (cannot) parts.push(plural(cannot, 'no puede', 'no pueden'))
  if (any) parts.push(plural(any, 'con disponibilidad', 'con disponibilidad'))
  if (unknown) parts.push(`${unknown} sin disponibilidad`)
  return parts.join(' · ')
}
