import { format } from 'date-fns'
import { createCollection } from './store'
import { isEmail, validateContactCountry } from './contacts'
import { SPAIN_ZONE, countryName, pad2, wallTime, zonedDateTime } from './timezones'
import { WEEKDAY_DISPLAY_ORDER, clampEnd, normalizeWeek, timeToMinutes, validateWeek } from './weeklySchedule'

// Alumnos. Alumno:
// {
//   id, name, email, phone (teléfono / WhatsApp),
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
  defaults: { name: '', email: '', phone: '', country: '', timeZone: '', courseIds: [], notes: '', enrolledAt: '', availability: null },
})

export function todayKey(date = new Date()) {
  return format(date, 'yyyy-MM-dd')
}

export function getAllStudents() {
  return studentsStore.getAll().sort((a, b) => (a.name || '').localeCompare(b.name || '', 'es', { sensitivity: 'base' }))
}

// Mensaje de error o null si los datos del alumno son válidos.
export function validateStudent(data) {
  if (!(data.name || '').trim()) return 'El nombre es obligatorio.'
  if ((data.email || '').trim() && !isEmail(data.email)) return 'El email no tiene un formato válido.'
  const countryProblem = validateContactCountry(data)
  if (countryProblem) return countryProblem
  if (!/^\d{4}-\d{2}-\d{2}$/.test(data.enrolledAt || '')) return 'La fecha de alta es obligatoria.'
  if (data.availability) {
    const problem = validateWeek(normalizeWeek(data.availability))
    if (problem) return `Disponibilidad: ${problem}`
  }
  return null
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
    [student.name, student.email, student.phone].some((field) => normalize(field).includes(q)) ||
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
