import { format, parseISO } from 'date-fns'
import { es } from 'date-fns/locale'
import { createCollection } from './store'
import { isEmail, validateContactCountry } from './contacts'
import { SPAIN_ZONE, countryName, pad2, wallTime, zonedDateTime } from './timezones'
import { WEEKDAY_DISPLAY_ORDER, clampEnd, normalizeWeek, timeToMinutes, validateWeek } from './weeklySchedule'

// Alumnos. Alumno:
// {
//   id, name, email, phone (teléfono / WhatsApp),
//   discord: usuario de Discord ('' si no se sabe),
//   birthday: fecha de cumpleaños 'AAAA-MM-DD' o '' (la edad se calcula con ageOn),
//   country (ISO 3166-1 alfa-2, obligatorio), timeZone (zona IANA, obligatoria), igual que los contactos,
//   courseIds: ids de los cursos en los que está (la inscripción solo se guarda aquí),
//   notes, enrolledAt: 'AAAA-MM-DD' (fecha de alta),
//   availability: horario semanal con varias franjas por día, en su hora local, o null,
//   createdAt, updatedAt
// }
// Los alumnos guardados antes pueden tener `newsletter` (ya no se usa): se conserva tal cual.

export const STORAGE_KEY = 'cesi_students_v1'

export const studentsStore = createCollection(STORAGE_KEY, {
  prefix: 'stu',
  defaults: { name: '', email: '', phone: '', discord: '', birthday: '', country: '', timeZone: '', courseIds: [], notes: '', enrolledAt: '', availability: null },
})

export function todayKey(date = new Date()) {
  return format(date, 'yyyy-MM-dd')
}

export function getAllStudents() {
  return studentsStore.getAll().sort((a, b) => (a.name || '').localeCompare(b.name || '', 'es', { sensitivity: 'base' }))
}

// ---------------------------------------------------------------------------
// Discord y cumpleaños
// ---------------------------------------------------------------------------

export const MAX_DISCORD_LENGTH = 40

// Usuario de Discord tal como se guarda: sin espacios alrededor ni la @ del principio.
export function normalizeDiscord(text) {
  return (text || '').trim().replace(/^@+/, '').trim()
}

// La fecha 'AAAA-MM-DD' como { year, month, day }, o null si no es una fecha que exista.
function parseDayKey(key) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(key || '')
  if (!m) return null
  const [year, month, day] = m.slice(1).map(Number)
  const d = new Date(year, month - 1, day)
  return d.getFullYear() === year && d.getMonth() === month - 1 && d.getDate() === day ? { year, month, day } : null
}

