import { describe, expect, it } from 'vitest'
import { NO_DEPARTMENT_LABEL, computeReport, meetingEvolution } from './weeklyReport'
import { isCurrentPeriod, periodLabel, periodOf, shiftPeriod, validateCustom } from './reportPeriods'

const d = (month, day, hh = 0, mm = 0) => new Date(2026, month - 1, day, hh, mm)
const H = 3600000
const workingHours = [0, 1, 2, 3, 4, 5, 6].map((day) => ({ day, enabled: day >= 1 && day <= 5, slots: [{ start: '09:00', end: '14:00' }] }))

let n = 0
const meeting = (start, end, extra = {}) => ({
  id: `m${++n}`,
  title: `Reunión ${n}`,
  participantIds: [],
  guests: [],
  recurrence: null,
  start: start.toISOString(),
  end: end.toISOString(),
  ...extra,
})

describe('periodos del Resumen', () => {
  const now = d(10, 4, 10) // domingo 4 de octubre de 2026

  it('esta semana, este mes y los últimos 3 meses, con su periodo anterior', () => {
    const week = periodOf('week', now)
    expect([week.start, week.end, week.prevStart, week.prevEnd]).toEqual([d(9, 28), d(10, 5), d(9, 21), d(9, 28)])
    const month = periodOf('month', now)
    expect([month.start, month.end, month.prevStart]).toEqual([d(10, 1), d(11, 1), d(9, 1)])
    const quarter = periodOf('quarter', now)
    expect([quarter.start, quarter.end, quarter.prevStart, quarter.prevEnd]).toEqual([d(8, 1), d(11, 1), d(5, 1), d(8, 1)])
    expect(month.previousLabel).toBe('respecto al mes anterior')
  })

  it('personalizado: ambos días incluidos y se compara con los mismos días justo antes', () => {
    const p = periodOf('custom', null, { from: '2026-09-10', to: '2026-09-19' })
    expect([p.start, p.end, p.prevStart, p.prevEnd]).toEqual([d(9, 10), d(9, 20), d(8, 31), d(9, 10)])
    expect(validateCustom({ from: '2026-09-10', to: '2026-09-01' })).toBe('La fecha final es anterior a la inicial.')
    expect(validateCustom({ from: '2024-01-01', to: '2026-09-01' })).toBe('Elige como mucho 2 años.')
    expect(validateCustom({ from: '', to: '2026-09-01' })).toBe('Elige las dos fechas.')
    expect(validateCustom({ from: '2026-09-01', to: '2026-09-01' })).toBeNull()
  })

  it('las flechas pasan al periodo anterior o siguiente del mismo tipo', () => {
    expect(shiftPeriod(periodOf('month', now), -1).start).toEqual(d(9, 1))
    expect(shiftPeriod(periodOf('quarter', now), 1).start).toEqual(d(11, 1))
    expect(shiftPeriod(periodOf('week', now), 1).start).toEqual(d(10, 5))
    const custom = shiftPeriod(periodOf('custom', null, { from: '2026-09-10', to: '2026-09-19' }), 1)
    expect([custom.start, custom.end]).toEqual([d(9, 20), d(9, 30)])
    expect(isCurrentPeriod(periodOf('month', now), now)).toBe(true)
    expect(isCurrentPeriod(shiftPeriod(periodOf('month', now), -1), now)).toBe(false)
  })

  it('nombres de los periodos', () => {
    expect(periodLabel(periodOf('week', now))).toBe('28 de septiembre – 4 de octubre 2026')
    expect(periodLabel(periodOf('month', now))).toBe('octubre 2026')
    expect(periodLabel(periodOf('quarter', now))).toBe('agosto – octubre 2026')
    expect(periodLabel(periodOf('custom', null, { from: '2026-09-10', to: '2026-09-19' }))).toBe('10–19 de septiembre 2026')
  })
})

