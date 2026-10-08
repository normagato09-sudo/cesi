import { describe, expect, it } from 'vitest'
import { allDayRangeText, allDaySpanDays, dayOffTitle, daysOff, isMarkedDayOff, unavailableKindOf } from './unavailableKinds'
import { unavailableNoteOf, unavailableTitle } from './unavailableKinds'

const day = (m, d) => new Date(2026, m - 1, d)
const allDay = (from, toExclusive, extra = {}) => ({ id: 'x', isUnavailable: true, allDay: true, start: from, end: toExclusive, ...extra })

describe('tipos de franja "No disponible"', () => {
  it('vacaciones y festivo solo en las de todo el día; las antiguas y las de horas, Otro', () => {
    expect(unavailableKindOf(allDay(day(12, 22), day(12, 23), { unavailableKind: 'vacation' }))).toBe('vacation')
    expect(unavailableKindOf(allDay(day(12, 25), day(12, 26), { unavailableKind: 'holiday' }))).toBe('holiday')
    expect(unavailableKindOf(allDay(day(12, 22), day(12, 23)))).toBe('other')
    expect(unavailableKindOf({ isUnavailable: true, allDay: false, unavailableKind: 'vacation' })).toBe('other')
    expect(unavailableKindOf({ title: 'Reunión', unavailableKind: 'vacation' })).toBe('other')
    expect(isMarkedDayOff(allDay(day(12, 25), day(12, 26), { unavailableKind: 'holiday' }))).toBe(true)
  })

  it('título con la nota opcional', () => {
    expect(dayOffTitle('vacation', '  Navidad ')).toBe('Vacaciones: Navidad')
    expect(dayOffTitle('holiday', '')).toBe('Festivo')
  })

  it('días que ocupa y texto del rango', () => {
    const navidad = allDay(day(12, 22), new Date(2027, 0, 7))
    expect(allDaySpanDays(navidad)).toBe(16)
    expect(allDayRangeText(navidad)).toBe('del 22 de diciembre al 6 de enero')
    expect(allDayRangeText(allDay(day(12, 25), day(12, 26)))).toBe('viernes, 25 de diciembre')
  })

  it('días de vacaciones o festivo de un periodo, sin título ni nota', () => {
    const occurrences = [
      allDay(day(12, 22), day(12, 26), { unavailableKind: 'vacation', title: 'Vacaciones: Navidad', unavailableNote: 'Navidad' }),
      allDay(day(12, 25), day(12, 26), { unavailableKind: 'holiday' }),
      allDay(day(12, 28), day(12, 29), { unavailableKind: 'holiday' }),
      allDay(day(12, 29), day(12, 30)), // Otro: no se publica
    ]
    expect(daysOff(occurrences, day(12, 23), day(12, 28))).toEqual([
      { date: '2026-12-23', kind: 'vacation' },
      { date: '2026-12-24', kind: 'vacation' },
      { date: '2026-12-25', kind: 'vacation' },
      { date: '2026-12-28', kind: 'holiday' },
    ])
  })
})

describe('nota de las franjas (sin campo Motivo)', () => {
  it('la nota guardada o, en las antiguas sin nota, su motivo', () => {
    expect(unavailableNoteOf({ isUnavailable: true, title: 'No disponible: Comida' })).toBe('Comida')
    expect(unavailableNoteOf({ isUnavailable: true, title: 'No disponible: Comida', unavailableNote: 'Médico' })).toBe('Médico')
    expect(unavailableNoteOf({ isUnavailable: true, title: 'No disponible' })).toBe('')
    expect(unavailableNoteOf({ isUnavailable: true, allDay: true, unavailableKind: 'vacation', title: 'Vacaciones' })).toBe('')
    expect(unavailableNoteOf({ isUnavailable: false, title: 'No disponible: x' })).toBe('')
  })

  it('el título sale del tipo y la nota', () => {
    expect(unavailableTitle('other', '  Comida ')).toBe('No disponible: Comida')
    expect(unavailableTitle('other', '')).toBe('No disponible')
    expect(unavailableTitle('holiday', 'Navidad')).toBe('Festivo: Navidad')
  })
})
