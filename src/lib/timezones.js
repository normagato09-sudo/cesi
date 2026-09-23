import { COUNTRIES } from './countries'

// Todos los cálculos usan Intl.DateTimeFormat con zonas IANA (sin desfases fijos), así el
// horario de verano de cada país es siempre el correcto para la fecha concreta.

export const SPAIN_ZONE = 'Europe/Madrid'

const ZONE_INDEX = new Map()
for (const country of COUNTRIES) {
  for (const zone of country.zones) {
    if (!ZONE_INDEX.has(zone.id)) ZONE_INDEX.set(zone.id, { country, zone })
  }
}

export function findZone(zoneId) {
  return ZONE_INDEX.get(zoneId) || null
}

export function findCountry(code) {
  return COUNTRIES.find((c) => c.code === code) || null
}

// Etiqueta completa ("Estados Unidos: Nueva York", "Japón").
export function zoneLabel(zoneId) {
  return findZone(zoneId)?.zone.label || zoneId
}

// Lugar corto para frases como "18:00 en Ciudad de México" o "18:00 en Japón".
export function zonePlace(zoneId) {
  const found = findZone(zoneId)
  if (!found) return zoneId
  const { country, zone } = found
  if (country.code === 'ES') return zone.id === SPAIN_ZONE ? 'España' : 'Canarias'
  return zone.place
}

export function isValidTimeZone(zoneId) {
  try {
    new Intl.DateTimeFormat('es', { timeZone: zoneId })
    return true
  } catch {
    return false
  }
}

const partsFormatters = new Map()
function partsFormatter(timeZone) {
  if (!partsFormatters.has(timeZone)) {
    partsFormatters.set(
      timeZone,
      new Intl.DateTimeFormat('en-US', {
        timeZone,
        hourCycle: 'h23',
        year: 'numeric',
        month: 'numeric',
        day: 'numeric',
        hour: 'numeric',
        minute: 'numeric',
        second: 'numeric',
        weekday: 'short',
      }),
    )
  }
  return partsFormatters.get(timeZone)
}

const WEEKDAYS = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 }

// Fecha y hora "de reloj" de un instante en una zona.
export function wallTime(date, timeZone) {
  const parts = {}
  for (const p of partsFormatter(timeZone).formatToParts(date)) parts[p.type] = p.value
  return {
    year: Number(parts.year),
    month: Number(parts.month),
    day: Number(parts.day),
    hour: Number(parts.hour),
    minute: Number(parts.minute),
    second: Number(parts.second),
    weekday: WEEKDAYS[parts.weekday],
  }
}

// Minutos que la zona va por delante de UTC en ese instante (Madrid en verano: 120).
export function zoneOffsetMinutes(date, timeZone) {
  const w = wallTime(date, timeZone)
  const asUtc = Date.UTC(w.year, w.month - 1, w.day, w.hour, w.minute, w.second)
  return Math.round((asUtc - Math.floor(date.getTime() / 1000) * 1000) / 60000)
}

// Instante que corresponde a una fecha y hora de reloj en una zona.
// `exists` es false si esa hora no existe ese día (salto del cambio de hora).
export function zonedDateTime({ year, month, day, hour, minute }, timeZone) {
  const target = Date.UTC(year, month - 1, day, hour, minute)
  let guess = target
  for (let i = 0; i < 3; i++) {
    const next = target - zoneOffsetMinutes(new Date(guess), timeZone) * 60000
    if (next === guess) break
    guess = next
  }
  const date = new Date(guess)
  const w = wallTime(date, timeZone)
  const exists = w.year === year && w.month === month && w.day === day && w.hour === hour && w.minute === minute
  return { date, exists }
}

// "+6 h", "−9 h", "+5 h 30 min", "0 h"
export function formatOffsetDiff(minutes) {
  if (minutes === 0) return '0 h'
  const sign = minutes > 0 ? '+' : '−'
  const abs = Math.abs(minutes)
  const h = Math.floor(abs / 60)
  const m = abs % 60
  if (m === 0) return `${sign}${h} h`
  if (h === 0) return `${sign}${m} min`
  return `${sign}${h} h ${m} min`
}

function dayNumber({ year, month, day }) {
  return Date.UTC(year, month - 1, day) / 86400000
}

// -1 si en `toZone` es el día anterior, 1 si es el siguiente, 0 si es el mismo día.
export function dayShift(date, fromZone, toZone) {
  return dayNumber(wallTime(date, toZone)) - dayNumber(wallTime(date, fromZone))
}

export function formatInZone(date, timeZone, options) {
  return new Intl.DateTimeFormat('es', { ...options, timeZone }).format(date)
}

export function formatTimeInZone(date, timeZone) {
  const w = wallTime(date, timeZone)
  return `${pad2(w.hour)}:${pad2(w.minute)}`
}

export function pad2(n) {
  return String(n).padStart(2, '0')
}

// Convierte una fecha ('yyyy-MM-dd') y hora ('HH:mm') de reloj de `fromZone` a `toZone`.
export function convertWallTime({ date, time, fromZone, toZone }) {
  const [year, month, day] = date.split('-').map(Number)
  const [hour, minute] = time.split(':').map(Number)
  const { date: instant, exists } = zonedDateTime({ year, month, day, hour, minute }, fromZone)
  const to = wallTime(instant, toZone)
  return {
    instant,
    exists,
    to,
    time: `${pad2(to.hour)}:${pad2(to.minute)}`,
    diffMinutes: zoneOffsetMinutes(instant, toZone) - zoneOffsetMinutes(instant, fromZone),
    dayShift: dayShift(instant, fromZone, toZone),
  }
}

// ¿Tienen dos zonas la misma hora en ese instante?
export function sameClock(date, zoneA, zoneB) {
  return zoneOffsetMinutes(date, zoneA) === zoneOffsetMinutes(date, zoneB)
}

export function localTimeZone() {
  return Intl.DateTimeFormat().resolvedOptions().timeZone
}

// Valor { country, timeZone } del selector a partir de una zona guardada (p. ej. la de un contacto).
export function zoneValue(timeZone, country) {
  if (!timeZone) return null
  return { country: country || findZone(timeZone)?.country.code || null, timeZone }
}

// Bandera emoji a partir del código ISO 3166-1 alfa-2 ("MX" → 🇲🇽).
export function countryFlag(code) {
  if (!/^[A-Z]{2}$/.test(code || '')) return ''
  return String.fromCodePoint(...[...code].map((ch) => 0x1f1e6 + ch.charCodeAt(0) - 65))
}

export function countryName(code) {
  return findCountry(code)?.name || ''
}

// "🇲🇽 México"
export function countryLabel(code) {
  const name = countryName(code)
  return name ? `${countryFlag(code)} ${name}` : ''
}

// Valor por defecto del selector de país de un contacto: España (península y Baleares).
export function defaultContactZone() {
  return { country: 'ES', timeZone: SPAIN_ZONE }
}
