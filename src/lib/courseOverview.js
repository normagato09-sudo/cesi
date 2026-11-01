import { WEEKDAY_DISPLAY_ORDER } from './weeklySchedule'
import { normalizeCourse } from './courses'
import { attendanceOfMonth } from './areaSummary'

// Las cifras de las pantallas Cursos y Alumnos (rediseño de la fase de alumnos). Funciones puras.

const DAY_SHORT = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb']

// «Lun y Mié · 18:00» (o «Lun 18:00 · Jue 19:30» si cambian las horas), en la zona del horario.
export function shortSchedule(course) {
  const c = normalizeCourse(course)
  if (!c.schedule) return 'Sin horario'
  const slots = [...c.schedule.slots].sort((a, b) => WEEKDAY_DISPLAY_ORDER.indexOf(a.day) - WEEKDAY_DISPLAY_ORDER.indexOf(b.day))
  const hours = new Set(slots.map((s) => s.start))
  if (hours.size === 1) {
    const days = slots.map((s) => DAY_SHORT[s.day])
    const list = days.length > 1 ? `${days.slice(0, -1).join(', ')} y ${days.at(-1)}` : days[0]
    return `${list} · ${slots[0].start}`
  }
  return slots.map((s) => `${DAY_SHORT[s.day]} ${s.start}`).join(' · ')
}

// Asistencia de un alumno (en un curso o en todos): { marked, percent (null sin marcar) }.
export function studentAttendance(records, studentId, courseId = null) {
  let marked = 0
  let attended = 0
  for (const r of records) {
    if (r.studentId !== studentId || (courseId && r.courseId !== courseId)) continue
    marked++
    if (r.status !== 'absent') attended++
  }
  return { marked, percent: marked ? Math.round((attended / marked) * 100) : null }
}

// Color de una asistencia: verde desde el 90 %, naranja desde el 75 %, rojo por debajo.
export function attendanceTone(percent) {
  if (percent === null || percent === undefined) return 'none'
  if (percent >= 90) return 'good'
  if (percent >= 75) return 'warn'
  return 'bad'
}

// Mes anterior a 'AAAA-MM'.
export function previousMonth(month) {
  const [y, m] = month.split('-').map(Number)
  return m === 1 ? `${y - 1}-12` : `${y}-${String(m - 1).padStart(2, '0')}`
}

// Asistencia del mes de un curso y la diferencia con el mes anterior (en puntos; null si falta alguno).
export function courseMonthAttendance(records, courseId, month) {
  const now = attendanceOfMonth(records, month, [courseId])
  const before = attendanceOfMonth(records, previousMonth(month), [courseId])
  return { ...now, delta: now.percent !== null && before.percent !== null ? now.percent - before.percent : null }
}

/**
 * Estado de una clase en la ficha del curso: 'listed' (Lista pasada), 'unlisted' (Sin pasar
 * lista), 'next' (Próxima: la primera que viene) o 'scheduled' (Programada).
 */
export function classStatus(cls, records, nextKey, now = new Date()) {
  if (cls.start <= now) return records.some((r) => r.courseId === cls.courseId && r.classKey === cls.key) ? 'listed' : 'unlisted'
  return cls.key === nextKey ? 'next' : 'scheduled'
}

export const CLASS_STATUS_LABEL = { listed: 'Lista pasada', unlisted: 'Sin pasar lista', next: 'Próxima', scheduled: 'Programada' }

/**
 * Cifras de la cabecera de Alumnos: { total, activeMonth (con alguna clase marcada este mes),
 * newWeek (dados de alta en los últimos 7 días) }.
 */
export function studentHeadline(students, records, todayKey) {
  const month = todayKey.slice(0, 7)
  const [y, m, d] = todayKey.split('-').map(Number)
  const weekAgo = new Date(Date.UTC(y, m - 1, d - 6)).toISOString().slice(0, 10)
  const active = new Set()
  for (const r of records) {
    const day = (r.classStart || '').slice(0, 10)
    if (day.slice(0, 7) === month) active.add(r.studentId)
  }
  return {
    total: students.length,
    activeMonth: students.filter((s) => active.has(s.id)).length,
    newWeek: students.filter((s) => {
      const since = s.enrolledAt || (s.createdAt || '').slice(0, 10)
      return since && since >= weekAgo && since <= todayKey
    }).length,
  }
}

// Cuenta de un alumno: 'linked' (Con cuenta), 'pending' (Pendiente: aún no completó su perfil) o 'none'.
export function accountState(portal) {
  if (!portal) return 'none'
  return portal.completed_at ? 'linked' : 'pending'
}

export const ACCOUNT_LABEL = { linked: 'Con cuenta', pending: 'Pendiente', none: 'Sin cuenta' }

// Últimas clases de un alumno: [{ record, courseId }] por fecha, de la más reciente.
export function lastClasses(records, studentId, limit = 5) {
  return records
    .filter((r) => r.studentId === studentId)
    .sort((a, b) => (b.classStart || '').localeCompare(a.classStart || ''))
    .slice(0, limit)
}
