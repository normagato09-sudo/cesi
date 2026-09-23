import { describe, expect, it } from 'vitest'
import { availabilityIntervals, commonAvailability, hasAvailability, slotLocalNotes } from './contactAvailability'
import { explainNoSlots, findSlots } from './findSlots'
import { emptyWeek } from './weeklySchedule'

const hhmm = (d) => `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
const span = (i) => `${hhmm(i.start)}–${hhmm(i.end)}`

function week(slotsByDay) {
  return emptyWeek().map((e) => (slotsByDay[e.day] ? { ...e, enabled: true, slots: slotsByDay[e.day] } : e))
}

const WEEKDAYS = (slots) => week({ 1: slots, 2: slots, 3: slots, 4: slots, 5: slots })

function contact(name, availability, timeZone = '') {
  return { id: name, name, timeZone, availability }
}

function dayRange(y, m, d) {
  const from = new Date(y, m - 1, d)
  const to = new Date(y, m - 1, d + 1)
  return [from, to]
}

describe('disponibilidad de contactos: conversión de zona', () => {
  it('sin disponibilidad no restringe', () => {
    expect(hasAvailability(contact('Sin', null))).toBe(false)
    expect(availabilityIntervals(contact('Sin', null), ...dayRange(2026, 1, 14))).toBeNull()
  })

  it('sin zona horaria se interpreta en hora de España', () => {
    const ana = contact('Ana', WEEKDAYS([{ start: '16:00', end: '19:00' }]))
    expect(availabilityIntervals(ana, ...dayRange(2026, 1, 14)).map(span)).toEqual(['16:00–19:00'])
  })

  it('convierte desde Ciudad de México respetando el horario de verano de España', () => {
    const luis = contact('Luis', WEEKDAYS([{ start: '09:00', end: '12:00' }]), 'America/Mexico_City')
    // Invierno: México UTC−6, España UTC+1 → +7 h.
    expect(availabilityIntervals(luis, ...dayRange(2026, 1, 14)).map(span)).toEqual(['16:00–19:00'])
    // Verano: España UTC+2 (México sin horario de verano) → +8 h.
    expect(availabilityIntervals(luis, ...dayRange(2026, 7, 15)).map(span)).toEqual(['17:00–20:00'])
  })

  it('una franja de otra zona puede caer en otro día de mi calendario', () => {
    // Tokio 09:00–11:00 del jueves = 01:00–03:00 del jueves en España (invierno, +8 h).
    const kenji = contact('Kenji', week({ 4: [{ start: '09:00', end: '11:00' }] }), 'Asia/Tokyo')
    expect(availabilityIntervals(kenji, ...dayRange(2026, 1, 15)).map(span)).toEqual(['01:00–03:00'])
    // El miércoles en España no tiene nada (su miércoles no está disponible).
    expect(availabilityIntervals(kenji, ...dayRange(2026, 1, 14))).toEqual([])
  })

  it('intersecta la disponibilidad de varios contactos', () => {
    const ana = contact('Ana', WEEKDAYS([{ start: '10:00', end: '14:00' }]))
    const luis = contact('Luis', WEEKDAYS([{ start: '05:00', end: '07:00' }]), 'America/Mexico_City') // 12:00–14:00 en España
    const sin = contact('Sin', null)
    expect(commonAvailability([ana, luis, sin], ...dayRange(2026, 1, 14)).map(span)).toEqual(['12:00–14:00'])
    expect(commonAvailability([sin], ...dayRange(2026, 1, 14))).toBeNull()
  })
})

describe('findSlots con participantes', () => {
  const MY_WEEK = WEEKDAYS([{ start: '09:00', end: '14:00' }, { start: '16:00', end: '19:00' }])
  const WED = new Date(2026, 0, 14)
  const base = {
    durationMinutes: 60,
    fromDate: WED,
    toDate: WED,
    events: [],
    workingHours: MY_WEEK,
    now: new Date(2026, 0, 12, 8, 0),
  }

  it('solo propone huecos que encajan con mi horario y con todos', () => {
    const luis = contact('Luis', WEEKDAYS([{ start: '09:00', end: '12:00' }]), 'America/Mexico_City') // 16:00–19:00
    const slots = findSlots({ ...base, participants: [luis] })
    expect(slots.map((s) => hhmm(s.start))).toEqual(['16:00'])
  })

  it('dice qué contacto impide encontrar hueco', () => {
    const ana = contact('Ana García', WEEKDAYS([{ start: '15:00', end: '20:00' }]))
    const busyAfternoon = [
      { id: 'x', title: 'x', start: new Date(2026, 0, 14, 16).toISOString(), end: new Date(2026, 0, 14, 19).toISOString(), recurrence: null },
    ]
    const params = { ...base, participants: [ana], events: busyAfternoon }
    expect(findSlots(params)).toEqual([])
    const { blockers, combined } = explainNoSlots(params)
    expect(combined).toBe(false)
    expect(blockers.map((b) => b.message)).toEqual(['Ana solo puede por las tardes y tú no tienes huecos libres por la tarde ese día.'])
    // Ignorando su disponibilidad sí hay huecos.
    expect(findSlots({ ...params, participants: [] }).length).toBeGreaterThan(0)
  })

  it('si dos contactos no coinciden entre sí, señala a los dos', () => {
    const morning = contact('Marta', WEEKDAYS([{ start: '09:00', end: '12:00' }]))
    const afternoon = contact('Pablo', WEEKDAYS([{ start: '16:00', end: '19:00' }]))
    const { blockers, combined } = explainNoSlots({ ...base, participants: [morning, afternoon] })
    // Quitando a cualquiera de los dos ya hay hueco: los dos aparecen como bloqueantes.
    expect(blockers.map((b) => b.contact.name)).toEqual(['Marta', 'Pablo'])
    expect(combined).toBe(false)
  })

  it('si el problema es mi horario no culpa a nadie', () => {
    const ana = contact('Ana', WEEKDAYS([{ start: '09:00', end: '19:00' }]))
    const sat = new Date(2026, 0, 17)
    expect(explainNoSlots({ ...base, fromDate: sat, toDate: sat, participants: [ana] })).toEqual({ blockers: [], combined: false })
  })
})

describe('hora local de los participantes en los resultados', () => {
  const slot = (y, m, d, h, dur = 60) => {
    const start = new Date(y, m - 1, d, h)
    return [start, new Date(start.getTime() + dur * 60000)]
  }
  const MADRID = 'Europe/Madrid'

  it('muestra la hora en la zona del país de cada participante', () => {
    const luis = contact('Luis', null, 'America/Mexico_City')
    const kenji = contact('Kenji', null, 'Asia/Tokyo')
    const ana = contact('Ana', null, 'Europe/Madrid')
    // 17:00 en España en invierno = 10:00 en México y 01:00 del día siguiente en Tokio.
    const { times } = slotLocalNotes(...slot(2026, 1, 14, 17), [luis, kenji, ana], MADRID)
    expect(times).toEqual(['10:00 en Ciudad de México', '01:00 en Japón (día siguiente)'])
    // En verano México va 8 h por detrás.
    expect(slotLocalNotes(...slot(2026, 7, 15, 17), [luis], MADRID).times).toEqual(['09:00 en Ciudad de México'])
  })

  it('avisa si el hueco cae fuera de 08:00–20:00 para quien no tiene disponibilidad', () => {
    const ana = contact('Ana García', null, 'America/Mexico_City')
    // 09:00 en España = 02:00 en México (invierno).
    expect(slotLocalNotes(...slot(2026, 1, 14, 9), [ana], MADRID).warnings).toEqual(['Para Ana serían las 02:00'])
    // 16:00 en España = 09:00 en México: sin aviso.
    expect(slotLocalNotes(...slot(2026, 1, 14, 16), [ana], MADRID).warnings).toEqual([])
    // 08:00 en España = 01:00: "sería la 01:00".
    expect(slotLocalNotes(...slot(2026, 1, 14, 8), [ana], MADRID).warnings).toEqual(['Para Ana sería la 01:00'])
    // Terminar justo a las 20:00 en su hora es razonable; pasarse, no.
    const kenji = contact('Kenji', null, 'Asia/Tokyo')
    expect(slotLocalNotes(...slot(2026, 1, 14, 11, 60), [kenji], MADRID).warnings).toEqual([])
    expect(slotLocalNotes(...slot(2026, 1, 14, 11, 90), [kenji], MADRID).warnings).toEqual(['Para Kenji serían las 19:00'])
    expect(slotLocalNotes(...slot(2026, 1, 14, 12, 90), [kenji], MADRID).warnings).toEqual(['Para Kenji serían las 20:00'])
  })

  it('no avisa por horas a quien tiene disponibilidad apuntada (ya se filtra por ella)', () => {
    const luis = contact('Luis', WEEKDAYS([{ start: '01:00', end: '03:00' }]), 'America/Mexico_City')
    expect(slotLocalNotes(...slot(2026, 1, 14, 9), [luis], MADRID).warnings).toEqual([])
  })
})
