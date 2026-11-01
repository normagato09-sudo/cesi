import { describe, expect, it } from 'vitest'
import { allianceSummary, attendanceOfMonth, boardSummary, coursesSummary, recruitmentSummary, tasksAndGoalsByArea, topAbsentees } from './areaSummary'
import { BOARDS } from './boards'

const rec = (studentId, status, extra = {}) => ({ courseId: 'c1', studentId, status, classStart: '2030-11-04T17:00:00.000Z', timeZone: 'Europe/Madrid', ...extra })

describe('asistencia', () => {
  const records = [
    rec('ana', 'present'),
    rec('ana', 'late'),
    rec('luis', 'absent'),
    rec('luis', 'absent', { justified: true, justification: 'Médico' }),
    rec('eva', 'absent', { courseId: 'c2' }),
    rec('ana', 'absent', { classStart: '2030-10-30T17:00:00.000Z' }),
  ]

  it('del mes: asistidos entre marcados y faltas sin justificar', () => {
    expect(attendanceOfMonth(records, '2030-11')).toEqual({ marked: 5, attended: 2, absent: 3, unjustified: 2, percent: 40 })
    expect(attendanceOfMonth(records, '2030-11', ['c1'])).toMatchObject({ marked: 4, percent: 50 })
    expect(attendanceOfMonth([], '2030-11').percent).toBe(null)
  })

  it('los que más faltan', () => {
    const students = [{ id: 'ana', name: 'Ana' }, { id: 'luis', name: 'Luis' }, { id: 'eva', name: 'Eva' }]
    expect(topAbsentees(records, students, '2030-11').map((r) => [r.student.name, r.absences])).toEqual([
      ['Luis', 2],
      ['Eva', 1],
    ])
    expect(topAbsentees(records, students, '2030-11', 3, ['c1']).map((r) => r.student.name)).toEqual(['Luis'])
  })

  it('cursos activos y alumnos inscritos', () => {
    const courses = [{ id: 'c1', schedule: { slots: [] } }, { id: 'c2' }, { id: 'c3' }]
    const students = [{ id: 'a', courseIds: ['c2'] }, { id: 'b', courseIds: [] }, { id: 'c' }]
    expect(coursesSummary(courses, students)).toEqual({ active: 2, enrolled: 1 })
  })
})

describe('selección', () => {
  it('vacantes abiertas y candidatos por estado', () => {
    const vacancies = [{ id: 'v1', status: 'open' }, { id: 'v2', status: 'filled' }]
    const contacts = [
      { id: 'a', candidacies: [{ vacancyId: 'v1', status: 'new' }, { vacancyId: 'v2', status: 'accepted' }] },
      { id: 'b', candidacies: [{ vacancyId: 'v1', status: 'interview' }] },
    ]
    const s = recruitmentSummary(vacancies, contacts)
    expect(s).toMatchObject({ openVacancies: 1, byStatus: { new: 1, interview: 1, accepted: 0, discarded: 0 }, inProcess: 2 })
    expect(s.interviews.map((i) => i.contact.id)).toEqual(['b'])
  })
})

describe('alianzas y tableros', () => {
  it('en negociación, cerradas este mes y pasos atrasados', () => {
    const contacts = [
      { id: 'a', alliance: { status: 'negociacion', nextStepDate: '2030-11-01' } },
      { id: 'b', alliance: { status: 'cerrado', closedAt: '2030-11-02T10:00:00Z' } },
      { id: 'c', alliance: { status: 'cerrado', closedAt: '2030-10-02T10:00:00Z' } },
      { id: 'd', alliance: { status: 'negociacion' }, teamProfile: {} },
    ]
    expect(allianceSummary(contacts, '2030-11-06', 'Europe/Madrid')).toEqual({ negotiating: 1, closedMonth: 1, lateSteps: 1 })
  })

  it('tablero: abiertos, atrasados y de esta semana', () => {
    const items = [
      { id: '1', status: 'nueva', due_date: '2030-11-01' },
      { id: '2', status: 'en_curso', due_date: '2030-11-09' },
      { id: '3', status: 'resuelta', due_date: '2030-11-01' },
      { id: '4', status: 'nueva', due_date: null },
    ]
    expect(boardSummary(BOARDS.tecnico, items, '2030-11-06')).toEqual({ open: 3, late: 1, week: 1 })
  })

  it('tareas atrasadas y objetivos del mes por área', () => {
    const tasks = [
      { area: 'media', due_date: '2030-11-01', status: 'pendiente' },
      { area: 'media', due_date: '2030-11-01', status: 'hecha' },
      { area: 'legal', due_date: '2030-12-01', status: 'pendiente' },
    ]
    const goals = [{ id: 'g', area: 'media', title: 'Seguidores', parts_done: 1, parts_total: 4 }, { id: 'h', area: 'media', title: 'Viejo', unclosed: true }]
    expect(tasksAndGoalsByArea(tasks, goals, '2030-11-06')).toEqual({ media: { lateTasks: 1, goals: [{ id: 'g', title: 'Seguidores', percent: 25 }] } })
  })
})
