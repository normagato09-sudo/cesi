import { describe, expect, it } from 'vitest'
import { meetingsWithUnavailable, unavailableWarning } from './unavailableParticipants'
import { editOccurrencePatch } from './seriesEdits'
import { expandEvent } from './recurrence'
import { warningTitle } from './meetingWarnings'
import { emptyWeek } from './weeklySchedule'

const MADRID = 'Europe/Madrid'
const week = (slotsByDay) => emptyWeek().map((e) => (slotsByDay[e.day] ? { ...e, enabled: true, slots: slotsByDay[e.day] } : e))
const WEEKDAYS = (slots) => week({ 1: slots, 2: slots, 3: slots, 4: slots, 5: slots })
const person = (id, availability, timeZone = MADRID, country = 'ES') => ({ id, name: `${id[0].toUpperCase()}${id.slice(1)} Pérez`, timeZone, country, availability })

// Jueves 15 de octubre de 2026.
const at = (d, h, m = 0) => new Date(2026, 9, d, h, m)
const meeting = (extra = {}) => ({
  id: 'm1',
  title: 'Revisión',
  start: at(15, 16).toISOString(),
  end: at(15, 17).toISOString(),
  participantIds: ['ana', 'luis', 'eva'],
  guests: ['Invitado'],
  recurrence: null,
  ...extra,
})

const ana = person('ana', WEEKDAYS([{ start: '09:00', end: '14:00' }])) // solo por la mañana
const luis = person('luis', WEEKDAYS([{ start: '09:00', end: '12:00' }, { start: '15:00', end: '16:30' }]))
const eva = person('eva', null) // sin disponibilidad apuntada: no avisa

describe('aviso al guardar', () => {
  it('dice quién no puede y por qué', () => {
    const warning = unavailableWarning(meeting(), [ana, luis, eva], MADRID)
    expect(warning).toEqual({
      type: 'participants',
      message: 'No pueden según su disponibilidad: Ana (jueves solo por la mañana), Luis (jueves solo de 9:00 a 12:00 y de 15:00 a 16:30)',
      contactIds: ['ana', 'luis'],
    })
    expect(warningTitle([warning])).toBe('Hay participantes que no pueden')
  })

  it('en singular si es uno, y con la hora de su zona', () => {
    const kenji = person('kenji', WEEKDAYS([{ start: '09:00', end: '12:00' }, { start: '15:00', end: '18:00' }]), 'Asia/Tokyo', 'JP')
    // 16:00 en España = 23:00 en Tokio.
    expect(unavailableWarning(meeting({ participantIds: ['kenji'] }), [kenji], MADRID).message).toBe(
      'No puede según su disponibilidad: Kenji (jueves solo de 9:00 a 12:00 y de 15:00 a 18:00, hora de Japón)',
    )
  })

  it('no avisa si todos pueden, ni por quien no tiene disponibilidad apuntada, ni por invitados', () => {
    expect(unavailableWarning(meeting({ start: at(15, 10).toISOString(), end: at(15, 11).toISOString(), participantIds: ['ana'] }), [ana], MADRID)).toBeNull()
    expect(unavailableWarning(meeting({ participantIds: ['eva'] }), [eva], MADRID)).toBeNull()
    expect(unavailableWarning({ ...meeting(), isUnavailable: true }, [ana], MADRID)).toBeNull()
  })

  it('se mezcla con los avisos de reglas y margen', () => {
    const warning = unavailableWarning(meeting(), [ana], MADRID)
    expect(warningTitle([{ type: 'buffer', message: 'x' }, warning])).toBe('Revisa estos avisos antes de guardar')
  })
})

describe('Pendientes: reuniones futuras con participantes que no pueden', () => {
  const now = at(1, 9)

  it('aparece cuando cambia la disponibilidad de un participante', () => {
    const before = { ...ana, availability: WEEKDAYS([{ start: '09:00', end: '19:00' }]) }
    const events = [meeting({ participantIds: ['ana'] })]
    expect(meetingsWithUnavailable(events, [before], now, { myZone: MADRID })).toEqual([])
    // Ana pasa a poder solo por la mañana.
    const [item] = meetingsWithUnavailable(events, [ana], now, { myZone: MADRID })
    expect(item.occurrence.id).toBe('m1')
    expect(item.message).toBe('No puede según su disponibilidad: Ana (jueves solo por la mañana)')
    expect(item.count).toBe(1)
  })

  it('solo los próximos 60 días, sin las pasadas, provisionales ni bloques "No disponible"', () => {
    const in70 = meeting({ id: 'lejos', start: new Date(2026, 11, 10, 16).toISOString(), end: new Date(2026, 11, 10, 17).toISOString(), participantIds: ['ana'] })
    const past = meeting({ id: 'pasada', start: new Date(2026, 8, 24, 16).toISOString(), end: new Date(2026, 8, 24, 17).toISOString(), participantIds: ['ana'] })
    const provisional = meeting({ id: 'prov', provisional: true, proposalId: 'p', participantIds: ['ana'] })
    expect(meetingsWithUnavailable([in70, past, provisional], [ana], now, { myZone: MADRID })).toEqual([])
  })

  it('las que se guardaron igualmente no vuelven a salir, salvo que deje de poder otra persona', () => {
    const accepted = meeting({ participantIds: ['ana', 'luis'], acceptedUnavailable: ['ana'] })
    const luisCan = { ...luis, availability: WEEKDAYS([{ start: '09:00', end: '19:00' }]) }
    expect(meetingsWithUnavailable([accepted], [ana, luisCan], now, { myZone: MADRID })).toEqual([])
    const [item] = meetingsWithUnavailable([accepted], [ana, luis], now, { myZone: MADRID })
    expect(item.people.map((p) => p.contact.id)).toEqual(['luis'])
  })

  it('una serie sale una vez, con su primer día afectado y cuántos más', () => {
    const series = meeting({
      id: 's1',
      start: at(12, 16).toISOString(),
      end: at(12, 17).toISOString(),
      participantIds: ['ana'],
      recurrence: { freq: 'weekly', until: at(31, 23, 59).toISOString() },
    })
    const [item] = meetingsWithUnavailable([series], [ana], now, { myZone: MADRID })
    expect(item.occurrence.start).toEqual(at(12, 16))
    expect(item.count).toBe(3)

    // Un día aceptado solo ese día ("Solo este día" + "Guardar igualmente") ya no cuenta.
    const occ = expandEvent(series, at(12, 0), at(13, 0))[0]
    const patched = { ...series, ...editOccurrencePatch(series, occ, { acceptedUnavailable: ['ana'] }) }
    const [again] = meetingsWithUnavailable([patched], [ana], now, { myZone: MADRID })
    expect(again.occurrence.start).toEqual(at(19, 16))
    expect(again.count).toBe(2)
  })
})
