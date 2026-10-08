import { beforeEach, describe, expect, it } from 'vitest'
import { getAllWeeklyAvailability, latestDeclaredWeek, saveWeeklyAvailability, weekRangeLabel } from './weeklyAvailability'
import { copyDay, emptyWeek } from './weeklySchedule'
import { findSlots } from './findSlots'
import { computeWeeklyReport } from './weeklyReport'
import { computeSummary } from './summary'
import { buildBackup, parseBackup, restoreBackup } from './backup'

const d = (month, day, h = 0, m = 0) => new Date(2026, month - 1, day, h, m)
const H = 3600000
const hhmm = (date) => `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`
const dayOf = (date) => `${date.getDate()}/${date.getMonth() + 1}`

function week(slotsByDay) {
  return emptyWeek().map((e) => (slotsByDay[e.day] ? { ...e, enabled: true, slots: slotsByDay[e.day] } : e))
}

// Mi horario: de lunes a viernes, de 09:00 a 14:00.
const nineToTwo = [{ start: '09:00', end: '14:00' }]
const MINE = week({ 1: nineToTwo, 2: nineToTwo, 3: nineToTwo, 4: nineToTwo, 5: nineToTwo })

// Semanas declaradas antiguas (ya no se usan, pero se conservan).
const DECLARED = week({ 1: [{ start: '16:00', end: '18:00' }], 6: [{ start: '10:00', end: '11:00' }] })
const doc = (key, w, extra = {}) => ({ id: `wk_${key}`, weekStart: key, week: w, dismissed: false, ...extra })
const weeks = [
  doc('2026-09-21', MINE),
  doc('2026-09-28', DECLARED),
  doc('2026-10-05', null, { dismissed: true }), // "Usar mi horario habitual": no está declarada
]

beforeEach(() => localStorage.clear())

describe('un solo horario para todas las semanas', () => {
  it('Buscar hueco usa mi horario todas las semanas, aunque haya semanas declaradas antiguas', () => {
    const slots = findSlots({ durationMinutes: 60, fromDate: d(9, 25), toDate: d(10, 5), events: [], workingHours: MINE, now: d(9, 24, 8) })
    expect(slots.map((s) => `${dayOf(s.start)} ${hhmm(s.start)}`)).toEqual([
      '25/9 09:00',
      '28/9 09:00',
      '29/9 09:00',
      '30/9 09:00',
      '1/10 09:00',
      '2/10 09:00',
      '5/10 09:00',
    ])
  })

  it('las horas libres del resumen y del informe salen de mi horario', () => {
    const events = [{ id: 'm1', title: 'Reunión', start: d(9, 30, 10).toISOString(), end: d(9, 30, 11).toISOString(), recurrence: null }]
    expect(computeWeeklyReport(events, { weekStart: d(9, 28), workingHours: MINE }).freeMs).toBe(24 * H)
    expect(computeSummary([], MINE, d(9, 28, 8)).today.freeMs).toBe(5 * H)
  })
})

describe('punto de partida de "Mi horario"', () => {
  it('es la última semana declarada (no las descartadas)', () => {
    expect(latestDeclaredWeek(weeks)).toEqual({ key: '2026-09-28', week: DECLARED })
    expect(latestDeclaredWeek([])).toBeNull()
    expect(weekRangeLabel('2026-09-28')).toBe('28 sep – 4 oct')
  })
})

describe('copiar un día a otros días', () => {
  it('copia sus franjas (y si está activo) y deja el resto igual', () => {
    const split = [{ start: '09:00', end: '13:00' }, { start: '15:00', end: '18:00' }]
    const start = week({ 1: split, 5: nineToTwo })
    const copied = copyDay(start, 1, [2, 3, 0])
    expect(copied.find((e) => e.day === 2)).toEqual({ day: 2, enabled: true, slots: split })
    expect(copied.find((e) => e.day === 0).slots).toEqual(split)
    expect(copied.find((e) => e.day === 5).slots).toEqual(nineToTwo)
    expect(copied.find((e) => e.day === 6).enabled).toBe(false)
    // Las franjas copiadas no se comparten con el original.
    expect(copied.find((e) => e.day === 2).slots[0]).not.toBe(split[0])
    // Copiar un día desactivado desactiva los de destino.
    expect(copyDay(start, 6, [5]).find((e) => e.day === 5).enabled).toBe(false)
  })
})

describe('copia de seguridad', () => {
  it('conserva las semanas declaradas antiguas y acepta copias sin ellas', () => {
    saveWeeklyAvailability(weeks)
    const backup = buildBackup()
    expect(backup.weeklyAvailability).toHaveLength(3)
    localStorage.clear()
    restoreBackup(parseBackup(JSON.stringify(backup)))
    expect(getAllWeeklyAvailability()[1].week).toEqual(DECLARED)
    restoreBackup(parseBackup(JSON.stringify({ app: 'cesi', version: 7, events: [], contacts: [] })))
    expect(getAllWeeklyAvailability()).toEqual([])
  })
})
