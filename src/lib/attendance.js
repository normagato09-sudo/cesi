import { createCollection } from './store'
import { dateKeyOf, instantAt, normalizeCourse } from './courses'
import { SPAIN_ZONE, pad2, wallTime, zonedDateTime } from './timezones'
import { DAY_END_MINUTES, timeToMinutes } from './weeklySchedule'

// Pase de lista de los cursos. Las clases no se guardan ni salen en mi calendario: salen del
// horario del curso (desde schedule.since) y de las clases sueltas. Yo no estoy en las clases.
//
// Asistencia (un registro por alumno y clase):
// {
//   id, courseId, classKey ('AAAA-MM-DD_HH:mm' en la zona del horario, o 'extra:<id>' en una
//   clase suelta), classStart, classEnd (ISO), timeZone (zona de la clase), studentId,
//   status: 'present' | 'late' | 'absent',
//   lateMinutes: minutos de retraso (solo 'late'; null si aún no se han puesto),
//   arrivedAt, leftAt: entrada y salida (ISO; solo si vino),
//   createdAt, updatedAt
// }
// La clase va copiada en el registro para que el historial no cambie si cambia el horario. Sin
// registro, el alumno está sin marcar: no cuenta como falta.
//
// Clase suelta (p. ej. de recuperación): { id, courseId, start, end (ISO), timeZone, note, createdAt, updatedAt }.

export const ATTENDANCE_KEY = 'cesi_attendance_v1'
export const EXTRA_CLASSES_KEY = 'cesi_extra_classes_v1'

export const attendanceStore = createCollection(ATTENDANCE_KEY, { prefix: 'att' })
export const extraClassesStore = createCollection(EXTRA_CLASSES_KEY, { prefix: 'xcl' })

export const STATUSES = [
  { value: 'present', label: 'Presente' },
  { value: 'late', label: 'Retraso' },
  { value: 'absent', label: 'Falta' },
]

export const WEEKS_AHEAD = 4
// Entrada y salida: como mucho 3 h antes del inicio y 3 h después del fin de la clase.
export const MARGIN_MINUTES = 180
export const MAX_LATE_MINUTES = 600

const MINUTE = 60000
const DAY_MS = 86400000
const DAY_SHORT = ['dom', 'lun', 'mar', 'mié', 'jue', 'vie', 'sáb']
const MONTH_SHORT = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sept', 'oct', 'nov', 'dic']

export function getAllAttendance() {
  return attendanceStore.getAll()
}

export function getAllExtraClasses() {
  return extraClassesStore.getAll().sort((a, b) => new Date(a.start) - new Date(b.start))
}

// ---------------------------------------------------------------------------
// Fechas
// ---------------------------------------------------------------------------

const DAY_KEY = /^\d{4}-\d{2}-\d{2}$/

function keyToUtc(key) {
  const [y, m, d] = key.split('-').map(Number)
  return Date.UTC(y, m - 1, d)
}

function utcToDate(t) {
  const d = new Date(t)
  return { year: d.getUTCFullYear(), month: d.getUTCMonth() + 1, day: d.getUTCDate(), weekday: d.getUTCDay() }
}

// Día 'AAAA-MM-DD' de un instante en una zona.
export function dayKeyIn(date, timeZone) {
  return dateKeyOf(wallTime(date, timeZone))
}

function hhmmIn(date, timeZone) {
  const w = wallTime(date, timeZone)
  return `${pad2(w.hour)}:${pad2(w.minute)}`
}

// "lun 26 oct · 18:00–19:00", o "lun 26 oct 23:30 – mar 27 oct 00:30" si cruza la medianoche en esa zona.
export function classWhen(cls, timeZone) {
  const s = wallTime(cls.start, timeZone)
  const e = wallTime(cls.end, timeZone)
  const day = (w) => `${DAY_SHORT[w.weekday]} ${w.day} ${MONTH_SHORT[w.month - 1]}`
  const time = (w) => `${pad2(w.hour)}:${pad2(w.minute)}`
  return s.day === e.day && s.month === e.month ? `${day(s)} · ${time(s)}–${time(e)}` : `${day(s)} ${time(s)} – ${day(e)} ${time(e)}`
}

