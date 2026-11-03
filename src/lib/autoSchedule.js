import { combinedAttendance, proposeSlots, scheduleFromSelection } from './courseScheduling'
import { hasAvailability } from './contactAvailability'
import { normalizeCourse, studentsInCourse } from './courses'
import { normalizeWeek, WEEKDAY_DISPLAY_ORDER } from './weeklySchedule'

// Horario automático de un curso (sobre «Organizar horario», courseScheduling.js): las personas del
// curso con la disponibilidad de su perfil (cesi_course_people, parte 30), las mejores
// combinaciones de clases para la semana y cuándo hay que recalcular.

/**
 * Filas de cesi_course_people → { teacher, students } en la forma que espera el cálculo (como un
 * contacto: { id, name, timeZone, country, availability }). Sin disponibilidad válida, sin
 * availability (no cuenta y sale avisado).
 */
export function peopleFromRows(rows) {
  const person = (r) => {
    const availability = normalizeWeek(r.availability, null)
    return {
      id: r.id,
      name: r.name || '',
      accountId: r.account_id || null,
      timeZone: r.time_zone || 'Europe/Madrid',
      country: r.country || '',
      fromProfile: !!r.from_profile,
      ...(availability ? { availability } : {}),
    }
  }
  const list = (rows || []).map(person)
  const ids = new Set()
  const students = []
  for (const r of (rows || []).filter((x) => x.kind === 'student')) {
    if (ids.has(r.id)) continue
    ids.add(r.id)
    students.push(person(r))
  }
  const teacherRow = (rows || []).find((r) => r.kind === 'teacher')
  return { teacher: teacherRow ? person(teacherRow) : null, students, all: list }
}

// Combinaciones de `size` franjas en días distintos (de las primeras `pool` propuestas).
function* combinations(items, size, start = 0, picked = []) {
  if (picked.length === size) {
    yield picked
    return
  }
  for (let i = start; i < items.length; i++) {
    if (picked.some((p) => p.day === items[i].day)) continue
    yield* combinations(items, size, i + 1, [...picked, items[i]])
  }
}

const POOL = 18
export const MAX_OPTIONS = 3

/**
 * Las mejores opciones de horario para el curso: tantas clases por semana como pida, en días
 * distintos, siempre con el profesor libre la clase entera, ordenadas por cuántos alumnos pueden
 * ir a todas. Cada opción: { key, slots (las propuestas elegidas), schedule (lo que se guarda),
 * can, cannot (alumnos con disponibilidad), unknown (sin disponibilidad) }. [] si el profesor no
 * tiene disponibilidad o no hay huecos.
 */
export function bestSchedules({ course, teacher, students, now = new Date(), limit = MAX_OPTIONS }) {
  if (!teacher || !hasAvailability(teacher)) return []
  const perWeek = normalizeCourse(course).classesPerWeek
  const pool = proposeSlots({ course, teacher, students, now, perDay: 2, limit: POOL })
  const dayOrder = (day) => WEEKDAY_DISPLAY_ORDER.indexOf(day)
  const options = []
  for (const combo of combinations(pool, Math.min(perWeek, 7))) {
    const att = combinedAttendance(combo, students)
    const slots = [...combo].sort((a, b) => dayOrder(a.day) - dayOrder(b.day) || a.startAt - b.startAt)
    options.push({
      key: slots.map((s) => s.key).join('|'),
      slots,
      schedule: scheduleFromSelection(slots, teacher),
      can: att.can,
      cannot: att.cannot,
      unknown: att.unknown,
      partial: slots.reduce((n, s) => n + s.can.length, 0),
    })
  }
  // A igualdad, la que más alumnos junta en cada clase y, luego, la que va antes en la semana.
  const when = (o) => o.slots.map((s) => dayOrder(s.day) * 1e13 + s.startAt.getTime() % 1e13)
  const earlier = (a, b) => {
    const x = when(a)
    const y = when(b)
    for (let i = 0; i < x.length; i++) if (x[i] !== y[i]) return x[i] - y[i]
    return 0
  }
  options.sort((a, b) => b.can.length - a.can.length || b.partial - a.partial || earlier(a, b))
  // Sin repetir opciones que solo cambian en media hora con los mismos alumnos.
  const out = []
  for (const o of options) {
    if (out.length >= limit) break
    if (out.some((x) => x.can.length === o.can.length && x.slots.every((s, i) => s.day === o.slots[i].day))) continue
    out.push(o)
  }
  return out
}

