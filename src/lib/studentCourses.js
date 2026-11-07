import { scheduleRows } from './courses'

// Cursos del alumno en su portal (ver supabase/parte25_cursos_e_inscripciones.sql): sus cursos y
// los abiertos para apuntarse, leídos y cambiados con funciones que lo comprueban todo.
//
// Curso (cesi_student_course_list): { id, name, description, teacher_name, schedule, class_minutes,
//   status, start_date, end_date, max_seats, enrolled, mine, done_classes, total_classes, next_class }

// Horario en su zona: ['Lun 18:00–19:00', …] (la hora de cada franja en esa zona, con el cambio de hora).
export function scheduleInZone(course, zone, now = new Date()) {
  if (!course.schedule) return []
  return scheduleRows({ schedule: course.schedule, classMinutes: course.class_minutes }, now, zone).map((r) => r.mine)
}

// Plazas libres (null: sin límite).
export function freeSeats(course) {
  return course.max_seats === null || course.max_seats === undefined ? null : Math.max(0, course.max_seats - (course.enrolled || 0))
}

// «4 de 12 clases» o «4 clases hechas» (sin fecha de fin).
export function progressText(course) {
  const done = course.done_classes || 0
  if (course.total_classes) return `${Math.min(done, course.total_classes)} de ${course.total_classes} clases`
  return `${done} ${done === 1 ? 'clase hecha' : 'clases hechas'}`
}

export function progressPercent(course) {
  if (!course.total_classes) return null
  return Math.min(100, Math.round(((course.done_classes || 0) / course.total_classes) * 100))
}

// 'AAAA-MM-DD' → «3 de noviembre».
export function dayText(key) {
  if (!key) return ''
  const [y, m, d] = key.split('-').map(Number)
  return new Date(Date.UTC(y, m - 1, d, 12)).toLocaleDateString('es-ES', { day: 'numeric', month: 'long', timeZone: 'UTC' })
}

export function splitCourses(list) {
  return { mine: list.filter((c) => c.mine), open: list.filter((c) => !c.mine) }
}

async function rpc(client, fn, args) {
  const { data, error } = await client.rpc(fn, args)
  if (error) throw new Error(studentCoursesErrorText(error))
  return data
}

export const listStudentCourses = (client) => rpc(client, 'cesi_student_course_list', {})
// { status: 'ok' | 'full' }
export const enrollInCourse = (client, courseId) => rpc(client, 'cesi_student_enroll', { p_course: courseId })
export const leaveCourse = (client, courseId) => rpc(client, 'cesi_student_unenroll', { p_course: courseId })

// Parte 39: los cursos que da quien llama («Eres el profesor») y el link de la llamada de los
// cursos que puede ver (Map curso → { link, canEdit }).
export const listMyTeacherCourses = (client) => rpc(client, 'cesi_my_teacher_courses', {}).then((ids) => new Set(ids || []))
export const listCallLinks = (client) =>
  rpc(client, 'cesi_course_call_links', {}).then((rows) => new Map((rows || []).map((r) => [r.course_id, { link: r.call_link || '', canEdit: !!r.can_edit }])))
export const setCallLink = (client, courseId, link) => rpc(client, 'cesi_course_set_link', { p_course: courseId, p_link: (link || '').trim() })

// ¿Es un link de llamada válido? ('' para quitarlo)
export function validCallLink(link) {
  const v = (link || '').trim()
  return v === '' || (/^https?:\/\//.test(v) && v.length <= 500)
}

export function studentCoursesErrorText(err) {
  if (err?.code === 'PGRST202' || err?.code === '42883') return 'Falta ejecutar en Supabase el SQL de la parte 25 (cursos e inscripciones).'
  // Una cuenta de equipo con el SQL de antes de la parte 39 (solo dejaba a los alumnos).
  if (err?.code === '42501' && /Solo los alumnos/.test(err?.message || '')) return 'Falta ejecutar en Supabase el SQL de la parte 39 (el equipo en los cursos).'
  return err?.message || 'No se pudo completar. Comprueba la conexión.'
}