describe('resumen de un periodo', () => {
  const contacts = [
    { id: 'ana', name: 'Ana', teamProfile: { area: 'Producción' } },
    { id: 'luis', name: 'Luis', teamProfile: { area: 'Técnica' } },
    { id: 'eva', name: 'Eva' },
    { id: 'pau', name: 'Pau', teamProfile: { area: '' } },
  ]
  const events = [
    meeting(d(9, 7, 9), d(9, 7, 10), { participantIds: ['ana', 'luis'] }), // lunes
    meeting(d(9, 14, 9, 30), d(9, 14, 11), { participantIds: ['ana', 'eva'] }), // lunes
    meeting(d(9, 16, 16), d(9, 16, 17), { participantIds: ['eva'] }), // miércoles
    meeting(d(9, 17, 12), d(9, 17, 13), { participantIds: ['pau'] }), // jueves
    meeting(d(9, 18, 22), d(9, 18, 23)), // viernes, tarde: amplía las franjas
    meeting(d(9, 21, 9), d(9, 21, 11), { isUnavailable: true }), // no cuenta
    meeting(d(9, 22, 9), d(9, 22, 10), { provisional: true }), // no cuenta
    meeting(d(8, 20, 9), d(8, 20, 10)), // mes anterior
  ]
  const period = periodOf('month', d(9, 15))
  const report = computeReport(events, { ...period, workingHours, contacts })

  it('suma el mes y lo compara con el anterior (sin "No disponible" ni provisionales)', () => {
    expect(report.count).toBe(5)
    expect(report.meetingMs).toBe(5.5 * H)
    expect(report.days).toHaveLength(30)
    expect(report.delta).toMatchObject({ count: 4, meetingMs: 4.5 * H })
  })

  it('reparte por departamento: cada reunión en cada uno de sus departamentos', () => {
    expect(report.byDepartment.map((r) => [r.label, r.count, r.ms / H])).toEqual([
      ['Producción', 2, 2.5],
      [NO_DEPARTMENT_LABEL, 2, 2],
      ['Sin departamento', 1, 1],
      ['Técnica', 1, 1],
    ])
  })

  it('departamento del día de la reunión según la trayectoria; un antiguo miembro, solo hasta su salida', () => {
    const roles = [
      { id: 'r1', role: 'Locutora', area: 'Radio', start: '2025-01-01', end: '2026-09-10' },
      { id: 'r2', role: 'Editora', area: 'Media', start: '2026-09-11', end: '2026-09-20' },
    ]
    const team = [{ id: 'bea', name: 'Bea', teamProfile: { status: 'former', leftAt: '2026-09-20', area: 'Media', roles } }]
    const list = [
      meeting(d(9, 8, 9), d(9, 8, 10), { participantIds: ['bea'] }), // Radio
      meeting(d(9, 15, 9), d(9, 15, 10), { participantIds: ['bea'] }), // Media
      meeting(d(9, 24, 9), d(9, 24, 10), { participantIds: ['bea'] }), // ya había salido
    ]
    const r = computeReport(list, { ...period, workingHours, contacts: team })
    expect(r.byDepartment.map((row) => [row.label, row.count])).toEqual([
      ['Media', 1],
      ['Radio', 1],
      [NO_DEPARTMENT_LABEL, 1],
    ])
    expect(r.byPerson.map((row) => [row.label, row.count])).toEqual([['Bea', 3]])
  })

  it('todas las personas, no solo las 5 primeras', () => {
    expect(report.byPerson.map((r) => [r.label, r.count])).toEqual([
      ['Ana', 2],
      ['Eva', 2],
      ['Luis', 1],
      ['Pau', 1],
    ])
  })

  it('días de la semana y franjas horarias más cargados', () => {
    expect(report.byWeekday.map((r) => r.ms / H)).toEqual([2.5, 0, 1, 1, 1, 0, 0])
    expect(report.busiestWeekdayIndex).toBe(0)
    expect(report.byHour[0].hour).toBe(7)
    expect(report.byHour.at(-1).hour).toBe(22)
    const at = (h) => report.byHour.find((r) => r.hour === h)
    expect(at(9).ms / H).toBe(1.5)
    expect(at(10).ms / H).toBe(1)
    expect(at(9).meetings).toBe(2)
    expect(report.byHour[report.busiestHourIndex].hour).toBe(9)
  })
})

describe('evolución', () => {
  const events = [
    meeting(d(9, 28, 9), d(9, 28, 11)),
    meeting(d(9, 29, 9), d(9, 29, 10)),
    meeting(d(9, 22, 9), d(9, 22, 10)),
    meeting(d(9, 23, 9), d(9, 23, 10), { isUnavailable: true }),
    meeting(d(7, 1, 9), d(7, 1, 10)),
  ]

  it('por semanas, terminando en la semana elegida', () => {
    const weeks = meetingEvolution(events, { unit: 'week', until: d(10, 4), count: 12 })
    expect(weeks).toHaveLength(12)
    expect(weeks.at(-1).start).toEqual(d(9, 28))
    expect(weeks.at(-1)).toMatchObject({ ms: 3 * H, meetings: 2 })
    expect(weeks.at(-2)).toMatchObject({ ms: 1 * H, meetings: 1 })
  })

  it('por meses', () => {
    const months = meetingEvolution(events, { unit: 'month', until: d(10, 4), count: 6 })
    expect(months.map((m) => m.start.getMonth() + 1)).toEqual([5, 6, 7, 8, 9, 10])
    expect(months.map((m) => m.ms / H)).toEqual([0, 0, 1, 0, 4, 0])
  })
})
