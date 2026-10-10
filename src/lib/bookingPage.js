import { callPublicRpc } from './publicRpc'
import { COUNTRIES } from './countries'
import { SPAIN_ZONE, dayShift, findZone, isValidTimeZone, localTimeZone, pad2, sameClock, wallTime } from './timezones'

// Página pública /reservar/<token>: quien tiene el enlace elige duración y hueco y pide la
// reunión. Solo llama a cesi_booking_get y cesi_booking_request (ver supabase/schema.sql), que
// solo dan los huecos libres: nada de mis reuniones, títulos ni participantes.
// Las horas se muestran en el país y la zona que elige quien reserva (por defecto, los de su
// navegador).

const TOKEN_RE = /^\/reservar\/([A-Za-z0-9_-]{32,100})\/?$/

export function tokenFromPath(pathname) {
  return TOKEN_RE.exec(pathname || '')?.[1] || null
}

export const FIELD_LIMITS = { name: 120, email: 200, phone: 40, reason: 500 }

const WEEKDAY = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado']
const MONTH = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre']

export function visitorTimeZone() {
  const tz = localTimeZone()
  return tz && isValidTimeZone(tz) ? tz : 'UTC'
}

// 'AAAA-MM-DD' del día de `date` en la zona `tz`.
export function dayKeyIn(date, tz) {
  const w = wallTime(date, tz)
  return `${w.year}-${pad2(w.month)}-${pad2(w.day)}`
}

export function timeIn(date, tz) {
  const w = wallTime(date, tz)
  return `${pad2(w.hour)}:${pad2(w.minute)}`
}

// "lunes 6 de octubre"
export function dayLabel(key) {
  const [y, m, d] = key.split('-').map(Number)
  const date = new Date(Date.UTC(y, m - 1, d, 12))
  return `${WEEKDAY[date.getUTCDay()]} ${d} de ${MONTH[m - 1]}`
}

function addDaysKey(key, n) {
  const [y, m, d] = key.split('-').map(Number)
  const date = new Date(Date.UTC(y, m - 1, d + n, 12))
  return `${date.getUTCFullYear()}-${pad2(date.getUTCMonth() + 1)}-${pad2(date.getUTCDate())}`
}

// Inicios posibles (cada `stepMinutes`, en punto) de una reunión de `minutes` dentro de los huecos.
export function slotStarts(free, minutes, stepMinutes) {
  const step = stepMinutes * 60000
  const length = minutes * 60000
  const starts = []
  for (const [from, to] of free || []) {
    const s = new Date(from).getTime()
    const e = new Date(to).getTime()
    for (let t = Math.ceil(s / step) * step; t + length <= e; t += step) starts.push(new Date(t))
  }
  return starts.sort((a, b) => a - b)
}

// Los días 'holiday' (festivos publicados antes de quitar ese tipo) salen como vacaciones.
export const DAY_OFF_TEXT = { vacation: 'No disponible: vacaciones', holiday: 'No disponible: vacaciones' }

/**
 * Días que se muestran: todos desde hoy (en la zona de quien reserva) hasta `until` ('AAAA-MM-DD',
 * último día que se puede reservar), cada uno con sus huecos para esa duración ([] si no hay) y,
 * si es de vacaciones, `off` ('vacation'; 'holiday' en lo publicado antes), que se muestra sin huecos.
 * [{ key, label, off, slots: [{ start: Date, time: 'HH:mm' }] }]
 */
export function bookingDays({ until = null, free = [], daysOff = [], minutes, stepMinutes = 30, tz, now = new Date() }) {
  const today = dayKeyIn(now, tz)
  const off = new Map(daysOff.map((d) => [d.date, d.kind]))
  const days = new Map()
  if (until) for (let key = today; key <= until; key = addDaysKey(key, 1)) days.set(key, [])
  for (const start of slotStarts(free, minutes, stepMinutes)) {
    const key = dayKeyIn(start, tz)
    if (!days.has(key)) days.set(key, [])
    days.get(key).push({ start, time: timeIn(start, tz) })
  }
  return [...days.entries()]
    .sort(([a], [b]) => (a < b ? -1 : 1))
    .map(([key, slots]) => {
      const kind = off.get(key) || null
      return { key, label: dayLabel(key), off: kind, slots: kind ? [] : slots }
    })
}

// País y zona por defecto de quien reserva: { country, timeZone } según la zona de su navegador.
// Si el navegador usa un nombre antiguo de la zona ("America/Buenos_Aires"), se busca la de la
// misma ciudad; si no se reconoce, España.
export function visitorZone(tz = visitorTimeZone()) {
  const found = findZone(tz)
  if (found) return { country: found.country.code, timeZone: tz }
  const city = tz.split('/').pop()
  for (const country of COUNTRIES) {
    const zone = country.zones.find((z) => z.id.split('/').pop() === city)
    if (zone) return { country: country.code, timeZone: zone.id }
  }
  return { country: 'ES', timeZone: SPAIN_ZONE }
}

