import { createCollection } from './store'
import { studentsStore } from './students'
import { departmentKey } from './departments'
import { currentRoles } from './trajectory'
import { hasAvailability } from './contactAvailability'
import { isActiveMember } from './team'
import { SPAIN_ZONE, pad2, wallTime, zonedDateTime } from './timezones'
import { DAY_END_MINUTES, WEEKDAY_DISPLAY_ORDER, WEEKDAY_LABELS, timeToMinutes } from './weeklySchedule'

// Cursos de los alumnos. Curso:
// {
//   id, name,
//   description,
//   teacherId: id del contacto del profesor (un miembro de Equipo) o null,
//   classMinutes: duración de cada clase, classesPerWeek: clases por semana (1..7),
//   schedule: horario fijo de las clases o null:
//     { timeZone: zona en la que está (la del profesor al guardarlo), slots: [{ day: 0..6, start: 'HH:mm' }],
//       since: 'AAAA-MM-DD' desde cuándo vale (en su zona; los horarios guardados antes no lo tienen) },
//   createdAt, updatedAt
// }
// Todos los campos menos el nombre son opcionales: un curso sin ellos se lee con su valor por
// defecto (normalizeCourse), así que los cursos guardados antes no hay que migrarlos. El pase de
// lista irá en su propia colección, con courseId y la clave de cada clase (upcomingClasses).
//
// La inscripción se guarda solo en el alumno (students.courseIds); los inscritos de un curso se
// calculan con studentsInCourse.

export const STORAGE_KEY = 'cesi_courses_v1'

export const coursesStore = createCollection(STORAGE_KEY, { prefix: 'crs' })

export const CLASS_DURATIONS = [30, 45, 60, 75, 90, 120, 150, 180]
export const DEFAULT_CLASS_MINUTES = 60
export const MAX_CLASSES_PER_WEEK = 7
export const TEACHERS_DEPARTMENT = 'Profesores'

const MAX_NAME_LENGTH = 60

function nameKey(name) {
  return (name || '')
    .trim()
    .toLocaleLowerCase('es')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
}

function normalizeSchedule(schedule) {
  if (!schedule || typeof schedule !== 'object' || !schedule.timeZone || !Array.isArray(schedule.slots)) return null
  const slots = schedule.slots
    .filter((s) => s && Number.isInteger(s.day) && s.day >= 0 && s.day <= 6 && /^\d{2}:\d{2}$/.test(s.start || ''))
    .map((s) => ({ day: s.day, start: s.start }))
  if (!slots.length) return null
  const since = /^\d{4}-\d{2}-\d{2}$/.test(schedule.since || '') ? schedule.since : null
  return { timeZone: schedule.timeZone, slots: sortScheduleSlots(slots), ...(since ? { since } : {}) }
}

// El horario que se guarda, con desde cuándo vale: si no cambia (misma zona y mismas franjas)
// conserva su since; si cambia, vale desde hoy (en su zona). Así no salen clases pasadas que
// nunca hubo con ese horario.
export function scheduleWithSince(next, prev, now = new Date()) {
  if (!next) return null
  const slotsKey = (s) => JSON.stringify(sortScheduleSlots(s.slots).map(({ day, start }) => [day, start]))
  if (prev && prev.timeZone === next.timeZone && slotsKey(prev) === slotsKey(next)) {
    return prev.since ? { ...next, since: prev.since } : { ...next }
  }
  return { ...next, since: dateKeyOf(wallTime(now, next.timeZone)) }
}

export function sortScheduleSlots(slots) {
  const order = (day) => WEEKDAY_DISPLAY_ORDER.indexOf(day)
  return [...slots].sort((a, b) => order(a.day) - order(b.day) || timeToMinutes(a.start) - timeToMinutes(b.start))
}

// Curso con todos sus campos (los que falten, con su valor por defecto).
export function normalizeCourse(course) {
  const minutes = Number(course.classMinutes)
  const perWeek = Number(course.classesPerWeek)
  return {
    ...course,
    name: course.name || '',
    description: course.description || '',
    teacherId: course.teacherId || null,
    classMinutes: Number.isInteger(minutes) && minutes > 0 ? minutes : DEFAULT_CLASS_MINUTES,
    classesPerWeek: Number.isInteger(perWeek) && perWeek >= 1 && perWeek <= MAX_CLASSES_PER_WEEK ? perWeek : 1,
    schedule: normalizeSchedule(course.schedule),
  }
}

export function getAllCourses() {
  return coursesStore
    .getAll()
    .map(normalizeCourse)
    .sort((a, b) => a.name.localeCompare(b.name, 'es', { sensitivity: 'base' }))
}

export function normalizeCourseName(name) {
  return (name || '').replace(/\s+/g, ' ').trim().slice(0, MAX_NAME_LENGTH)
}