// ---------------------------------------------------------------------------
// Clases del curso
// ---------------------------------------------------------------------------

// Zona de las clases: la del horario, la del profesor o, si no hay, la mía.
export function courseZone(course, contacts = []) {
  const c = normalizeCourse(course)
  if (c.schedule) return c.schedule.timeZone
  const teacher = c.teacherId ? contacts.find((x) => x.id === c.teacherId) : null
  return teacher?.timeZone || SPAIN_ZONE
}

// Desde qué día valen las clases del horario: schedule.since o, en los horarios guardados antes
// (sin since), el día en que se creó el curso. null si no se sabe.
export function scheduleSince(course) {
  const c = normalizeCourse(course)
  if (!c.schedule) return null
  if (c.schedule.since) return c.schedule.since
  return c.createdAt ? dayKeyIn(new Date(c.createdAt), c.schedule.timeZone) : null
}

// Clases del horario de los días fromKey a toKey (en la zona del horario), sin las de antes de since.
export function scheduledClasses(course, fromKey, toKey) {
  const c = normalizeCourse(course)
  if (!c.schedule) return []
  const since = scheduleSince(c)
  const first = since && since > fromKey ? since : fromKey
  const { timeZone, slots } = c.schedule
  const out = []
  for (let t = keyToUtc(first); t <= keyToUtc(toKey); t += DAY_MS) {
    const date = utcToDate(t)
    for (const slot of slots) {
      if (slot.day !== date.weekday) continue
      const { date: start, exists } = instantAt(date, slot.start, timeZone)
      if (!exists) continue
      const day = dateKeyOf(date)
      const end = new Date(start.getTime() + c.classMinutes * MINUTE)
      out.push({ key: `${day}_${slot.start}`, courseId: c.id, date: day, start, end, timeZone, extraId: null, note: '' })
    }
  }
  return out
}

export function extraClassKey(id) {
  return `extra:${id}`
}

function fromExtra(x) {
  const start = new Date(x.start)
  return { key: extraClassKey(x.id), courseId: x.courseId, date: dayKeyIn(start, x.timeZone), start, end: new Date(x.end), timeZone: x.timeZone, extraId: x.id, note: x.note || '' }
}

function fromRecord(r) {
  const start = new Date(r.classStart)
  return { key: r.classKey, courseId: r.courseId, date: dayKeyIn(start, r.timeZone), start, end: new Date(r.classEnd), timeZone: r.timeZone, extraId: null, note: '' }
}

/**
 * Clases del curso para el pase de lista, ordenadas por hora: las del horario (desde since hasta
 * dentro de WEEKS_AHEAD semanas), las sueltas y las que ya tienen pase de lista aunque el horario
 * haya cambiado. Cada clase: { key, courseId, date (en su zona), start, end, timeZone, extraId, note }.
 */
export function courseClasses(course, { extraClasses = [], records = [], now = new Date(), weeksAhead = WEEKS_AHEAD } = {}) {
  const c = normalizeCourse(course)
  const byKey = new Map()
  if (c.schedule) {
    const tz = c.schedule.timeZone
    const from = scheduleSince(c) || dayKeyIn(now, tz)
    const to = dayKeyIn(new Date(now.getTime() + weeksAhead * 7 * DAY_MS), tz)
    for (const cls of scheduledClasses(c, from, to)) byKey.set(cls.key, cls)
  }
  for (const x of extraClasses) if (x.courseId === c.id) byKey.set(extraClassKey(x.id), fromExtra(x))
  for (const r of records) if (r.courseId === c.id && !byKey.has(r.classKey)) byKey.set(r.classKey, fromRecord(r))
  return [...byKey.values()].sort((a, b) => a.start - b.start)
}

/**
 * Clases agrupadas para la lista: hoy (en mi hora), sin pasar lista (ya empezadas y sin nadie
 * marcado; la más reciente primero), pasadas (con pase de lista; la más reciente primero) y próximas.
 */