// "México (Ciudad de México)", "Japón": el país y, si tiene varias zonas, cuál.
export function zoneName(tz) {
  const found = findZone(tz)
  if (!found) return tz
  return found.country.zones.length > 1 ? `${found.country.name} (${found.zone.place})` : found.country.name
}

// "Horas en hora de México (Ciudad de México)"
export function zoneText(tz) {
  return `Horas en hora de ${zoneName(tz)}`
}

/**
 * Cuándo es la reunión para quien reserva, con la hora de España entre paréntesis si es otra:
 * "martes 14 de octubre a las 10:00, hora de México (Ciudad de México) (18:00 en España)".
 */
export function whenText(date, tz) {
  const base = `${dayLabel(dayKeyIn(date, tz))} a las ${timeIn(date, tz)}, hora de ${zoneName(tz)}`
  if (sameClock(date, tz, SPAIN_ZONE)) return base
  const shift = dayShift(date, tz, SPAIN_ZONE)
  const day = shift === 0 ? '' : shift > 0 ? ' del día siguiente' : ' del día anterior'
  return `${base} (${timeIn(date, SPAIN_ZONE)}${day} en España)`
}

// "1 hora", "30 minutos", "1 hora y 30 minutos"
export function minutesLabel(minutes) {
  const h = Math.floor(minutes / 60)
  const m = minutes % 60
  if (!h) return `${m} minutos`
  const hours = h === 1 ? '1 hora' : `${h} horas`
  return m ? `${hours} y ${m} minutos` : hours
}

// Mensaje de error del formulario o null.
export function validateRequest({ name, email, phone, reason }) {
  if (!name.trim()) return 'Escribe tu nombre.'
  if (!email.trim() && !phone.trim()) return 'Escribe tu email o tu teléfono para poder avisarte.'
  if (email.trim() && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email.trim())) return 'El email no parece correcto.'
  if (phone.trim() && (!/^\+?[0-9 ()./-]+$/.test(phone.trim()) || phone.replace(/\D/g, '').length < 6)) return 'El teléfono no parece correcto.'
  if (!reason.trim()) return 'Cuéntame brevemente el motivo de la reunión.'
  return null
}

const ERROR_TEXT = {
  invalid_link: 'Este enlace ya no está activo.',
  invalid_slot: 'Ese hueco ya no se puede reservar. Elige otro.',
  slot_taken: 'Ese hueco se acaba de ocupar. Elige otro.',
  name_required: 'Escribe tu nombre.',
  contact_required: 'Escribe tu email o tu teléfono para poder avisarte.',
  invalid_email: 'El email no parece correcto.',
  invalid_phone: 'El teléfono no parece correcto.',
  reason_required: 'Cuéntame brevemente el motivo de la reunión.',
  too_many: 'Ya tienes varias solicitudes pendientes. Espera a que te responda.',
  invalid_data: 'Revisa los datos: alguno es demasiado largo.',
  place_required: 'Elige dónde quieres hacer la reunión.',
  invalid_place: 'Esa opción ya no está disponible. Elige otra.',
  unavailable: 'Las reservas no están disponibles ahora mismo.',
  network: 'No hay conexión. Comprueba tu conexión e inténtalo de nuevo.',
  server: 'No se ha podido enviar. Inténtalo de nuevo en un momento.',
}

export function errorText(code) {
  return ERROR_TEXT[code] || ERROR_TEXT.server
}

export class BookingError extends Error {
  constructor(code) {
    super(code)
    this.code = code
  }
}

const CODES = Object.keys(ERROR_TEXT)
const makeError = (code) => new BookingError(code)

export function loadBooking(token, config, fetchImpl) {
  return callPublicRpc('cesi_booking_get', { p_token: token }, { ...config, fetchImpl }, { codes: CODES, makeError })
}

// `place`: dónde quiere hacer la reunión (ver videoCall.js); solo se envía si el enlace ofrece
// opciones (versiones de Supabase anteriores no lo conocen).
export function sendBooking(token, { start, minutes, name, email, phone, reason, tz, place = null }, config, fetchImpl) {
  return callPublicRpc(
    'cesi_booking_request',
    {
      p_token: token,
      p_start: start.toISOString(),
      p_minutes: minutes,
      p_name: name.trim(),
      p_email: email.trim(),
      p_phone: phone.trim(),
      p_reason: reason.trim(),
      p_time_zone: tz,
      ...(place ? { p_place: place } : {}),
    },
    { ...config, fetchImpl },
    { codes: CODES, makeError },
  )
}