// Mensaje de error del nombre o null si es válido. `exceptId`: el curso que se está renombrando.
export function validateCourseName(name, courses, exceptId = null) {
  const clean = normalizeCourseName(name)
  if (!clean) return 'Escribe el nombre del curso.'
  if (courses.some((c) => c.id !== exceptId && nameKey(c.name) === nameKey(clean))) return `Ya tienes un curso «${clean}».`
  return null
}

// Mensaje de error de los datos del curso o null si son válidos.
export function validateCourse(data, courses, exceptId = null) {
  const nameProblem = validateCourseName(data.name, courses, exceptId)
  if (nameProblem) return nameProblem
  const minutes = Number(data.classMinutes)
  if (!Number.isInteger(minutes) || minutes < 15 || minutes > 600) return 'La duración de cada clase tiene que estar entre 15 minutos y 10 horas.'
  const perWeek = Number(data.classesPerWeek)
  if (!Number.isInteger(perWeek) || perWeek < 1 || perWeek > MAX_CLASSES_PER_WEEK) return 'Las clases por semana tienen que ser entre 1 y 7.'
  return validateSchedule(data.schedule, minutes, perWeek)
}

const isSlot = (s) => s && Number.isInteger(s.day) && s.day >= 0 && s.day <= 6 && /^\d{2}:\d{2}$/.test(s.start || '') && timeToMinutes(s.start) <= DAY_END_MINUTES

// Mensaje de error del horario fijo o null (sin horario también vale). Tiene que tener una franja
// por cada clase de la semana; cada clase acaba como muy tarde a las 23:59 de su día (en la zona
// del horario) y no se solapa con otra.
export function validateSchedule(schedule, classMinutes, classesPerWeek) {
  if (!schedule) return null
  if (!schedule.timeZone) return 'Falta la zona horaria del horario.'
  const slots = Array.isArray(schedule.slots) ? schedule.slots : []
  if (!slots.every(isSlot)) return 'Pon el día y la hora de cada clase.'
  if (slots.length !== classesPerWeek) {
    return `El horario tiene ${slots.length} clase${slots.length === 1 ? '' : 's'} y el curso, ${classesPerWeek} por semana.`
  }
  const sorted = sortScheduleSlots(slots)
  for (const [i, s] of sorted.entries()) {
    const start = timeToMinutes(s.start)
    if (start + classMinutes > DAY_END_MINUTES) {
      return `La clase del ${WEEKDAY_LABELS[s.day].toLowerCase()} a las ${s.start} acabaría después de las 23:59 (en este curso cada clase dura ${durationLabel(classMinutes)}).`
    }
    const prev = sorted[i - 1]
    if (prev && prev.day === s.day && timeToMinutes(prev.start) + classMinutes > start) {
      return `Las clases del ${WEEKDAY_LABELS[s.day].toLowerCase()} a las ${prev.start} y a las ${s.start} se solapan.`
    }
  }
  return null
}

// "1 h", "45 min", "1 h 30 min"
export function durationLabel(minutes) {
  const h = Math.floor(minutes / 60)
  const m = minutes % 60
  if (h === 0) return `${m} min`
  return m === 0 ? `${h} h` : `${h} h ${m} min`
}

// Cursos (existentes) de un alumno, en el orden de la lista de cursos.
export function coursesOfStudent(student, courses) {
  const ids = student?.courseIds || []
  return courses.filter((c) => ids.includes(c.id))
}

// Alumnos inscritos en el curso (calculado a partir de los courseIds de cada alumno).
export function studentsInCourse(courseId, students) {
  return students.filter((s) => (s.courseIds || []).includes(courseId))
}

// Cambios para quitar el curso borrado de sus alumnos: [{ id, courseIds }].
export function studentsWithoutCourse(courseId, students) {
  return studentsInCourse(courseId, students).map((s) => ({ id: s.id, courseIds: s.courseIds.filter((id) => id !== courseId) }))
}

// Borra el curso y lo quita de los alumnos que estaban inscritos (los alumnos se conservan).
export function deleteCourse(courseId) {
  for (const { id, courseIds } of studentsWithoutCourse(courseId, studentsStore.getAll())) studentsStore.update(id, { courseIds })
  coursesStore.remove(courseId)
}

// ---------------------------------------------------------------------------
// Profesor (un miembro activo de Equipo)
// ---------------------------------------------------------------------------

// ¿Está en el departamento «Profesores»? Por cualquiera de sus roles actuales.
export function isInTeachersDepartment(contact) {
  const p = contact.teamProfile || {}
  const key = departmentKey(TEACHERS_DEPARTMENT)
  return departmentKey(p.area) === key || currentRoles(p).some((r) => departmentKey(r.area) === key)
}

// Miembros del equipo para elegir profesor: primero los de «Profesores» y luego el resto. Si
// nadie está en «Profesores», todos van en `others`.
export function teacherOptions(contacts) {
  const byName = (a, b) => (a.name || '').localeCompare(b.name || '', 'es', { sensitivity: 'base' })
  const members = contacts.filter(isActiveMember).sort(byName)
  const teachers = members.filter(isInTeachersDepartment)
  return { teachers, others: members.filter((m) => !teachers.includes(m)) }
}