const isLeapYear = (y) => (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0

// Edad el día `today` (fecha del dispositivo): sube el mismo día del cumpleaños. Quien nació un
// 29 de febrero cumple el 28 de febrero en los años no bisiestos. null sin fecha (o si es futura).
export function ageOn(birthday, today = new Date()) {
  const b = parseDayKey(birthday)
  if (!b) return null
  const year = today.getFullYear()
  const month = today.getMonth() + 1
  const day = today.getDate()
  const birthdayThisYear = b.month === 2 && b.day === 29 && !isLeapYear(year) ? 28 : b.day
  const age = year - b.year - (month < b.month || (month === b.month && day < birthdayThisYear) ? 1 : 0)
  return age >= 0 ? age : null
}

export function ageLabel(age) {
  return age === 1 ? '1 año' : `${age} años`
}

// "12 de marzo de 2008"
export function birthdayLabel(birthday) {
  return parseDayKey(birthday) ? format(parseISO(birthday), "d 'de' MMMM 'de' yyyy", { locale: es }) : ''
}

function validateBirthday(birthday, today) {
  if (!birthday) return null
  const b = parseDayKey(birthday)
  if (!b || b.year < 1900) return 'La fecha de cumpleaños no es válida.'
  if (birthday > todayKey(today)) return 'La fecha de cumpleaños no puede ser futura.'
  return null
}

// ---------------------------------------------------------------------------
// Validación
// ---------------------------------------------------------------------------

// Lo que se comprueba igual en mi app y en el futuro enlace del alumno.
function validateCommon(data, today) {
  if (!(data.name || '').trim()) return 'El nombre es obligatorio.'
  if ((data.email || '').trim() && !isEmail(data.email)) return 'El email no tiene un formato válido.'
  const countryProblem = validateContactCountry(data)
  if (countryProblem) return countryProblem
  if (normalizeDiscord(data.discord).length > MAX_DISCORD_LENGTH) return 'El usuario de Discord es demasiado largo.'
  return validateBirthday(data.birthday, today)
}

function validateAvailability(availability) {
  if (!availability) return null
  const problem = validateWeek(normalizeWeek(availability))
  return problem ? `Disponibilidad: ${problem}` : null
}

// Mensaje de error o null si los datos del alumno son válidos. Discord y cumpleaños, opcionales.
export function validateStudent(data, today = new Date()) {
  const problem = validateCommon(data, today)
  if (problem) return problem
  if (!/^\d{4}-\d{2}-\d{2}$/.test(data.enrolledAt || '')) return 'La fecha de alta es obligatoria.'
  return validateAvailability(data.availability)
}

// ---------------------------------------------------------------------------
// Perfil que rellenará el propio alumno con un enlace (todavía no existe; ver schema.sql)
// ---------------------------------------------------------------------------

// Campos que podrá editar el alumno. El resto (courseIds, notes, enrolledAt, phone...) solo los
// toco yo. Los cursos a los que quiere unirse van en requestedCourseIds y no lo inscriben: pasan
// a courseIds cuando yo lo apruebe.
export const SELF_SERVICE_FIELDS = [
  { field: 'discord', required: true },
  { field: 'name', required: true },
  { field: 'birthday', required: false },
  { field: 'country', required: true },
  { field: 'timeZone', required: true },
  { field: 'email', required: false },
  { field: 'availability', required: false },
  { field: 'requestedCourseIds', required: false },
]

// Solo los campos que puede tocar el alumno (lo demás que llegue se ignora).
export function selfServicePatch(data) {
  const patch = {}
  for (const { field } of SELF_SERVICE_FIELDS) if (field in (data || {})) patch[field] = data[field]
  if ('discord' in patch) patch.discord = normalizeDiscord(patch.discord)
  return patch
}

// Mensaje de error o null. Como en mi app, pero con Discord obligatorio y sin fecha de alta.
// `courses`: los cursos que existen (los que pida tienen que existir).
export function validateSelfServiceProfile(data, courses = [], today = new Date()) {
  if (!normalizeDiscord(data.discord)) return 'El usuario de Discord es obligatorio.'
  const problem = validateCommon(data, today)
  if (problem) return problem
  const requested = data.requestedCourseIds || []
  if (!Array.isArray(requested) || requested.some((id) => !courses.some((c) => c.id === id))) {
    return 'Alguno de los cursos elegidos ya no existe.'
  }
  return validateAvailability(data.availability)
}

export function createStudent(data) {
  const problem = validateStudent(data)
  if (problem) throw new Error(problem)
  return studentsStore.create(data)
}

export function updateStudent(id, patch) {
  const current = studentsStore.getAll().find((s) => s.id === id)
  if (!current) throw new Error('Alumno no encontrado.')
  const problem = validateStudent({ ...current, ...patch })
  if (problem) throw new Error(problem)
  return studentsStore.update(id, patch)
}

export function deleteStudent(id) {
  studentsStore.remove(id)
}

// ---------------------------------------------------------------------------
// Lista: buscador y filtros
// ---------------------------------------------------------------------------

function normalize(text) {
  return (text || '')
    .toString()
    .toLocaleLowerCase('es')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .trim()
}

export function studentMatches(student, query) {
  const q = normalize(query)
  if (!q) return true
  const digits = q.replace(/\D/g, '')
  return (
    [student.name, student.email, student.phone, student.discord].some((field) => normalize(field).includes(q)) ||
    (digits.length >= 3 && (student.phone || '').replace(/\D/g, '').includes(digits))
  )
}

export const DEFAULT_STUDENT_FILTER = { query: '', courseId: null, country: '' }

// Alumnos que cumplen el buscador y todos los filtros (curso y país).
export function filterStudents(students, { query = '', courseId = null, country = '' } = {}) {
  return students.filter(
    (s) =>
      studentMatches(s, query) &&
      (!courseId || (s.courseIds || []).includes(courseId)) &&
      (!country || s.country === country),
  )
}

// Países de los alumnos (sin repetir), ordenados por nombre, para el filtro.
export function studentCountries(students) {
  const codes = [...new Set(students.map((s) => s.country).filter(Boolean))]
  return codes.sort((a, b) => countryName(a).localeCompare(countryName(b), 'es', { sensitivity: 'base' }))
}

// Enlace de WhatsApp (wa.me) a partir del teléfono, que tiene que llevar el prefijo del país.
export function whatsappUrl(phone) {
  let digits = (phone || '').replace(/\D/g, '')
  if (digits.startsWith('00')) digits = digits.slice(2)
  return digits.length >= 8 ? `https://wa.me/${digits}` : null
}

// ---------------------------------------------------------------------------
// Disponibilidad en su hora y en la mía (España)
// ---------------------------------------------------------------------------

export const MY_ZONE = SPAIN_ZONE

const DAY_MS = 86400000
const DAY_SHORT = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb']

export function studentWeek(student) {
  return student.availability ? normalizeWeek(student.availability, null) : null
}

export function hasStudentAvailability(student) {
  const week = studentWeek(student)
  return !!week && week.some((d) => d.enabled && d.slots.length > 0)
}

function hhmm(w) {
  return `${pad2(w.hour)}:${pad2(w.minute)}`
}

/**
 * Franjas del alumno, cada una con su hora local y su equivalente en mi hora. Se calcula con las
 * fechas de la semana de `now` (en la zona del alumno), así que respeta el horario de verano de
 * los dos países en esa semana. En mi hora una franja puede caer en otro día o cruzar la medianoche.
 * Devuelve [{ key, own: 'Lun 20:00–23:00', mine: 'Mar 03:00–06:00', otherDay }].
 */
export function availabilityRows(student, now = new Date(), myZone = MY_ZONE) {
  const week = studentWeek(student)
  if (!week) return []
  const tz = student.timeZone || MY_ZONE
  const today = wallTime(now, tz)
  const mondayUtc = Date.UTC(today.year, today.month - 1, today.day) - ((today.weekday + 6) % 7) * DAY_MS
  const rows = []
  for (const day of WEEKDAY_DISPLAY_ORDER) {
    const entry = week.find((w) => w.day === day)
    if (!entry?.enabled) continue
    const d = new Date(mondayUtc + ((day + 6) % 7) * DAY_MS)
    const date = { year: d.getUTCFullYear(), month: d.getUTCMonth() + 1, day: d.getUTCDate() }
    for (const slot of entry.slots) {
      const end = clampEnd(slot.end)
      const at = (time) => {
        const minutes = timeToMinutes(time)
        return wallTime(zonedDateTime({ ...date, hour: Math.floor(minutes / 60), minute: minutes % 60 }, tz).date, myZone)
      }
      const s = at(slot.start)
      const e = at(end)
      const mine =
        s.weekday === e.weekday
          ? `${DAY_SHORT[s.weekday]} ${hhmm(s)}–${hhmm(e)}`
          : `${DAY_SHORT[s.weekday]} ${hhmm(s)} – ${DAY_SHORT[e.weekday]} ${hhmm(e)}`
      rows.push({ key: `${day}-${slot.start}`, own: `${DAY_SHORT[day]} ${slot.start}–${end}`, mine, otherDay: s.weekday !== day })
    }
  }
  return rows
}
