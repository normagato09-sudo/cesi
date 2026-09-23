import { describe, expect, it } from 'vitest'
import { cleanWeek, emptyWeek, normalizeWeek, slotIntervalsOn, validateWeek } from './weeklySchedule'
import { computeSummary } from './summary'

function week(slotsByDay) {
  return emptyWeek().map((e) => (slotsByDay[e.day] ? { ...e, enabled: true, slots: slotsByDay[e.day] } : e))
}

describe('horario semanal', () => {
  it('convierte el formato antiguo de una franja por día', () => {
    const legacy = [0, 1, 2, 3, 4, 5, 6].map((day) => ({ day, enabled: day === 1, start: '09:00', end: '18:00' }))
    const w = normalizeWeek(legacy)
    expect(w[1]).toEqual({ day: 1, enabled: true, slots: [{ start: '09:00', end: '18:00' }] })
    expect(w[0].enabled).toBe(false)
  })

  it('valida franjas solapadas o invertidas', () => {
    expect(validateWeek(week({ 1: [{ start: '09:00', end: '14:00' }, { start: '13:00', end: '18:00' }] }))).toMatch(/se solapan/)
    expect(validateWeek(week({ 2: [{ start: '12:00', end: '10:00' }] }))).toMatch(/terminar después/)
    expect(validateWeek(week({ 3: [{ start: '09:00', end: '14:00' }, { start: '16:00', end: '19:00' }] }))).toBeNull()
  })

  it('ordena las franjas al limpiar y da intervalos por fecha', () => {
    const w = cleanWeek(week({ 3: [{ start: '16:00', end: '19:00' }, { start: '09:00', end: '14:00' }] }))
    const wednesday = new Date(2026, 8, 23)
    const intervals = slotIntervalsOn(w, wednesday)
    expect(intervals.map((i) => [i.start.getHours(), i.end.getHours()])).toEqual([
      [9, 14],
      [16, 19],
    ])
  })

  it('el resumen suma el tiempo libre de todas las franjas del día', () => {
    const w = week({ 3: [{ start: '09:00', end: '14:00' }, { start: '16:00', end: '19:00' }] })
    const events = [{ id: 'a', start: '2026-09-23T10:00:00', end: '2026-09-23T11:00:00', recurrence: null }]
    const summary = computeSummary(events, w, new Date(2026, 8, 23, 8, 0))
    expect(summary.today.occupiedMs).toBe(60 * 60000)
    expect(summary.today.freeMs).toBe(7 * 60 * 60000)
  })
})
