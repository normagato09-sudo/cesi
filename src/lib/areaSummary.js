import { dayKeyIn, isJustified } from './attendance'
import { candidaciesOf } from './vacancies'
import { allianceOf, isExternalContact, isNextStepOverdue } from './alliances'
import { isDone, isLate } from './boards'
import { addDaysKey, keyOf, mondayOf } from './sharedCalendar'

// Las cifras de los Inicios: el resumen de cada área (en «Mi panel» de su gente) y «Cómo va cada
// área» de la ceo. Funciones puras sobre los datos que cada uno ya recibe.

// Mes 'AAAA-MM' del día de la clase de un registro (en la zona de la clase).
function recordMonth(r) {
  return r.classStart ? dayKeyIn(new Date(r.classStart), r.timeZone || 'Europe/Madrid').slice(0, 7) : ''
}

/**
 * Asistencia del mes (de esos cursos; null: todos): { marked, attended (presentes y retrasos),
 * absent, unjustified (faltas sin justificar), percent (asistidos / marcados, o null) }. Sin marcar
 * no cuenta.
 */
export function attendanceOfMonth(records, month, courseIds = null) {
  const ids = courseIds ? new Set(courseIds) : null
  const out = { marked: 0, attended: 0, absent: 0, unjustified: 0, percent: null }
  for (const r of records) {
    if (ids && !ids.has(r.courseId)) continue
    if (recordMonth(r) !== month) continue
    out.marked++
    if (r.status === 'absent') {
      out.absent++
      if (!isJustified(r)) out.unjustified++
    } else out.attended++
  }
  out.percent = out.marked ? Math.round((out.attended / out.marked) * 100) : null
  return out
}

// Los alumnos con más faltas del mes: [{ student, absences }] (como mucho `limit`, sin los de 0).
export function topAbsentees(records, students, month, limit = 3, courseIds = null) {
  const ids = courseIds ? new Set(courseIds) : null
  const count = new Map()
  for (const r of records) {
    if (r.status !== 'absent' || recordMonth(r) !== month || (ids && !ids.has(r.courseId))) continue
    count.set(r.studentId, (count.get(r.studentId) || 0) + 1)
  }
  return [...count.entries()]
    .map(([id, absences]) => ({ student: students.find((s) => s.id === id) || { id, name: 'Alumno' }, absences }))
    .sort((a, b) => b.absences - a.absences || (a.student.name || '').localeCompare(b.student.name || '', 'es'))
    .slice(0, limit)
}

// Cursos activos (con horario o con alumnos) y alumnos inscritos en alguno.
export function coursesSummary(courses, students) {
  const enrolled = students.filter((s) => (s.courseIds || []).length > 0)
  const withStudents = new Set(enrolled.flatMap((s) => s.courseIds))
  return {
    active: courses.filter((c) => c.schedule || withStudents.has(c.id)).length,
    enrolled: enrolled.length,
  }
}

/**
 * Selección: vacantes abiertas (sin cubrir) y candidatos de esas vacantes por estado
 * ({ new, interview, accepted, discarded }); inProcess: nuevos y en entrevista.
 */
export function recruitmentSummary(vacancies, contacts) {
  const open = vacancies.filter((v) => v.status !== 'filled')
  const openIds = new Set(open.map((v) => v.id))
  const byStatus = { new: 0, interview: 0, accepted: 0, discarded: 0 }
  const interviews = []
  for (const c of contacts) {
    for (const cand of candidaciesOf(c)) {
      if (!openIds.has(cand.vacancyId)) continue
      byStatus[cand.status] = (byStatus[cand.status] || 0) + 1
      if (cand.status === 'interview') interviews.push({ contact: c, vacancy: open.find((v) => v.id === cand.vacancyId) })
    }
  }
  return { openVacancies: open.length, byStatus, inProcess: byStatus.new + byStatus.interview, interviews }
}

// Alianzas: en negociación, cerradas este mes (en mi zona) y próximos pasos atrasados.
export function allianceSummary(contacts, todayKey, zone) {
  const month = todayKey.slice(0, 7)
  let negotiating = 0
  let closedMonth = 0
  let lateSteps = 0
  for (const c of contacts) {
    const a = isExternalContact(c) ? allianceOf(c) : null
    if (!a) continue
    if (a.status === 'negociacion') negotiating++
    if (a.status === 'cerrado' && a.closedAt && keyOf(new Date(a.closedAt), zone).slice(0, 7) === month) closedMonth++
    if (isNextStepOverdue(a, todayKey)) lateSteps++
  }
  return { negotiating, closedMonth, lateSteps }
}

// Un tablero: abiertos (sin terminar), atrasados y de esta semana (de hoy al domingo, sin terminar).
export function boardSummary(cfg, items, todayKey) {
  const sunday = addDaysKey(mondayOf(todayKey), 6)
  return {
    open: items.filter((i) => !isDone(cfg, i)).length,
    late: items.filter((i) => isLate(cfg, i, todayKey)).length,
    week: items.filter((i) => !isDone(cfg, i) && i.due_date && i.due_date >= todayKey && i.due_date <= sunday).length,
  }
}

// Tareas atrasadas y objetivos del mes por área: { [area]: { lateTasks, goals: [{ title, percent }] } }.
export function tasksAndGoalsByArea(tasks, goals, todayKey) {
  const out = {}
  const of = (area) => (out[area] ||= { lateTasks: 0, goals: [] })
  for (const t of tasks) {
    if (t.area && t.due_date && t.due_date < todayKey && t.status !== 'hecha') of(t.area).lateTasks++
  }
  for (const g of goals) {
    if (!g.area || g.unclosed) continue
    of(g.area).goals.push({ id: g.id, title: g.title, percent: g.parts_total ? Math.round((g.parts_done / g.parts_total) * 100) : 0 })
  }
  return out
}
