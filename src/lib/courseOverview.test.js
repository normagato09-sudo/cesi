import { describe, expect, it } from 'vitest'
import { accountState, attendanceTone, classStatus, courseMonthAttendance, lastClasses, previousMonth, shortSchedule, studentAttendance, studentHeadline } from './courseOverview'

const rec = (studentId, status, classStart, extra = {}) => ({ courseId: 'c1', classKey: classStart, studentId, status, classStart, timeZone: 'Europe/Madrid', ...extra })

describe('cursos', () => {
  it('horario corto', () => {
    expect(shortSchedule({ schedule: { timeZone: 'Europe/Madrid', slots: [{ day: 3, start: '18:00' }, { day: 1, start: '18:00' }] } })).toBe('Lun y Mié · 18:00')
    expect(shortSchedule({ schedule: { timeZone: 'Europe/Madrid', slots: [{ day: 1, start: '18:00' }, { day: 4, start: '19:30' }] } })).toBe('Lun 18:00 · Jue 19:30')
    expect(shortSchedule({})).toBe('Sin horario')
  })

  it('asistencia del mes con la diferencia con el anterior', () => {
    const records = [rec('a', 'present', '2030-11-04T17:00:00Z'), rec('b', 'absent', '2030-11-04T17:00:00Z'), rec('a', 'present', '2030-10-04T17:00:00Z')]
    expect(courseMonthAttendance(records, 'c1', '2030-11')).toMatchObject({ percent: 50, delta: -50, unjustified: 1 })
    expect(previousMonth('2030-01')).toBe('2029-12')
  })

  it('estado de cada clase', () => {
    const now = new Date('2030-11-06T12:00:00Z')
    const past = { key: 'p', courseId: 'c1', start: new Date('2030-11-04T17:00:00Z') }
    const pastNoList = { key: 'q', courseId: 'c1', start: new Date('2030-11-05T17:00:00Z') }
    const next = { key: 'n', courseId: 'c1', start: new Date('2030-11-07T17:00:00Z') }
    const later = { key: 'l', courseId: 'c1', start: new Date('2030-11-14T17:00:00Z') }
    const records = [{ courseId: 'c1', classKey: 'p', studentId: 'a' }]
    expect([past, pastNoList, next, later].map((c) => classStatus(c, records, 'n', now))).toEqual(['listed', 'unlisted', 'next', 'scheduled'])
  })
})

describe('alumnos', () => {
  it('asistencia de cada uno y su color', () => {
    const records = [rec('a', 'present', '1'), rec('a', 'late', '2'), rec('a', 'absent', '3'), rec('a', 'present', '4', { courseId: 'c2' })]
    expect(studentAttendance(records, 'a')).toEqual({ marked: 4, percent: 75 })
    expect(studentAttendance(records, 'a', 'c1')).toEqual({ marked: 3, percent: 67 })
    expect(studentAttendance(records, 'b').percent).toBe(null)
    expect([95, 80, 50, null].map(attendanceTone)).toEqual(['good', 'warn', 'bad', 'none'])
  })

  it('cifras de la cabecera, cuenta y últimas clases', () => {
    const students = [
      { id: 'a', enrolledAt: '2030-11-05' },
      { id: 'b', enrolledAt: '2030-01-01' },
      { id: 'c', createdAt: '2030-11-01T10:00:00Z' },
    ]
    const records = [rec('b', 'present', '2030-11-02T17:00:00Z'), rec('a', 'absent', '2030-10-02T17:00:00Z')]
    expect(studentHeadline(students, records, '2030-11-06')).toEqual({ total: 3, activeMonth: 1, newWeek: 2 })
    expect([accountState(null), accountState({}), accountState({ completed_at: 'x' })]).toEqual(['none', 'pending', 'linked'])
    expect(lastClasses(records, 'b').length).toBe(1)
  })
})