export function groupClasses(classes, records, now = new Date(), myZone = SPAIN_ZONE) {
  const today = dayKeyIn(now, myZone)
  const marked = new Set(records.map((r) => `${r.courseId}|${r.classKey}`))
  const groups = { today: [], pending: [], past: [], upcoming: [] }
  for (const cls of classes) {
    if (dayKeyIn(cls.start, myZone) === today) groups.today.push(cls)
    else if (cls.start > now) groups.upcoming.push(cls)
    else if (marked.has(`${cls.courseId}|${cls.key}`)) groups.past.push(cls)
    else groups.pending.push(cls)
  }
  groups.pending.reverse()
  groups.past.reverse()
  return groups
}

// ---------------------------------------------------------------------------
// Pase de lista de una clase
// ---------------------------------------------------------------------------

export function classRecords(records, cls) {
  return records.filter((r) => r.courseId === cls.courseId && r.classKey === cls.key)
}

// Alumnos de la clase: los inscritos en el curso y los que tienen pase de lista en ella aunque ya
// no estén. [{ student, record, enrolled }] en el orden de `students`.
export function classStudents(cls, students, records) {
  const recs = classRecords(records, cls)
  return students
    .map((student) => ({
      student,
      record: recs.find((r) => r.studentId === student.id) || null,
      enrolled: (student.courseIds || []).includes(cls.courseId),
    }))
    .filter((row) => row.enrolled || row.record)
}

// { present, late, absent, unmarked } de la clase.
export function classSummary(cls, students, records) {
  const out = { present: 0, late: 0, absent: 0, unmarked: 0 }
  for (const { record } of classStudents(cls, students, records)) out[record ? record.status : 'unmarked']++
  return out
}

// Minutos desde el inicio de la clase hasta la entrada (0 si llegó a tiempo).
export function lateMinutesFor(arrivedAt, cls) {
  return Math.max(0, Math.round((new Date(arrivedAt) - cls.start) / MINUTE))
}

// Instante de una hora 'HH:mm' escrita en mi zona para esa clase: del día anterior, el de la
// clase o el siguiente (en mi zona), el que queda más cerca de la clase. null si no es una hora.
export function instantForClass(hhmm, cls, myZone = SPAIN_ZONE) {
  if (!/^\d{2}:\d{2}$/.test(hhmm || '')) return null
  const [hour, minute] = hhmm.split(':').map(Number)
  const base = keyToUtc(dayKeyIn(cls.start, myZone))
  let best = null
  let bestDistance = Infinity
  for (const shift of [0, -1, 1]) {
    const { date, exists } = zonedDateTime({ ...utcToDate(base + shift * DAY_MS), hour, minute }, myZone)
    if (!exists) continue
    const distance = date < cls.start ? cls.start - date : date > cls.end ? date - cls.end : 0
    if (distance < bestDistance) {
      best = date
      bestDistance = distance
    }
  }
  return best
}

// Hora 'HH:mm' de un instante en mi zona (para los campos de entrada y salida).
export function myTime(date, myZone = SPAIN_ZONE) {
  return hhmmIn(new Date(date), myZone)
}

// Mensaje de error de la entrada y la salida, o null.
export function validateTimes(cls, arrivedAt, leftAt) {
  if (!arrivedAt || !leftAt) return 'Pon la hora de entrada y la de salida.'
  const arrived = new Date(arrivedAt)
  const left = new Date(leftAt)
  if (left <= arrived) return 'La salida tiene que ser posterior a la entrada.'
  if (dayKeyIn(left, cls.timeZone) !== cls.date) return 'La salida tiene que ser como muy tarde a las 23:59 del día de la clase (en la hora del curso).'
  if (arrived < cls.start.getTime() - MARGIN_MINUTES * MINUTE || left > cls.end.getTime() + MARGIN_MINUTES * MINUTE) {
    return 'La entrada y la salida tienen que estar entre 3 h antes del inicio y 3 h después del fin de la clase.'
  }
  return null
}

export function validateLateMinutes(minutes) {
  const n = Number(minutes)
  return Number.isInteger(n) && n >= 1 && n <= MAX_LATE_MINUTES ? null : `Los minutos de retraso tienen que ser un número del 1 al ${MAX_LATE_MINUTES}.`
}

