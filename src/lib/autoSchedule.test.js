import { describe, expect, it } from 'vitest'
import { bestSchedules, canText, courseStarted, peopleFromRows, proposalText, sameSchedule, scheduleAction, schedulePatch } from './autoSchedule'

// Semana con franjas por día: { 1: [['18:00', '20:00']], ... } (1 = lunes).
const week = (byDay) =>
  [0, 1, 2, 3, 4, 5, 6].map((day) => ({ day, enabled: !!byDay[day], slots: (byDay[day] || []).map(([start, end]) => ({ start, end })) }))

const row = (kind, id, byDay, extra = {}) => ({
  kind,
  id,
  name: id,
  account_id: null,
  country: 'ES',
  time_zone: 'Europe/Madrid',
  availability: byDay ? week(byDay) : null,
  from_profile: true,
  ...extra,
})

// Un lunes por la mañana: la semana que viene empieza el lunes siguiente.
const now = new Date('2030-11-04T08:00:00Z')

describe('horario automático', () => {
  it('pasa la disponibilidad del perfil al formato del cálculo (y avisa de quien no tiene)', () => {
    const { teacher, students } = peopleFromRows([row('teacher', 'profe', { 1: [['17:00', '21:00']] }), row('student', 'ana', null), row('student', 'luis', { 1: [['18:00', '19:00']] })])
    expect(teacher.availability).toHaveLength(7)
    expect(students.map((s) => s.id)).toEqual(['ana', 'luis'])
    expect(students[0].availability).toBe(undefined)
  })

  it('elige la combinación con el profesor libre y en la que pueden más alumnos', () => {
    const rows = [
      row('teacher', 'profe', { 1: [['17:00', '21:00']], 3: [['17:00', '21:00']] }),
      row('student', 'a', { 1: [['18:00', '19:00']], 3: [['18:00', '19:00']] }),
      row('student', 'b', { 1: [['18:00', '19:00']], 3: [['18:00', '19:00']] }),
      // Desde México: las 18:00 de Madrid son las 11:00 allí.
      row('student', 'c', { 1: [['11:00', '12:00']], 3: [['11:00', '12:00']] }, { time_zone: 'America/Mexico_City', country: 'MX' }),
      row('student', 'd', { 2: [['10:00', '11:00']] }),
      row('student', 'e', null),
    ]
    const { teacher, students } = peopleFromRows(rows)
    const course = { id: 'office', classMinutes: 60, classesPerWeek: 2 }
    const [best] = bestSchedules({ course, teacher, students, now })
    expect(best.schedule).toEqual({ timeZone: 'Europe/Madrid', slots: [{ day: 1, start: '18:00' }, { day: 3, start: '18:00' }] })
    expect(best.can.map((s) => s.id)).toEqual(['a', 'b', 'c'])
    expect(best.cannot.map((s) => s.id)).toEqual(['d'])
    expect(best.unknown.map((s) => s.id)).toEqual(['e'])
    expect(canText(best)).toBe('Pueden 3 de 4')
  })

  it('sin disponibilidad del profesor no propone nada', () => {
    const { teacher, students } = peopleFromRows([row('teacher', 'profe', null), row('student', 'a', { 1: [['18:00', '19:00']] })])
    expect(bestSchedules({ course: { id: 'x', classesPerWeek: 1 }, teacher, students, now })).toEqual([])
  })

  it('cuándo se recalcula solo y cuándo se propone', () => {
    const students = [
      { id: 'a', courseIds: ['office'] },
      { id: 'b', courseIds: ['office'] },
    ]
    const auto = { scheduleAuto: { students: ['a'] } }
    expect(scheduleAction({ id: 'office', status: 'inscripcion', ...auto }, students, '2030-11-04')).toMatchObject({ action: 'recalc', joined: ['b'] })
    expect(scheduleAction({ id: 'office', status: 'en_curso', ...auto }, students, '2030-11-04')).toMatchObject({ action: 'propose' })
    expect(scheduleAction({ id: 'office', status: 'inscripcion', startDate: '2030-11-01', ...auto }, students, '2030-11-04').action).toBe('propose')
    expect(scheduleAction({ id: 'office', status: 'inscripcion', scheduleAuto: { students: ['b', 'a'] } }, students, '2030-11-04').action).toBe('none')
    expect(scheduleAction({ id: 'office', status: 'en_curso' }, students, '2030-11-04').action).toBe('none')
    expect(scheduleAction({ id: 'office', status: 'terminado', ...auto }, students, '2030-11-04').action).toBe('none')
    expect(courseStarted({ status: 'borrador', startDate: '2030-12-01' }, '2030-11-04')).toBe(false)
  })

  it('guarda el horario con los alumnos que había y explica la propuesta', () => {
    const schedule = { timeZone: 'Europe/Madrid', slots: [{ day: 2, start: '18:00' }] }
    const patch = schedulePatch({ id: 'office' }, schedule, [{ id: 'b' }, { id: 'a' }])
    expect(patch.schedule).toMatchObject(schedule)
    expect(patch.scheduleAuto.students).toEqual(['a', 'b'])
    expect(patch.schedulePending).toBe(null)
    expect(proposalText({ joined: ['c'] }, schedule)).toBe('Con el nuevo alumno, el martes a las 18:00 iría mejor')
    expect(sameSchedule(schedule, { timeZone: 'Europe/Madrid', slots: [{ day: 2, start: '18:00' }] })).toBe(true)
    expect(sameSchedule(schedule, { timeZone: 'Europe/Madrid', slots: [{ day: 2, start: '19:00' }] })).toBe(false)
  })
})
