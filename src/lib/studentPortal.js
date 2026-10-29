import { COUNTRIES } from './countries'
import { findCountry, findZone, localTimeZone } from './timezones'
import { DAY_END, WEEKDAY_DISPLAY_ORDER, WEEKDAY_LABELS, clampEnd, emptyWeek, normalizeWeek, timeToMinutes } from './weeklySchedule'
import { normalizeDiscord } from './students'

// Portal del alumno: su perfil (tabla student_profiles, ver supabase/schema.sql), que rellena él
// mismo la primera vez que entra. La disponibilidad tiene el mismo formato que la de mis fichas de
// alumno ([{ day, enabled, slots: [{ start, end }] }] en su hora local) más su zona horaria, así
// se cruza con la del profesor igual (courseScheduling.js).
//
// Perfil: { id, full_name, discord, country, time_zone, birthday: 'MM-DD' | '', availability,
//           completed_at, created_at, updated_at }

export const MAX_NAME_LENGTH = 120

export const DAY_LETTERS = { 1: 'L', 2: 'M', 3: 'X', 4: 'J', 5: 'V', 6: 'S', 0: 'D' }

export const MONTHS = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre']
const MONTH_DAYS = [31, 29, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31]

export function daysInMonth(month) {
  return MONTH_DAYS[month - 1] || 31
}

// ---------------------------------------------------------------------------
// Disponibilidad por horas
// ---------------------------------------------------------------------------
// En la tabla del portal se marca hora a hora: { [day]: Set de horas 0..23 }. Al guardar, las horas
// seguidas se juntan en franjas; la de 23:00 acaba a las 23:59 (ninguna franja cruza la medianoche).

export function emptyHours() {
  const out = {}
  for (const day of WEEKDAY_DISPLAY_ORDER) out[day] = new Set()
  return out
}

export function weekFromHours(hours) {
  return emptyWeek().map(({ day }) => {
    const sorted = [...(hours[day] || [])].filter((h) => Number.isInteger(h) && h >= 0 && h <= 23).sort((a, b) => a - b)
    const slots = []
    for (const h of sorted) {
      const last = slots[slots.length - 1]
      if (last && last.endHour === h) last.endHour = h + 1
      else slots.push({ startHour: h, endHour: h + 1 })
    }
    const out = slots.map((s) => ({ start: `${String(s.startHour).padStart(2, '0')}:00`, end: s.endHour === 24 ? DAY_END : `${String(s.endHour).padStart(2, '0')}:00` }))
    return { day, enabled: out.length > 0, slots: out }
  })
}

// Horas marcadas de un horario (una hora cuenta si alguna franja la toca).
export function hoursFromWeek(week) {
  const hours = emptyHours()
  const normalized = normalizeWeek(week, null)
  if (!normalized) return hours
  for (const entry of normalized) {
    if (!entry.enabled) continue
    for (const slot of entry.slots) {
      const start = timeToMinutes(slot.start)
      const end = timeToMinutes(clampEnd(slot.end))
      const endMinutes = end === timeToMinutes(DAY_END) ? 24 * 60 : end
      for (let h = Math.floor(start / 60); h * 60 < endMinutes; h++) hours[entry.day].add(h)
    }
  }
  return hours
}

export function totalHours(hours) {
  return Object.values(hours).reduce((n, set) => n + set.size, 0)
}

export function toggleHour(hours, day, hour, on) {
  const next = { ...hours, [day]: new Set(hours[day]) }
  if (on) next[day].add(hour)
  else next[day].delete(hour)
  return next
}

// «Copiar lunes a L–V»: martes a viernes iguales que el lunes.
export function copyMondayToWeekdays(hours) {
  const next = { ...hours }
  for (const day of [2, 3, 4, 5]) next[day] = new Set(hours[1])
  return next
}

export function hourLabel(hour) {
  return `${String(hour).padStart(2, '0')}:00`
}

// «lunes de 17:00 a 18:00»
export function cellLabel(day, hour) {
  return `${WEEKDAY_LABELS[day].toLowerCase()} de ${hourLabel(hour)} a ${hourLabel(hour + 1)}`
}

// ---------------------------------------------------------------------------
// Zona horaria y país
// ---------------------------------------------------------------------------

// País y zona propuestos según el navegador (si la zona es de un país conocido).
export function detectedZone() {
  const zone = localTimeZone()
  const found = findZone(zone)
  return found ? { country: found.country.code, timeZone: zone } : { country: '', timeZone: '' }
}

export function countryZones(country) {
  return findCountry(country)?.zones || []
}

export function sortedCountries() {
  return [...COUNTRIES].sort((a, b) => a.name.localeCompare(b.name, 'es', { sensitivity: 'base' }))
}

// ---------------------------------------------------------------------------
// Formulario
// ---------------------------------------------------------------------------

// Valores del formulario a partir de lo guardado (o de lo que se sabe de la cuenta la primera vez).
// account: { display_name, discord_username }.
export function formFromProfile(profile, account = {}, detected = detectedZone()) {
  const country = profile?.country || detected.country
  const zones = countryZones(country)
  const timeZone = profile?.time_zone || (zones.some((z) => z.id === detected.timeZone) ? detected.timeZone : zones[0]?.id || '')
  const [month, day] = (profile?.birthday || '').split('-').map(Number)
  return {
    fullName: profile?.full_name || account.display_name || '',
    discord: profile?.discord || account.discord_username || '',
    country,
    timeZone,
    birthdayDay: day || '',
    birthdayMonth: month || '',
    hours: profile?.availability ? hoursFromWeek(profile.availability) : emptyHours(),
  }
}

