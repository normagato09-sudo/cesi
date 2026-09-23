import { describe, expect, it } from 'vitest'
import { findSlots } from './findSlots'
import { emptyWeek } from './weeklySchedule'
import { intersectIntervals, subtractIntervals } from './intervals'

const WED = new Date(2026, 8, 23) // miércoles 23/09/2026
const NOW = new Date(2026, 8, 22, 12, 0)

function at(day, h, m = 0) {
  const d = new Date(day)
  d.setHours(h, m, 0, 0)
  return d
}

function ev(id, day, startH, endH, extra = {}) {
  const toDate = (h) => at(day, Math.floor(h), Math.round((h % 1) * 60))
  return { id, title: id, start: toDate(startH).toISOString(), end: toDate(endH).toISOString(), recurrence: null, ...extra }
}

function week(slotsByDay) {
  return emptyWeek().map((e) => (slotsByDay[e.day] ? { ...e, enabled: true, slots: slotsByDay[e.day] } : e))
}

const hhmm = (d) => `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
const WORKDAYS = week({ 1: [{ start: '09:00', end: '18:00' }], 2: [{ start: '09:00', end: '18:00' }], 3: [{ start: '09:00', end: '18:00' }], 4: [{ start: '09:00', end: '18:00' }], 5: [{ start: '09:00', end: '18:00' }] })

describe('intervalos', () => {
  it('intersecta y resta', () => {
    const a = [{ start: at(WED, 9), end: at(WED, 14) }]
    const b = [{ start: at(WED, 12), end: at(WED, 18) }]
    expect(intersectIntervals(a, b).map((i) => [hhmm(i.start), hhmm(i.end)])).toEqual([['12:00', '14:00']])
    expect(subtractIntervals(a, b).map((i) => [hhmm(i.start), hhmm(i.end)])).toEqual([['09:00', '12:00']])
  })
})

describe('findSlots estricto', () => {
  const base = { durationMinutes: 60, fromDate: WED, toDate: WED, now: NOW, events: [], workingHours: WORKDAYS }

  it('solo propone huecos dentro del horario habitual', () => {
    const slots = findSlots({ ...base, events: [ev('a', WED, 9, 17.5)] })
    expect(slots).toEqual([])
  })

  it('no propone nada en días sin horario (fin de semana)', () => {
    const sat = new Date(2026, 8, 26)
    expect(findSlots({ ...base, fromDate: sat, toDate: sat })).toEqual([])
  })

  it('usa todas las franjas del día', () => {
    const split = week({ 3: [{ start: '09:00', end: '14:00' }, { start: '16:00', end: '19:00' }] })
    const slots = findSlots({ ...base, workingHours: split, events: [ev('a', WED, 9, 13.5)] })
    // 13:30–14:00 no llega a una hora; el siguiente hueco es a las 16:00.
    expect(slots.map((s) => hhmm(s.start))).toEqual(['16:00'])
  })

  it('aplica el filtro horario opcional además del horario', () => {
    const slots = findSlots({ ...base, minTime: '15:00', maxTime: '20:00' })
    expect(slots.map((s) => [hhmm(s.start), hhmm(s.end)])).toEqual([['15:00', '16:00']])
  })

  it('no propone horas pasadas y alinea al siguiente cuarto de hora', () => {
    const slots = findSlots({ ...base, now: at(WED, 10, 7) })
    expect(hhmm(slots[0].start)).toBe('10:15')
  })

  it('ignora el día entero marcado como no disponible', () => {
    const allDay = { id: 'x', start: at(WED, 0).toISOString(), end: at(new Date(2026, 8, 24), 0).toISOString(), allDay: true, isUnavailable: true, recurrence: null }
    expect(findSlots({ ...base, events: [allDay] })).toEqual([])
  })
})

describe('findSlots: margen entre reuniones', () => {
  const base = { durationMinutes: 60, fromDate: WED, toDate: WED, now: NOW, workingHours: WORKDAYS, minTime: '09:00', maxTime: '13:00' }

  it('sin margen propone el hueco justo al acabar una reunión', () => {
    const slots = findSlots({ ...base, events: [ev('a', WED, 9, 10)] })
    expect(hhmm(slots[0].start)).toBe('10:00')
  })

  it('con margen deja tiempo libre antes y después', () => {
    const slots = findSlots({ ...base, events: [ev('a', WED, 9, 10), ev('b', WED, 11.5, 12)], bufferMinutes: 15 })
    // 10:15–11:15 cabe (termina 15 min antes de las 11:30); 12:15–13:00 no llega a 1 h.
    expect(slots.map((s) => hhmm(s.start))).toEqual(['10:15'])
  })
})
