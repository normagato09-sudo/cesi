import { describe, expect, it } from 'vitest'
import { UNAVAILABLE_KINDS, allDayRangeText, allDaySpanDays, daysOff, eventTitle, isMarkedDayOff, unavailableKindOf } from './unavailableKinds'
import { unavailableNoteOf, unavailableTitle } from './unavailableKinds'

const day = (m, d) => new Date(2026, m - 1, d)
const allDay = (from, toExclusive, extra = {}) => ({ id: 'x', isUnavailable: true, allDay: true, start: from, end: toExclusive, ...extra })

describe('tipos de franja "No disponible"', () => {
  it('solo Vacaciones y Otro; los antiguos festivos funcionan como vacaciones', () => {
    expect(UNAVAILABLE_KINDS.map((k) => k.label)).toEqual(['Vacaciones', 'Otro'])
    expect(unavailableKindOf(allDay(day(12, 22), day(12, 23), { unavailableKind: 'vacation' }))).toBe('vacation')
    expect(unavailableKindOf(allDay(day(12, 25), day(12, 26), { unavailableKind: 'holiday' }))).toBe('vacation')
    expect(unavailableKindOf(allDay(day(12, 22), day(12, 23)))).toBe('other')
    expect(unavailableKindOf({ isUnavailable: true, allDay: false, unavailableKind: 'vacation' })).toBe('other')
    expect(unavailableKindOf({ title: 'Reunión', unavailableKind: 'vacation' })).toBe('other')
    expect(isMarkedDayOff(allDay(day(12, 25), day(12, 26), { unavailableKind: 'holiday' }))).toBe(true)
  })

  it('el título que se ve sale del tipo, sin nota (lo guardado no cambia)', () => {
    expect(eventTitle(allDay(day(12, 25), day(12, 26), { unavailableKind: 'holiday', title: 'Festivo: Navidad', unavailableNote: 'Navidad' }))).toBe('Vacaciones')
    expect(eventTitle({ isUnavailable: true, allDay: false, title: 'No disponible: Comida' })).toBe('No disponible')
    expect(eventTitle({ title: 'Kickoff' })).toBe('Kickoff')
  })

  it('días que ocupa y texto del rango', () => {
    const navidad = allDay(day(12, 22), new Date(2027, 0, 7))
    expect(allDaySpanDays(navidad)).toBe(16)
    expect(allDayRangeText(navidad)).toBe('del 22 de diciembre al 6 de enero')
    expect(allDayRangeText(allDay(day(12, 25), day(12, 26)))).toBe('viernes, 25 de diciembre')
  })

  it('días de vacaciones (también los antiguos festivos) de un periodo, sin título ni nota', () => {
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
      { date: '2026-12-28', kind: 'vacation' },
    ])
  })
})

describe('nota de las franjas (ya no se muestra, pero se conserva)', () => {
  it('la nota guardada o, en las antiguas sin nota, su motivo', () => {
    expect(unavailableNoteOf({ isUnavailable: true, title: 'No disponible: Comida' })).toBe('Comida')
    expect(unavailableNoteOf({ isUnavailable: true, title: 'No disponible: Comida', unavailableNote: 'Médico' })).toBe('Médico')
    expect(unavailableNoteOf({ isUnavailable: true, title: 'No disponible' })).toBe('')
    expect(unavailableNoteOf({ isUnavailable: true, allDay: true, unavailableKind: 'vacation', title: 'Vacaciones' })).toBe('')
    expect(unavailableNoteOf({ isUnavailable: false, title: 'No disponible: x' })).toBe('')
  })

  it('el título sale solo del tipo', () => {
    expect(unavailableTitle('other')).toBe('No disponible')
    expect(unavailableTitle('vacation')).toBe('Vacaciones')
  })
})