// { campo: mensaje } con lo que falta o no vale ({} si está todo bien).
export function validatePortalForm(form) {
  const errors = {}
  const name = (form.fullName || '').replace(/\s+/g, ' ').trim()
  if (!name) errors.fullName = 'Escribe tu nombre y apellidos.'
  else if (name.length > MAX_NAME_LENGTH) errors.fullName = 'El nombre es demasiado largo.'
  if (normalizeDiscord(form.discord).length > 40) errors.discord = 'El usuario de Discord es demasiado largo.'
  if (!findCountry(form.country)) errors.country = 'Elige tu país.'
  else if (!countryZones(form.country).some((z) => z.id === form.timeZone)) errors.timeZone = 'Elige tu zona horaria.'
  const day = Number(form.birthdayDay) || 0
  const month = Number(form.birthdayMonth) || 0
  if ((day && !month) || (!day && month)) errors.birthday = 'Elige el día y el mes, o deja los dos vacíos.'
  else if (day && day > daysInMonth(month)) errors.birthday = 'Ese día no existe en ese mes.'
  if (totalHours(form.hours) === 0) errors.hours = 'Marca al menos una hora para continuar.'
  return errors
}

// Fila de student_profiles a guardar (sin id ni fechas).
export function profileRowFromForm(form) {
  const day = Number(form.birthdayDay) || 0
  const month = Number(form.birthdayMonth) || 0
  return {
    full_name: form.fullName.replace(/\s+/g, ' ').trim(),
    discord: normalizeDiscord(form.discord),
    country: form.country,
    time_zone: form.timeZone,
    birthday: day && month ? `${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}` : '',
    availability: weekFromHours(form.hours),
  }
}

export function initials(name) {
  const words = (name || '').trim().split(/\s+/).filter(Boolean)
  if (words.length === 0) return '?'
  return (words[0][0] + (words.length > 1 ? words[words.length - 1][0] : '')).toLocaleUpperCase('es')
}

// ---------------------------------------------------------------------------
// Con mi ficha de Alumnos
// ---------------------------------------------------------------------------

// Horario comparable: solo días activos con sus franjas ordenadas.
function weekKey(week) {
  const normalized = normalizeWeek(week, null)
  if (!normalized) return '[]'
  return JSON.stringify(
    normalized.filter((e) => e.enabled && e.slots.length > 0).map((e) => [e.day, e.slots.map((s) => `${s.start}-${clampEnd(s.end)}`)]),
  )
}

// ¿Tiene el perfil del alumno país, zona o disponibilidad distintos de los de mi ficha?
// Solo si ha completado su perfil.
export function portalDiffers(portal, student) {
  if (!portal?.completed_at || !student) return false
  return (
    (portal.country || '') !== (student.country || '') ||
    (portal.time_zone || '') !== (student.timeZone || '') ||
    weekKey(portal.availability) !== weekKey(student.availability)
  )
}

// «Copiar a la ficha»: solo país, zona horaria y disponibilidad.
export function fichaPatch(portal) {
  return { country: portal.country, timeZone: portal.time_zone, availability: normalizeWeek(portal.availability, null) }
}

// Ficha nueva de Alumnos con los datos de la cuenta (desde Accesos): ya nace con todo copiado.
export function newStudentFromPortal(portal, account = {}, todayKey) {
  return {
    name: portal.full_name || account.display_name || '',
    email: account.email || '',
    discord: portal.discord || account.discord_username || '',
    enrolledAt: todayKey,
    ...fichaPatch(portal),
  }
}

// ---------------------------------------------------------------------------
// Supabase
// ---------------------------------------------------------------------------

const FIELDS = 'id, full_name, discord, country, time_zone, birthday, availability, completed_at, created_at, updated_at'

function check({ data, error }) {
  if (error) throw error
  return data
}

export function isMissingTable(error) {
  return error?.code === 'PGRST205' || error?.code === '42P01'
}

// La cuenta del alumno (profiles) y su perfil (null si aún no lo ha rellenado).
export async function fetchMyPortal(client, userId) {
  const [account, profile] = await Promise.all([
    client.from('profiles').select('*').eq('id', userId).maybeSingle(),
    client.from('student_profiles').select(FIELDS).eq('id', userId).maybeSingle(),
  ])
  return { account: check(account) || {}, profile: check(profile) }
}

// Guarda el perfil (lo crea la primera vez). Sin upsert: el alumno no puede cambiar el id.
export async function saveMyPortal(client, userId, row, existing = null) {
  const completed_at = existing?.completed_at || new Date().toISOString()
  const query = existing
    ? client.from('student_profiles').update({ ...row, completed_at }).eq('id', userId)
    : client.from('student_profiles').insert({ id: userId, ...row, completed_at })
  return check(await query.select(FIELDS).single())
}

// Para la ceo: los perfiles de los alumnos con cuenta, por id de mi ficha de Alumnos.
// Map(studentId → { ...perfil, email, accountId }). Vacío si falta la tabla (SQL sin ejecutar).
export async function listPortalsByStudent(client) {
  const [links, profiles] = await Promise.all([
    client.from('profiles').select('id, email, linked_student_id').not('linked_student_id', 'is', null),
    client.from('student_profiles').select(FIELDS),
  ])
  if (isMissingTable(profiles.error)) return new Map()
  const byAccount = new Map(check(profiles).map((p) => [p.id, p]))
  const out = new Map()
  for (const link of check(links)) {
    const portal = byAccount.get(link.id)
    if (portal) out.set(link.linked_student_id, { ...portal, email: link.email, accountId: link.id })
  }
  return out
}

// Para la ceo: todos los perfiles, por id de cuenta (Accesos).
export async function listPortalsByAccount(client) {
  const { data, error } = await client.from('student_profiles').select(FIELDS)
  if (isMissingTable(error)) return new Map()
  return new Map(check({ data, error }).map((p) => [p.id, p]))
}
