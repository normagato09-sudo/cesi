import { beforeEach, describe, expect, it } from 'vitest'
import {
  declareWeek,
  declaredWeekFor,
  getAllWeeklyAvailability,
  pendingDeclaration,
  previousWeekSchedule,
  revertToHabitual,
  saveWeeklyAvailability,
  scheduleFor,
  scheduleSourceText,
  weekKeyOf,
  weekRangeLabel,
} from './weeklyAvailability'
import { emptyWeek } from './weeklySchedule'
import { findSlots } from './findSlots'
import { computeWeeklyReport } from './weeklyReport'
import { computeSummary } from './summary'
import { buildBackup, parseBackup, restoreBackup } from './backup'

// Semana del lunes 21 al domingo 27 de septiembre de 2026 y la siguiente (28 sep – 4 oct).
const d = (month, day, h = 0, m = 0) => new Date(2026, month - 1, day, h, m)
const H = 3600000
const hhmm = (date) => `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`
const dayOf = (date) => `${date.getDate()}/${date.getMonth() + 1}`

function week(slotsByDay) {
  return emptyWeek().map((e) => (slotsByDay[e.day] ? { ...e, enabled: true, slots: slotsByDay[e.day] } : e))
}

// Horario habitual: de lunes a viernes, de 09:00 a 14:00.
const nineToTwo = [{ start: '09:00', end: '14:00' }]
const HABITUAL = week({ 1: nineToTwo, 2: nineToTwo, 3: nineToTwo, 4: nineToTwo, 5: nineToTwo })

// Semana del 28 sep declarada: lunes por la tarde, martes desactivado, miércoles y jueves por la
// mañana, viernes desactivado y el sábado por la mañana.
const DECLARED = week({
  1: [{ start: '16:00', end: '18:00' }],
  3: [{ start: '10:00', end: '12:00' }],
  4: [{ start: '10:00', end: '12:00' }],
  6: [{ start: '10:00', end: '11:00' }],
})
const weeks = declareWeek([], '2026-09-28', DECLARED, d(9, 26))

beforeEach(() => localStorage.clear())

describe('semana declarada', () => {
  it('sustituye al horario habitual solo esos 7 días', () => {
    expect(weekKeyOf(d(10, 4, 20))).toBe('2026-09-28') // domingo 4 oct → semana del 28 sep
    expect(scheduleFor(d(9, 30), HABITUAL, weeks)).toEqual(DECLARED)
    expect(scheduleFor(d(9, 25), HABITUAL, weeks)).toBe(HABITUAL)
    expect(scheduleFor(d(10, 5), HABITUAL, weeks)).toBe(HABITUAL)
    expect(weekRangeLabel('2026-09-28')).toBe('28 sep – 4 oct')
  })

  it('una búsqueda que cruza una semana normal y una declarada aplica el horario de cada día', () => {
    const slots = findSlots({
      durationMinutes: 60,
      fromDate: d(9, 24),
      toDate: d(10, 5),
      events: [],
      workingHours: HABITUAL,
      weeklyAvailability: weeks,
      now: d(9, 24, 8),
    })
    expect(slots.map((s) => `${dayOf(s.start)} ${hhmm(s.start)}`)).toEqual([
      '24/9 09:00', // jueves y viernes: horario habitual
      '25/9 09:00',
      '28/9 16:00', // lunes declarado por la tarde
      '30/9 10:00', // (martes 29 desactivado en la semana declarada)
      '1/10 10:00',
      '3/10 10:00', // sábado declarado (en el habitual no se trabaja)
      '5/10 09:00', // la semana siguiente vuelve el habitual
    ])
  })

  it('un día desactivado en la semana declarada no tiene huecos aunque el habitual sí', () => {
    const tuesday = d(9, 29)
    const params = { durationMinutes: 60, fromDate: tuesday, toDate: tuesday, events: [], workingHours: HABITUAL, now: d(9, 24) }
    expect(findSlots(params)).toHaveLength(1)
    expect(findSlots({ ...params, weeklyAvailability: weeks })).toEqual([])
  })

  it('"Volver al horario habitual" borra la declaración de esa semana', () => {
    const reverted = revertToHabitual(weeks, '2026-09-28', d(9, 27))
    expect(reverted).toHaveLength(1)
    expect(declaredWeekFor(d(9, 30), reverted)).toBeNull()
    expect(scheduleFor(d(9, 29), HABITUAL, reverted)).toBe(HABITUAL)
    // Volver a declararla reutiliza el mismo documento (un id fijo por semana).
    const again = declareWeek(reverted, '2026-09-28', DECLARED)
    expect(again.map((w) => w.id)).toEqual(['wk_2026-09-28'])
  })
})