// Profesor del curso y qué le pasa: { teacher, problem } con problem:
// 'none' (sin profesor), 'missing' (borrado), 'inactive' (ya no está en el equipo),
// 'noAvailability' (sin disponibilidad) o null (todo bien).
export function teacherStatus(course, contacts) {
  if (!course.teacherId) return { teacher: null, problem: 'none' }
  const teacher = contacts.find((c) => c.id === course.teacherId) || null
  if (!teacher) return { teacher: null, problem: 'missing' }
  if (!isActiveMember(teacher)) return { teacher, problem: 'inactive' }
  if (!hasAvailability(teacher)) return { teacher, problem: 'noAvailability' }
  return { teacher, problem: null }
}

// ¿Se puede usar "Organizar horario"? Solo con un profesor del equipo con disponibilidad.
export function canOrganize(course, contacts) {
  return teacherStatus(course, contacts).problem === null
}

// ---------------------------------------------------------------------------
// Horario y próximas clases
// ---------------------------------------------------------------------------

const DAY_MS = 86400000
export const DAY_SHORT = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb']

function hhmm(w) {
  return `${pad2(w.hour)}:${pad2(w.minute)}`
}

// "Lun 18:00–19:00" o, si cruza la medianoche en esa zona, "Lun 23:30 – Mar 00:30".
export function rangeInZone(start, end, timeZone) {
  const s = wallTime(start, timeZone)
  const e = wallTime(end, timeZone)
  return s.weekday === e.weekday && s.day === e.day
    ? `${DAY_SHORT[s.weekday]} ${hhmm(s)}–${hhmm(e)}`
    : `${DAY_SHORT[s.weekday]} ${hhmm(s)} – ${DAY_SHORT[e.weekday]} ${hhmm(e)}`
}

// Instante de una fecha { year, month, day } y hora 'HH:mm' en una zona.
export function instantAt(date, time, timeZone) {
  const minutes = timeToMinutes(time)
  return zonedDateTime({ ...date, hour: Math.floor(minutes / 60), minute: minutes % 60 }, timeZone)
}

function dateFromUtc(t) {
  const d = new Date(t)
  return { year: d.getUTCFullYear(), month: d.getUTCMonth() + 1, day: d.getUTCDate(), weekday: d.getUTCDay() }
}

export function dateKeyOf({ year, month, day }) {
  return `${year}-${pad2(month)}-${pad2(day)}`
}

// Fechas (en `timeZone`) desde el día de `now`, día a día.
export function* datesFrom(now, timeZone) {
  const today = wallTime(now, timeZone)
  for (let t = Date.UTC(today.year, today.month - 1, today.day); ; t += DAY_MS) yield dateFromUtc(t)
}

/**
 * Próximas clases del curso según su horario (no se crean en el calendario). Cada clase:
 * { key: 'AAAA-MM-DD_HH:mm' (fecha y hora en la zona del horario; para el pase de lista),
 *   date, start: Date, end: Date }. Solo las que aún no han terminado.
 */
export function upcomingClasses(course, now = new Date(), count = 10) {
  const c = normalizeCourse(course)
  if (!c.schedule) return []
  const { timeZone, slots } = c.schedule
  const out = []
  let days = 0
  for (const date of datesFrom(now, timeZone)) {
    if (out.length >= count || days++ > 7 * (count + 1)) break
    for (const slot of sortScheduleSlots(slots).filter((s) => s.day === date.weekday)) {
      const { date: start, exists } = instantAt(date, slot.start, timeZone)
      if (!exists) continue
      const end = new Date(start.getTime() + c.classMinutes * 60000)
      if (end <= now) continue
      out.push({ key: `${dateKeyOf(date)}_${slot.start}`, date: dateKeyOf(date), start, end })
    }
  }
  return out.slice(0, count)
}

// Horario semanal para la ficha: en la zona del horario y en mi hora (España), con las fechas de
// la próxima clase de cada franja (respeta el cambio de hora). [{ key, own, mine }]
export function scheduleRows(course, now = new Date(), myZone = SPAIN_ZONE) {
  const c = normalizeCourse(course)
  if (!c.schedule) return []
  const { timeZone } = c.schedule
  const rows = []
  for (const slot of c.schedule.slots) {
    for (const date of datesFrom(now, timeZone)) {
      if (date.weekday !== slot.day) continue
      const start = instantAt(date, slot.start, timeZone).date
      const end = new Date(start.getTime() + c.classMinutes * 60000)
      rows.push({ key: `${slot.day}-${slot.start}`, own: rangeInZone(start, end, timeZone), mine: rangeInZone(start, end, myZone) })
      break
    }
  }
  return rows
}