// Aviso de un registro incompleto (se guarda igual), o null.
export function recordProblem(record) {
  return record?.status === 'late' && !record.lateMinutes ? 'Faltan los minutos de retraso.' : null
}

function findRecord(cls, studentId) {
  return attendanceStore.getAll().find((r) => r.courseId === cls.courseId && r.classKey === cls.key && r.studentId === studentId) || null
}

function saveRecord(cls, studentId, patch) {
  const current = findRecord(cls, studentId)
  const data = {
    courseId: cls.courseId,
    classKey: cls.key,
    classStart: cls.start.toISOString(),
    classEnd: cls.end.toISOString(),
    timeZone: cls.timeZone,
    studentId,
    ...patch,
  }
  return current ? attendanceStore.update(current.id, data) : attendanceStore.create(data)
}

/**
 * Marca al alumno como presente, con retraso o falta. Al venir, la entrada y la salida son las que
 * tuviera o, si no, el inicio y el fin de la clase. Con retraso, los minutos salen de la entrada
 * (null si llegó a la hora: entonces hay que ponerlos).
 */
export function markAttendance(cls, studentId, status) {
  if (!STATUSES.some((s) => s.value === status)) throw new Error('Estado de asistencia no válido.')
  if (status === 'absent') return saveRecord(cls, studentId, { status, lateMinutes: null, arrivedAt: null, leftAt: null })
  const current = findRecord(cls, studentId)
  const arrivedAt = current?.arrivedAt || cls.start.toISOString()
  const leftAt = current?.leftAt || cls.end.toISOString()
  let lateMinutes = null
  if (status === 'late') lateMinutes = (current?.status === 'late' && current.lateMinutes) || lateMinutesFor(arrivedAt, cls) || null
  return saveRecord(cls, studentId, { status, lateMinutes, arrivedAt, leftAt })
}

// Cambia la entrada y la salida (horas 'HH:mm' en mi zona). Con retraso, los minutos se vuelven a
// calcular desde la entrada. Lanza un Error si no son válidas.
export function setAttendanceTimes(cls, studentId, { arrived, left }, myZone = SPAIN_ZONE) {
  const current = findRecord(cls, studentId)
  if (!current || current.status === 'absent') throw new Error('Marca primero si vino.')
  const arrivedAt = instantForClass(arrived, cls, myZone)
  const leftAt = instantForClass(left, cls, myZone)
  const problem = validateTimes(cls, arrivedAt, leftAt)
  if (problem) throw new Error(problem)
  const patch = { arrivedAt: arrivedAt.toISOString(), leftAt: leftAt.toISOString() }
  if (current.status === 'late') patch.lateMinutes = lateMinutesFor(arrivedAt, cls) || null
  return saveRecord(cls, studentId, patch)
}

// Cambia los minutos de retraso. Si la entrada era la hora de inicio, pasa a ser inicio + minutos.
export function setLateMinutes(cls, studentId, minutes) {
  const current = findRecord(cls, studentId)
  if (!current || current.status !== 'late') throw new Error('Marca primero el retraso.')
  const problem = validateLateMinutes(minutes)
  if (problem) throw new Error(problem)
  const n = Number(minutes)
  const patch = { lateMinutes: n }
  if (new Date(current.arrivedAt).getTime() === cls.start.getTime()) {
    const arrivedAt = new Date(cls.start.getTime() + n * MINUTE)
    if (!validateTimes(cls, arrivedAt, current.leftAt)) patch.arrivedAt = arrivedAt.toISOString()
  }
  return saveRecord(cls, studentId, patch)
}

// Vuelve a dejar al alumno sin marcar.
export function unmarkAttendance(cls, studentId) {
  const current = findRecord(cls, studentId)
  if (current) attendanceStore.remove(current.id)
}

// Marca como presentes a los inscritos que aún están sin marcar. Devuelve cuántos.
export function markAllPresent(cls, students) {
  const records = attendanceStore.getAll()
  const pending = classStudents(cls, students, records).filter((row) => row.enrolled && !row.record)
  for (const { student } of pending) markAttendance(cls, student.id, 'present')
  return pending.length
}

