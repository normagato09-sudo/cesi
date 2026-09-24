import { describe, expect, it } from 'vitest'
import { computeWeeklyReport, formatCountDelta, formatHours, formatMsDelta, weekStartOf } from './weeklyReport'

// Semana del lunes 21 al domingo 27 de septiembre de 2026.
const d = (day, hh, mm = 0) => new Date(2026, 8, day, hh, mm)
const H = 3600000

// Horario: de lunes a viernes de 09:00 a 14:00 (5 h al día, 25 h a la semana).
const workingHours = [0, 1, 2, 3, 4, 5, 6].map((day) => ({
  day,
  enabled: day >= 1 && day <= 5,
  slots: [{ start: '09:00', end: '14:00' }],
}))

const contacts = [
  { id: 'ana', name: 'Ana', groupIds: ['prof'] },
  { id: 'luis', name: 'Luis', groupIds: ['prof', 'equipo'] },
  { id: 'eva', name: 'Eva', groupIds: [] },
]
const groups = [
  { id: 'prof', name: 'Profesores', color: '#2563eb' },
  { id: 'equipo', name: 'Equipo', color: '#16a34a' },
]

let n = 0
function meeting(day, from, to, extra = {}) {
  n += 1
  return {
    id: `m${n}`,
    title: `Reunión ${n}`,
    category: 'Reunión',
    tags: [],
    participantIds: [],
    guests: [],
    recurrence: null,
    start: d(day, ...from).toISOString(),
    end: d(day, ...to).toISOString(),
    ...extra,
  }
}

const events = [
  meeting(21, [9], [10], { category: 'Cliente', tags: ['Entrevista'], participantIds: ['ana', 'luis'] }),
  meeting(21, [9, 30], [10, 30], { participantIds: ['luis'] }), // se solapa 30 min con la anterior
  meeting(23, [10], [12], { tags: ['entrevista', 'Proyecto X'], participantIds: ['eva', 'luis'] }),
  meeting(25, [16], [17]), // fuera del horario
  meeting(22, [9], [11], { isUnavailable: true, category: 'No disponible' }),
  meeting(24, [9], [10], { provisional: true, proposalId: 'p1' }),
  // Semana anterior: 1 reunión de 1 h
  meeting(15, [9], [10]),
]

const report = computeWeeklyReport(events, { weekStart: weekStartOf(d(24, 12)), workingHours, contacts, groups })

describe('resumen semanal', () => {
  it('cuenta solo las reuniones (sin bloques "No disponible" ni opciones provisionales)', () => {
    expect(report.count).toBe(4)
    expect(report.meetings.map((m) => m.title)).toEqual(['Reunión 1', 'Reunión 2', 'Reunión 3', 'Reunión 4'])
  })

  it('suma las horas en reuniones sin contar dos veces los solapes', () => {
    // 9:00–10:30 el lunes (1,5 h) + 2 h el miércoles + 1 h el viernes
    expect(report.meetingMs).toBe(4.5 * H)
  })

  it('calcula las horas libres dentro de mi horario', () => {
    // 25 h de horario − 1,5 h (lunes) − 2 h "No disponible" (martes) − 2 h (miércoles) = 19,5 h
    expect(report.freeMs).toBe(19.5 * H)
  })

  it('reparte las horas por día y marca el día más cargado', () => {
    expect(report.days.map((day) => day.ms / H)).toEqual([1.5, 0, 2, 0, 1, 0, 0])
    expect(report.busiestDayIndex).toBe(2)
  })

  it('compara con la semana anterior', () => {
    expect(report.previous).toEqual({ count: 1, meetingMs: 1 * H, freeMs: 24 * H })
    expect(report.delta).toEqual({ count: 3, meetingMs: 3.5 * H, freeMs: -4.5 * H })
    expect(formatCountDelta(report.delta.count)).toBe('+3')
    expect(formatMsDelta(report.delta.meetingMs)).toBe('+3 h 30 min')
    expect(formatMsDelta(report.delta.freeMs)).toBe('−4 h 30 min')
    expect(formatCountDelta(0)).toBe('=')
  })

  it('reparte por categoría y por etiqueta (sin distinguir mayúsculas)', () => {
    expect(report.byCategory.map((r) => [r.label, r.count, r.ms / H])).toEqual([
      ['Reunión', 3, 4],
      ['Cliente', 1, 1],
    ])
    expect(report.byTag.map((r) => [r.label, r.count, r.ms / H])).toEqual([
      ['Entrevista', 2, 3],
      ['Proyecto X', 1, 2],
    ])
  })

  it('reparte por grupo de contactos y ordena los contactos con más reuniones', () => {
    expect(report.byGroup.map((r) => [r.label, r.count, r.ms / H])).toEqual([
      ['Equipo', 3, 4],
      ['Profesores', 3, 4],
    ])
    expect(report.topContacts.map((r) => [r.label, r.count])).toEqual([
      ['Luis', 3],
      ['Eva', 1],
      ['Ana', 1],
    ])
  })

  it('una semana vacía no tiene día más cargado', () => {
    const empty = computeWeeklyReport([], { weekStart: weekStartOf(d(24, 12)), workingHours })
    expect([empty.count, empty.meetingMs, empty.freeMs / H, empty.busiestDayIndex]).toEqual([0, 0, 25, null])
  })

  it('formatea las horas con coma decimal', () => {
    expect(formatHours(4.5 * H)).toBe('4,5 h')
    expect(formatHours(2 * H)).toBe('2 h')
  })
})