describe('"Copiar la semana anterior"', () => {
  it('copia la semana anterior declarada', () => {
    expect(previousWeekSchedule('2026-10-05', HABITUAL, weeks)).toEqual(DECLARED)
  })

  it('si la anterior no estaba declarada, copia el horario habitual', () => {
    expect(previousWeekSchedule('2026-09-28', HABITUAL, weeks)).toBe(HABITUAL)
  })
})

describe('horas libres con semana declarada', () => {
  it('el resumen semanal usa la semana declarada y la anterior con el habitual', () => {
    const events = [
      { id: 'm1', title: 'Reunión', category: 'Reunión', start: d(9, 30, 10).toISOString(), end: d(9, 30, 11).toISOString(), recurrence: null },
    ]
    const report = computeWeeklyReport(events, { weekStart: d(9, 28), workingHours: HABITUAL, weeklyAvailability: weeks })
    // Declarada: 2 + 2 + 2 + 1 = 7 h, menos la reunión de 1 h del miércoles.
    expect(report.freeMs).toBe(6 * H)
    // Semana anterior con el habitual: 25 h.
    expect(report.previous.freeMs).toBe(25 * H)
  })

  it('las horas libres de hoy en la barra lateral usan la semana declarada', () => {
    expect(computeSummary([], HABITUAL, d(9, 28, 8), weeks).today.freeMs).toBe(2 * H)
    expect(computeSummary([], HABITUAL, d(9, 28, 8)).today.freeMs).toBe(5 * H)
  })
})

describe('texto de Buscar hueco', () => {
  it('dice si usa la disponibilidad declarada', () => {
    expect(scheduleSourceText(d(9, 28), d(10, 2), weeks)).toBe('Usando tu disponibilidad de la semana del 28 sep.')
    expect(scheduleSourceText(d(9, 24), d(10, 1), weeks)).toBe(
      'Usando tu disponibilidad de la semana del 28 sep y tu horario habitual el resto de días.',
    )
    expect(scheduleSourceText(d(9, 21), d(9, 25), weeks)).toBeNull()
  })
})

describe('aviso del domingo', () => {
  it('de lunes a sábado no avisa por la semana que viene', () => {
    const saturday = d(9, 26, 10)
    // La semana en curso (21 sep) sin declarar sí se avisa; declarada, no.
    expect(pendingDeclaration(saturday, []).key).toBe('2026-09-21')
    const current = declareWeek([], '2026-09-21', HABITUAL)
    expect(pendingDeclaration(saturday, current)).toBeNull()
  })

  it('el domingo avisa de la semana que viene si no está declarada', () => {
    const sunday = d(9, 27, 18)
    expect(pendingDeclaration(sunday, [])).toMatchObject({ key: '2026-09-28', next: true })
    expect(pendingDeclaration(sunday, weeks)).toBeNull()
  })

  it('si el lunes sigue sin declarar, el aviso se mantiene para la semana en curso', () => {
    expect(pendingDeclaration(d(9, 28, 9), [])).toMatchObject({ key: '2026-09-28', next: false })
    expect(pendingDeclaration(d(10, 5, 9), weeks)).toMatchObject({ key: '2026-10-05', next: false })
  })

  it('"Usar mi horario habitual" descarta el aviso de esa semana', () => {
    const dismissed = revertToHabitual([], '2026-09-28')
    expect(pendingDeclaration(d(9, 27, 18), dismissed)).toBeNull()
    expect(pendingDeclaration(d(9, 29, 9), dismissed)).toBeNull()
    // La semana siguiente vuelve a avisar.
    expect(pendingDeclaration(d(10, 4, 18), dismissed)).toMatchObject({ key: '2026-10-05' })
  })
})

describe('copia de seguridad', () => {
  it('incluye la disponibilidad semanal y acepta copias antiguas sin ella', () => {
    saveWeeklyAvailability(weeks)
    const backup = buildBackup()
    expect(backup.weeklyAvailability).toHaveLength(1)
    localStorage.clear()
    restoreBackup(parseBackup(JSON.stringify(backup)))
    expect(getAllWeeklyAvailability()[0].week).toEqual(DECLARED)
    restoreBackup(parseBackup(JSON.stringify({ app: 'cesi', version: 7, events: [], contacts: [] })))
    expect(getAllWeeklyAvailability()).toEqual([])
  })
})