// ---------------------------------------------------------------------------
// Clases sueltas
// ---------------------------------------------------------------------------

// Mensaje de error de una clase suelta ({ date, start ('HH:mm' en la zona del curso), minutes }), o null.
export function validateExtraClass({ date, start, minutes }, timeZone) {
  if (!DAY_KEY.test(date || '')) return 'Pon la fecha de la clase.'
  if (!/^\d{2}:\d{2}$/.test(start || '')) return 'Pon la hora de la clase.'
  const n = Number(minutes)
  if (!Number.isInteger(n) || n < 15 || n > 600) return 'La duración de la clase tiene que estar entre 15 minutos y 10 horas.'
  if (!instantAt(utcToDate(keyToUtc(date)), start, timeZone).exists) return 'Esa hora no existe ese día por el cambio de hora.'
  if (timeToMinutes(start) + n > DAY_END_MINUTES) return 'La clase tiene que acabar como muy tarde a las 23:59 (en la hora del curso).'
  return null
}

// Inicio y fin de una clase suelta ({ date, start, minutes } en su zona), o null si no es válida.
export function extraClassTimes(values, timeZone) {
  if (validateExtraClass(values, timeZone)) return null
  const start = instantAt(utcToDate(keyToUtc(values.date)), values.start, timeZone).date
  return { start, end: new Date(start.getTime() + Number(values.minutes) * MINUTE) }
}

// Valores del formulario de una clase suelta guardada (en su zona).
export function extraClassFormValues(x) {
  const start = new Date(x.start)
  return {
    date: dayKeyIn(start, x.timeZone),
    start: hhmmIn(start, x.timeZone),
    minutes: Math.round((new Date(x.end) - start) / MINUTE),
    note: x.note || '',
  }
}

/**
 * Crea (o, con `id`, cambia) una clase suelta. Al cambiarla, sus pases de lista se quedan con la
 * nueva hora. Lanza un Error si no es válida.
 */
export function saveExtraClass(courseId, values, timeZone, id = null) {
  const problem = validateExtraClass(values, timeZone)
  if (problem) throw new Error(problem)
  const { start, end } = extraClassTimes(values, timeZone)
  const data = { courseId, start: start.toISOString(), end: end.toISOString(), timeZone, note: (values.note || '').trim() }
  if (!id) return extraClassesStore.create(data)
  const saved = extraClassesStore.update(id, data)
  const key = extraClassKey(id)
  const records = attendanceStore.getAll()
  if (records.some((r) => r.classKey === key)) {
    attendanceStore.replaceAll(records.map((r) => (r.classKey === key ? { ...r, classStart: data.start, classEnd: data.end, timeZone } : r)))
  }
  return saved
}

// Borra la clase suelta y su pase de lista.
export function deleteExtraClass(id) {
  const key = extraClassKey(id)
  attendanceStore.replaceAll(attendanceStore.getAll().filter((r) => r.classKey !== key))
  extraClassesStore.remove(id)
}

// ---------------------------------------------------------------------------
// Al borrar un alumno o un curso
// ---------------------------------------------------------------------------

export function attendanceCountOfStudent(studentId) {
  return attendanceStore.getAll().filter((r) => r.studentId === studentId).length
}

// { records, extraClasses } del curso.
export function attendanceCountOfCourse(courseId) {
  return {
    records: attendanceStore.getAll().filter((r) => r.courseId === courseId).length,
    extraClasses: extraClassesStore.getAll().filter((x) => x.courseId === courseId).length,
  }
}

export function removeStudentAttendance(studentId) {
  const records = attendanceStore.getAll()
  if (records.some((r) => r.studentId === studentId)) attendanceStore.replaceAll(records.filter((r) => r.studentId !== studentId))
}

export function removeCourseAttendance(courseId) {
  const records = attendanceStore.getAll()
  if (records.some((r) => r.courseId === courseId)) attendanceStore.replaceAll(records.filter((r) => r.courseId !== courseId))
  const extras = extraClassesStore.getAll()
  if (extras.some((x) => x.courseId === courseId)) extraClassesStore.replaceAll(extras.filter((x) => x.courseId !== courseId))
}