// «Pueden 8 de 10» (sin contar a quien no tiene disponibilidad).
export function canText(option) {
  const total = option.can.length + option.cannot.length
  return total === 0 ? 'Ningún alumno con disponibilidad' : `Pueden ${option.can.length} de ${total}`
}

// ¿Son el mismo horario? (misma zona y mismas franjas)
export function sameSchedule(a, b) {
  if (!a || !b) return !a && !b
  if (a.timeZone !== b.timeZone || a.slots.length !== b.slots.length) return false
  const key = (s) => `${s.day}-${s.start}`
  const keys = new Set(a.slots.map(key))
  return b.slots.every((s) => keys.has(key(s)))
}

// ¿Ha empezado el curso? En curso o terminado, o con la fecha de inicio ya pasada.
export function courseStarted(course, todayKey) {
  const c = normalizeCourse(course)
  return c.status === 'en_curso' || c.status === 'terminado' || (!!c.startDate && c.startDate <= todayKey)
}

const sortedIds = (ids) => [...new Set(ids)].sort()

/**
 * Lo que hay que hacer con el horario de un curso organizado («Organizar horario» guarda en
 * course.scheduleAuto los alumnos que había): 'none' (nada cambió, no se organizó o ya terminó),
 * 'recalc' (antes de empezar: se recalcula solo) o 'propose' (ya empezado: se propone).
 * Con { joined, left }: los alumnos que han entrado y salido desde entonces.
 */
export function scheduleAction(course, students, todayKey) {
  const c = normalizeCourse(course)
  const auto = course.scheduleAuto
  if (!auto || !Array.isArray(auto.students) || c.status === 'terminado') return { action: 'none', joined: [], left: [] }
  const now = sortedIds(studentsInCourse(course.id, students).map((s) => s.id))
  const before = sortedIds(auto.students)
  const joined = now.filter((id) => !before.includes(id))
  const left = before.filter((id) => !now.includes(id))
  if (joined.length === 0 && left.length === 0) return { action: 'none', joined, left }
  return { action: courseStarted(course, todayKey) ? 'propose' : 'recalc', joined, left }
}

// Lo que se guarda en el curso al elegir un horario: el horario y los alumnos que había.
export function schedulePatch(option, students, extra = {}) {
  return { schedule: option.schedule, scheduleAuto: { students: sortedIds(students.map((s) => s.id)), at: new Date().toISOString() }, schedulePending: null, ...extra }
}

const DAY_NAME = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado']

// «el martes a las 18:00 y el jueves a las 19:30» (en la zona del horario).
export function slotsText(schedule) {
  if (!schedule?.slots?.length) return 'sin horario'
  const parts = schedule.slots.map((s) => `el ${DAY_NAME[s.day]} a las ${s.start}`)
  return parts.length === 1 ? parts[0] : `${parts.slice(0, -1).join(', ')} y ${parts.at(-1)}`
}

// «Con el nuevo alumno, el martes a las 18:00 iría mejor».
export function proposalText({ joined = [], left = [] }, schedule) {
  const who =
    joined.length && !left.length
      ? joined.length === 1
        ? 'Con el nuevo alumno'
        : 'Con los nuevos alumnos'
      : left.length && !joined.length
        ? left.length === 1
          ? 'Sin el alumno que se ha ido'
          : 'Sin los alumnos que se han ido'
        : 'Con los cambios de alumnos'
  return `${who}, ${slotsText(schedule)} iría mejor`
}

// RPC (parte 30).
async function rpc(client, name, args) {
  const { data, error } = await client.rpc(name, args)
  if (error) throw error
  return data
}
export const listCoursePeople = (client, courseId) => rpc(client, 'cesi_course_people', { p_course: courseId })
export const notifyScheduleChange = (client, courseId, oldSchedule, newSchedule, minutes) =>
  rpc(client, 'cesi_course_schedule_notify', { p_course: courseId, p_old: oldSchedule, p_new: newSchedule, p_minutes: minutes })
export const listMyScheduleChanges = (client) => rpc(client, 'cesi_my_schedule_changes', {})
export const markScheduleChangeSeen = (client, id) => rpc(client, 'cesi_schedule_change_seen', { p_id: id })

export function scheduleErrorText(err) {
  if (err?.code === 'PGRST202' || err?.code === '42883') return 'Falta ejecutar en Supabase el SQL de la parte 30 (supabase/parte30_horario_de_cursos.sql).'
  return err?.message || 'No se pudo calcular el horario.'
}
