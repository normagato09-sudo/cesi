// Calificaciones (parte 36): el profesor de cada curso pone notas (actividad, fecha, nota de 0 a
// 10 y comentario); el alumno ve las suyas; la ceo y Directivo solo ven.

export const ACTIVITY_MAX = 120
export const COMMENT_MAX = 500

// Nota escrita con coma o punto → número con dos decimales como mucho, o null.
export function parseScore(text) {
  const n = Number(String(text ?? '').trim().replace(',', '.'))
  if (String(text ?? '').trim() === '' || !Number.isFinite(n) || n < 0 || n > 10) return null
  return Math.round(n * 100) / 100
}

// «7,5», «10».
export function scoreText(n) {
  if (n === null || n === undefined || n === '') return '—'
  const v = Math.round(Number(n) * 100) / 100
  return String(v).replace('.', ',')
}

export function average(list) {
  if (!list.length) return null
  return Math.round((list.reduce((s, g) => s + Number(g.score), 0) / list.length) * 100) / 100
}

// Color de la nota: 'good' (7 o más), 'warn' (5 a 7), 'bad' (menos de 5).
export function scoreTone(n) {
  if (n === null || n === undefined) return 'none'
  return n >= 7 ? 'good' : n >= 5 ? 'warn' : 'bad'
}

export function validateGrade({ student, activity, day, score }) {
  if (!student) return 'Elige el alumno.'
  const a = (activity || '').trim()
  if (!a) return 'Escribe la actividad.'
  if (a.length > ACTIVITY_MAX) return `La actividad puede tener como mucho ${ACTIVITY_MAX} caracteres.`
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day || '')) return 'Pon la fecha.'
  if (parseScore(score) === null) return 'La nota va de 0 a 10.'
  return null
}

// Mis notas (alumno) por curso: [{ courseId, name, average, grades }], por nombre de curso.
export function gradesByCourse(rows) {
  const byId = new Map()
  for (const g of rows) {
    if (!byId.has(g.course_id)) byId.set(g.course_id, { courseId: g.course_id, name: g.course_name, grades: [] })
    byId.get(g.course_id).grades.push(g)
  }
  return [...byId.values()]
    .map((c) => ({ ...c, average: average(c.grades) }))
    .sort((a, b) => a.name.localeCompare(b.name, 'es', { sensitivity: 'base' }))
}

// Filas de cesi_grade_summary → { course: Map(curso → { average, count }), student: Map(`curso|alumno` → …) }.
export function summaryMaps(rows) {
  const course = new Map()
  const student = new Map()
  for (const r of rows || []) {
    const v = { average: Number(r.average), count: r.count }
    if (r.student_id === null || r.student_id === undefined) course.set(r.course_id, v)
    else student.set(`${r.course_id}|${r.student_id}`, v)
  }
  return { course, student }
}

// Media de un alumno en todos sus cursos (con las notas de cada uno), o null.
export function studentAverage(maps, studentId) {
  let total = 0
  let count = 0
  for (const [key, v] of maps.student) {
    if (!key.endsWith(`|${studentId}`)) continue
    total += v.average * v.count
    count += v.count
  }
  return count ? Math.round((total / count) * 100) / 100 : null
}

export function gradeDate(day) {
  const [y, m, d] = String(day || '').split('-').map(Number)
  if (!y) return ''
  return new Intl.DateTimeFormat('es-ES', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' }).format(new Date(Date.UTC(y, m - 1, d))).replace('.', '')
}

async function rpc(client, name, args = {}) {
  const { data, error } = await client.rpc(name, args)
  if (error) throw error
  return data
}
export const listCourseGrades = (client, courseId) => rpc(client, 'cesi_grades_course', { p_course: courseId }).then((r) => r || [])
export const listMyGrades = (client) => rpc(client, 'cesi_my_grades').then((r) => r || [])
export const gradeSummary = (client) => rpc(client, 'cesi_grade_summary').then((r) => summaryMaps(r))
export const saveGrade = (client, courseId, { id = null, student, activity, day, score, comment }) =>
  rpc(client, 'cesi_grade_save', { p_id: id, p_course: courseId, p_student: student, p_activity: (activity || '').trim(), p_day: day, p_score: parseScore(score), p_comment: (comment || '').trim() })
export const deleteGrade = (client, id) => rpc(client, 'cesi_grade_delete', { p_id: id })

export function gradesErrorText(err) {
  if (err?.code === 'PGRST202' || err?.code === '42883') return 'Las calificaciones aún no están disponibles. Inténtalo más tarde.'
  return err?.message || 'No se pudo guardar.'
}
