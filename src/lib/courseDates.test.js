import { beforeEach, describe, expect, it } from 'vitest'
import { courseClasses, scheduledClasses } from './attendance'
import { courseStartText, scheduleChange } from './courses'

beforeEach(() => localStorage.clear())

const MADRID = 'Europe/Madrid'
// Office: lunes a las 18:00 en Madrid, con horario puesto desde el 20 de octubre.
const office = {
  id: 'office',
  name: 'Office',
  classMinutes: 60,
  createdAt: '2026-10-20T10:00:00.000Z',
  schedule: { timeZone: MADRID, since: '2026-10-20', slots: [{ day: 1, start: '18:00' }] },
}
const NOW = new Date('2026-11-04T12:00:00Z') // miércoles 4 de noviembre
const keys = (course, now = NOW) => courseClasses(course, { now, weeksAhead: 3 }).map((c) => c.key)

describe('clases solo desde que empieza el curso', () => {
  it('no salen clases antes de la fecha de inicio (el 26 oct y el 2 nov ya no)', () => {
    expect(keys({ ...office, startDate: '2026-11-09' })).toEqual(['2026-11-09_18:00', '2026-11-16_18:00', '2026-11-23_18:00'])
  })

  it('ni después de la fecha de fin', () => {
    expect(keys({ ...office, startDate: '2026-11-09', endDate: '2026-11-16' })).toEqual(['2026-11-09_18:00', '2026-11-16_18:00'])
  })

  it('sin fecha de inicio no hay clases pasadas: solo las próximas', () => {
    expect(keys(office)).toEqual(['2026-11-09_18:00', '2026-11-16_18:00', '2026-11-23_18:00'])
  })

  it('aunque se pida un rango anterior, nunca antes del inicio', () => {
    expect(scheduledClasses({ ...office, startDate: '2026-11-09' }, '2026-10-01', '2026-11-10', NOW).map((c) => c.key)).toEqual(['2026-11-09_18:00'])
  })

  it('al cambiar el horario de un curso empezado, las clases pasadas se quedan y las nuevas van con el nuevo', () => {
    const started = { ...office, startDate: '2026-10-20' }
    const change = scheduleChange(started, { timeZone: MADRID, slots: [{ day: 2, start: '19:00' }] }, NOW)
    expect(change.schedule.since).toBe('2026-11-04')
    expect(change.pastSchedules).toEqual([{ timeZone: MADRID, since: '2026-10-20', slots: [{ day: 1, start: '18:00' }], until: '2026-11-04' }])
    expect(keys({ ...started, ...change })).toEqual(['2026-10-26_18:00', '2026-11-02_18:00', '2026-11-10_19:00', '2026-11-17_19:00', '2026-11-24_19:00'])
  })

  it('si aún no ha empezado, el horario se cambia sin guardar el de antes', () => {
    const change = scheduleChange({ ...office, startDate: '2026-11-09' }, { timeZone: MADRID, slots: [{ day: 2, start: '19:00' }] }, NOW)
    expect(change.pastSchedules).toEqual([])
    // Y si no cambia, nada.
    expect(scheduleChange({ ...office, startDate: '2026-10-20' }, office.schedule, NOW).pastSchedules).toEqual([])
  })

  it('arriba en el curso: «Empieza el lun 9 nov» o «Del 9 nov al 30 ene»', () => {
    expect(courseStartText({ startDate: '2026-11-09' })).toBe('Empieza el lun 9 nov')
    expect(courseStartText({ startDate: '2026-11-09', endDate: '2027-01-30' })).toBe('Del 9 nov al 30 ene')
    expect(courseStartText({})).toBe(null)
  })
})
