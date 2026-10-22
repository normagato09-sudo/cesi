import { describe, expect, it } from 'vitest'
import { DAY_END, SLOT_RULE, clampEnd, emptyWeek, isValidSlot, normalizeWeek, slotIntervalsOn, validateWeek } from './weeklySchedule'
import { findSlots } from './findSlots'
import { availabilityIntervals } from './contactAvailability'
import { bookingAvailability } from './bookings'
import { bookingDays, slotStarts } from './bookingPage'

// Ningún rango de hora pasa de las 23:59 del mismo día (en la zona de quien lo define).

const hhmm = (d) => `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
const span = (i) => `${i.start.getDate()} ${hhmm(i.start)}–${i.end.getDate()} ${hhmm(i.end)}`

function week(slotsByDay) {
  return emptyWeek().map((e) => (slotsByDay[e.day] ? { ...e, enabled: true, slots: slotsByDay[e.day] } : e))
}

// Lo que guardaban las versiones anteriores, tal cual (sin pasar por normalizeWeek).
function rawWeek(slotsByDay) {
  return week(slotsByDay).map((e) => ({ ...e, slots: e.slots.map((s) => ({ ...s })) }))
}

const MON = new Date(2026, 8, 21) // lunes 21/09/2026
const TUE = new Date(2026, 8, 22)
const BEFORE = new Date(2026, 8, 20, 12, 0)

const sameDay = (slot) => slot.start.getDate() === slot.end.getDate()

describe('fin a las 00:00 o a las 24:00 (datos guardados)', () => {
  it('se lee como 23:59 sin perder la franja', () => {
    expect(clampEnd('00:00')).toBe(DAY_END)
    expect(clampEnd('24:00')).toBe(DAY_END)
    expect(clampEnd('18:00')).toBe('18:00')
    const w = normalizeWeek(rawWeek({ 1: [{ start: '20:00', end: '24:00' }], 2: [{ start: '22:00', end: '00:00' }] }))
    expect(w[1]).toEqual({ day: 1, enabled: true, slots: [{ start: '20:00', end: '23:59' }] })
    expect(w[2].slots).toEqual([{ start: '22:00', end: '23:59' }])
    expect(validateWeek(w)).toBeNull()
  })

  it('los intervalos del día acaban a las 23:59 de ese día, también sin normalizar', () => {
    const raw = rawWeek({ 1: [{ start: '20:00', end: '24:00' }], 2: [{ start: '22:00', end: '00:00' }] })
    expect(slotIntervalsOn(raw, MON).map(span)).toEqual(['21 20:00–21 23:59'])
    expect(slotIntervalsOn(raw, TUE).map(span)).toEqual(['22 22:00–22 23:59'])
  })

  it('Buscar hueco no junta el lunes 24:00 con el martes 00:00', () => {
    const raw = rawWeek({ 1: [{ start: '23:00', end: '24:00' }], 2: [{ start: '00:00', end: '01:00' }] })
    const slots = findSlots({ durationMinutes: 60, fromDate: MON, toDate: TUE, now: BEFORE, events: [], workingHours: raw })
    expect(slots.map(span)).toEqual(['22 00:00–22 01:00'])
    expect(slots.every(sameDay)).toBe(true)
  })

  it('los huecos del enlace de reservas no cruzan la medianoche', () => {
    const raw = rawWeek({ 1: [{ start: '22:00', end: '24:00' }], 2: [{ start: '00:00', end: '02:00' }] })
    const pub = bookingAvailability({ rawEvents: [], workingHours: raw, horizonWeeks: 1, now: BEFORE, timeZone: 'Europe/Madrid' })
    const free = pub.free.map(([s, e]) => ({ start: new Date(s), end: new Date(e) }))
    expect(free.slice(0, 2).map(span)).toEqual(['21 22:00–21 23:59', '22 00:00–22 02:00'])
    expect(free.every(sameDay)).toBe(true)
  })
})

describe('fin anterior al inicio', () => {
  it('no es válido y el aviso lo explica', () => {
    expect(isValidSlot({ start: '18:00', end: '09:00' })).toBe(false)
    expect(isValidSlot({ start: '09:00', end: '09:00' })).toBe(false)
    expect(isValidSlot({ start: '09:00', end: '23:59' })).toBe(true)
    const problem = validateWeek(week({ 2: [{ start: '22:00', end: '01:00' }] }))
    expect(problem).toBe(`Martes: la franja 22:00–01:00 no es válida. ${SLOT_RULE}`)
    expect(SLOT_RULE).toMatch(/posterior al inicio/)
    expect(SLOT_RULE).toMatch(/23:59/)
  })

  it('Buscar hueco no usa un rango «hasta» anterior a «desde»', () => {
    const w = week({ 1: [{ start: '09:00', end: '18:00' }] })
    expect(findSlots({ durationMinutes: 30, fromDate: MON, toDate: MON, now: BEFORE, events: [], workingHours: w, minTime: '15:00', maxTime: '10:00' })).toEqual([])
  })
})

describe('reunión de 23:00 a 23:59', () => {
  const late = week({ 1: [{ start: '23:00', end: '23:59' }] })
  const base = { fromDate: MON, toDate: MON, now: BEFORE, events: [], workingHours: late }

  it('cabe una de 59 minutos y una de 1 hora ya no', () => {
    expect(findSlots({ ...base, durationMinutes: 59 }).map(span)).toEqual(['21 23:00–21 23:59'])
    expect(findSlots({ ...base, durationMinutes: 60 })).toEqual([])
  })

  it('sin hora máxima, el límite es 23:59 (no 24:00)', () => {
    const allDay = week({ 1: [{ start: '00:00', end: '23:59' }] })
    const slots = findSlots({ ...base, workingHours: allDay, durationMinutes: 60 })
    expect(slots.length).toBeGreaterThan(0)
    expect(slots.every(sameDay)).toBe(true)
  })

  it('una reunión de 23:00 a 23:59 ocupa ese hueco', () => {
    const meeting = { id: 'm', title: 'Tarde', start: new Date(2026, 8, 21, 23, 0).toISOString(), end: new Date(2026, 8, 21, 23, 59).toISOString(), recurrence: null }
    expect(findSlots({ ...base, durationMinutes: 30, events: [meeting] })).toEqual([])
  })

  it('en el enlace de reservas no se ofrecen reuniones que acaben a las 00:00 o después (23:00 y 23:30 no salen)', () => {
    // Lo que pudo publicar una versión anterior: un hueco de 22:00 a 02:00 (hora de Madrid).
    const free = [['2026-09-21T20:00:00Z', '2026-09-22T00:00:00Z']]
    const times = (starts) => starts.map((s) => hhmm(s))
    expect(times(slotStarts(free, 60, 30, 'Europe/Madrid'))).toEqual(['22:00', '22:30', '00:00', '00:30', '01:00'])
    expect(times(slotStarts(free, 60, 30))).toContain('23:00') // sin zona, como antes
    const days = bookingDays({ free, minutes: 60, stepMinutes: 30, tz: 'Europe/Madrid', ownerTz: 'Europe/Madrid', now: BEFORE })
    expect(days.flatMap((d) => d.slots.map((s) => `${d.key} ${s.time}`))).toEqual(['2026-09-21 22:00', '2026-09-21 22:30', '2026-09-22 00:00', '2026-09-22 00:30', '2026-09-22 01:00'])
  })
})

describe('contacto en Ecuador (UTC−5): su franja cae al día siguiente en España', () => {
  // Miércoles 14/01/2026: España UTC+1, Ecuador UTC−5 → +6 h.
  const WED = new Date(2026, 0, 14)
  const THU = new Date(2026, 0, 15)
  const carla = {
    id: 'carla',
    name: 'Carla Ruiz',
    timeZone: 'America/Guayaquil',
    availability: week({ 3: [{ start: '15:00', end: '20:00' }, { start: '21:00', end: '23:59' }] }),
  }

  it('se convierte a mi hora aunque sea otro día, sin bloquearlo', () => {
    expect(availabilityIntervals(carla, WED, new Date(2026, 0, 16)).map(span)).toEqual(['14 21:00–15 02:00', '15 03:00–15 05:59'])
  })

  it('su 24:00 guardado cuenta como 23:59 en Ecuador (05:59 en España)', () => {
    const old = { ...carla, availability: rawWeek({ 3: [{ start: '21:00', end: '24:00' }] }) }
    expect(availabilityIntervals(old, WED, new Date(2026, 0, 16)).map(span)).toEqual(['15 03:00–15 05:59'])
  })

  it('Buscar hueco la respeta, partida por mis días, sin huecos que pasen de las 23:59', () => {
    const slots = findSlots({
      durationMinutes: 60,
      fromDate: WED,
      toDate: THU,
      now: new Date(2026, 0, 13),
      events: [],
      workingHours: week({}),
      participants: [carla],
      notAttending: true,
      attendees: { participantIds: ['carla'], guests: [] },
      contacts: [carla],
    })
    expect(slots.map(span)).toEqual(['14 21:00–14 22:00', '15 00:00–15 01:00', '15 03:00–15 04:00'])
    expect(slots.every(sameDay)).toBe(true)
  })
})
