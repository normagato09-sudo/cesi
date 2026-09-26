import { describe, expect, it } from 'vitest'
import { availabilityStatus, localTimeInfo, participantEntries, statusCountsText, unreasonableTimeWarning } from './participants'
import { emptyWeek } from './weeklySchedule'

const MADRID = 'Europe/Madrid'

function week(slotsByDay) {
  return emptyWeek().map((e) => (slotsByDay[e.day] ? { ...e, enabled: true, slots: slotsByDay[e.day] } : e))
}
const WEEKDAYS = (slots) => week({ 1: slots, 2: slots, 3: slots, 4: slots, 5: slots })

function contact(name, availability, timeZone = MADRID, country = 'ES') {
  return { id: name, name, timeZone, country, availability }
}

// Reunión el día (enero de 2026) de hh:mm a hh:mm, hora de España.
const at = (d, h, m = 0) => new Date(2026, 0, d, h, m)

describe('puede / no puede / sin disponibilidad', () => {
  // Jueves 15 de enero de 2026.
  const ana = contact('Ana', week({ 4: [{ start: '09:00', end: '14:00' }] }))

  it('puede si la reunión cae entera dentro de su disponibilidad', () => {
    expect(availabilityStatus(ana, at(15, 10), at(15, 11), MADRID)).toEqual({
      status: 'can',
      message: 'Puede: los jueves de 9:00 a 14:00',
    })
    // Justo en los bordes también.
    expect(availabilityStatus(ana, at(15, 9), at(15, 14), MADRID).status).toBe('can')
  })

  it('no puede si cae fuera, aunque sea en parte', () => {
    expect(availabilityStatus(ana, at(15, 13, 30), at(15, 14, 30), MADRID)).toMatchObject({
      status: 'cannot',
      message: 'No puede: los jueves solo de 9:00 a 14:00',
    })
    expect(availabilityStatus(ana, at(15, 16), at(15, 17), MADRID).status).toBe('cannot')
    // Un día sin franjas.
    expect(availabilityStatus(ana, at(16, 10), at(16, 11), MADRID)).toMatchObject({
      status: 'cannot',
      message: 'No puede: los viernes no tiene disponibilidad',
    })
  })

  it('reuniones que cruzan el borde entre dos franjas', () => {
    // Franjas seguidas: 9–12 y 12–14 cuentan como una sola.
    const seguidas = contact('Eva', WEEKDAYS([{ start: '09:00', end: '12:00' }, { start: '12:00', end: '14:00' }]))
    expect(availabilityStatus(seguidas, at(15, 11, 30), at(15, 12, 30), MADRID).status).toBe('can')
    // Con hueco entre ellas (9–12 y 13–14), no.
    const separadas = contact('Eva', WEEKDAYS([{ start: '09:00', end: '12:00' }, { start: '13:00', end: '14:00' }]))
    const r = availabilityStatus(separadas, at(15, 11, 30), at(15, 13, 30), MADRID)
    expect(r).toMatchObject({ status: 'cannot', message: 'No puede: los jueves solo de 9:00 a 12:00 y de 13:00 a 14:00' })
  })

  it('sin disponibilidad apuntada, y los invitados sin ficha', () => {
    expect(availabilityStatus(contact('Sin', null), at(15, 10), at(15, 11))).toEqual({
      status: 'unknown',
      message: 'Sin disponibilidad apuntada',
    })
    expect(availabilityStatus(null, at(15, 10), at(15, 11)).status).toBe('unknown')
  })

  it('con otra zona horaria convierte su disponibilidad a mi hora', () => {
    // Luis, en Ciudad de México, de lunes a viernes de 9:00 a 12:00 (invierno: España va 7 h por delante).
    const luis = contact('Luis', WEEKDAYS([{ start: '09:00', end: '12:00' }]), 'America/Mexico_City', 'MX')
    expect(availabilityStatus(luis, at(14, 16), at(14, 17), MADRID)).toEqual({
      status: 'can',
      message: 'Puede: los miércoles de 9:00 a 12:00 (hora de Ciudad de México)',
    })
    // 18:30–19:30 en España = 11:30–12:30 en México: se pasa de su franja.
    expect(availabilityStatus(luis, at(14, 18, 30), at(14, 19, 30), MADRID)).toMatchObject({
      status: 'cannot',
      message: 'No puede: los miércoles solo de 9:00 a 12:00 (hora de Ciudad de México)',
    })
    // Por la mañana en España es de madrugada en México.
    expect(availabilityStatus(luis, at(14, 10), at(14, 11), MADRID).status).toBe('cannot')
  })

  it('con otra zona el día de la semana es el suyo', () => {
    // Kenji, en Tokio, solo los jueves de 9:00 a 11:00 = miércoles de 01:00 a 03:00 en España.
    const kenji = contact('Kenji', week({ 4: [{ start: '09:00', end: '11:00' }] }), 'Asia/Tokyo', 'JP')
    expect(availabilityStatus(kenji, at(15, 1), at(15, 2), MADRID).status).toBe('can')
    expect(availabilityStatus(kenji, at(15, 1), at(15, 2), MADRID).message).toBe('Puede: los jueves de 9:00 a 11:00 (hora de Japón)')
    expect(availabilityStatus(kenji, at(14, 1), at(14, 2), MADRID).message).toBe('No puede: los miércoles no tiene disponibilidad')
  })

  it('sin hora de reunión solo dice si tiene disponibilidad apuntada', () => {
    const ana2 = contact('Ana', WEEKDAYS([{ start: '09:00', end: '14:00' }]))
    expect(availabilityStatus(ana2, null, null).status).toBe('any')
    expect(availabilityStatus(ana2, null, null).message).toMatch(/^Disponibilidad habitual \(hora de España\): Lun: 09:00–14:00/)
    expect(availabilityStatus(contact('Sin', null), null, null).status).toBe('unknown')
  })
})

describe('recuento encima de la lista', () => {
  const entries = (can, cannot, unknown) => [
    ...Array(can).fill({ status: 'can' }),
    ...Array(cannot).fill({ status: 'cannot' }),
    ...Array(unknown).fill({ status: 'unknown' }),
  ]

  it('cuenta cuántos pueden, no pueden y no tienen disponibilidad', () => {
    expect(statusCountsText(entries(8, 1, 2))).toBe('8 pueden · 1 no puede · 2 sin disponibilidad')
    expect(statusCountsText(entries(1, 2, 0))).toBe('1 puede · 2 no pueden')
    expect(statusCountsText(entries(0, 0, 3))).toBe('3 sin disponibilidad')
  })

  it('reúne contactos e invitados de una reunión (también las antiguas, por nombre)', () => {
    const ana = contact('Ana', WEEKDAYS([{ start: '09:00', end: '14:00' }]))
    const luis = contact('Luis', null)
    const list = participantEntries({ participantIds: ['Ana', 'Luis'], guests: ['Invitada'] }, [ana, luis], at(15, 16), at(15, 17), MADRID)
    expect(list.map((e) => [e.name, e.status])).toEqual([
      ['Ana', 'cannot'],
      ['Luis', 'unknown'],
      ['Invitada', 'unknown'],
    ])
    expect(statusCountsText(list)).toBe('1 no puede · 2 sin disponibilidad')
    const old = participantEntries({ participants: ['Ana', 'Pepe'] }, [ana], at(15, 10), at(15, 11), MADRID)
    expect(old.map((e) => [e.name, e.status, !!e.contact])).toEqual([
      ['Ana', 'can', true],
      ['Pepe', 'unknown', false],
    ])
  })
})

describe('bandera, país y hora local', () => {
  it('España, península y Canarias', () => {
    expect(localTimeInfo(contact('Ana', null), at(15, 18), MADRID).text).toBe('🇪🇸 España · 18:00')
    expect(localTimeInfo(contact('Nira', null, 'Atlantic/Canary'), at(15, 18), MADRID).text).toBe('🇪🇸 España (Canarias) · 17:00')
    // En verano también va una hora por detrás.
    expect(localTimeInfo(contact('Nira', null, 'Atlantic/Canary'), new Date(2026, 6, 15, 18), MADRID).text).toBe('🇪🇸 España (Canarias) · 17:00')
  })

  it('otro país, con la zona si el país tiene varias', () => {
    expect(localTimeInfo(contact('Luis', null, 'America/Mexico_City', 'MX'), at(15, 17), MADRID).text).toBe('🇲🇽 México (Ciudad de México) · 10:00')
    expect(localTimeInfo(contact('Kenji', null, 'Asia/Tokyo', 'JP'), at(15, 12), MADRID).text).toBe('🇯🇵 Japón · 20:00')
  })

  it('avisa si cambia el día', () => {
    // 17:00 en España (invierno) = 01:00 del día siguiente en Tokio.
    expect(localTimeInfo(contact('Kenji', null, 'Asia/Tokyo', 'JP'), at(15, 17), MADRID)).toMatchObject({
      text: '🇯🇵 Japón · 01:00 (día siguiente)',
      shift: 1,
    })
    // 01:00 en España = 18:00 del día anterior en México.
    expect(localTimeInfo(contact('Luis', null, 'America/Mexico_City', 'MX'), at(15, 1), MADRID)).toMatchObject({
      text: '🇲🇽 México (Ciudad de México) · 18:00 (día anterior)',
      shift: -1,
    })
  })

  it('sin hora, solo el lugar', () => {
    expect(localTimeInfo(contact('Luis', null, 'America/Mexico_City', 'MX'), null).text).toBe('🇲🇽 México (Ciudad de México)')
  })
})

describe('aviso de hora poco razonable', () => {
  const slot = (d, h, dur = 60) => [at(d, h), new Date(at(d, h).getTime() + dur * 60000)]

  it('avisa si cae fuera de 08:00–20:00 para quien no tiene disponibilidad', () => {
    const ana = contact('Ana García', null, 'America/Mexico_City', 'MX')
    // 09:00 en España = 02:00 en México (invierno).
    expect(unreasonableTimeWarning(ana, ...slot(14, 9))).toBe('Para Ana serían las 02:00')
    expect(unreasonableTimeWarning(ana, ...slot(14, 16))).toBeNull()
    expect(unreasonableTimeWarning(ana, ...slot(14, 8))).toBe('Para Ana sería la 01:00')
    // Terminar justo a las 20:00 en su hora es razonable; pasarse, no.
    const kenji = contact('Kenji', null, 'Asia/Tokyo', 'JP')
    expect(unreasonableTimeWarning(kenji, ...slot(14, 11, 60))).toBeNull()
    expect(unreasonableTimeWarning(kenji, ...slot(14, 11, 90))).toBe('Para Kenji serían las 19:00')
  })

  it('no avisa a quien tiene disponibilidad apuntada (ya lo dice el indicador) ni a invitados', () => {
    const luis = contact('Luis', WEEKDAYS([{ start: '01:00', end: '03:00' }]), 'America/Mexico_City', 'MX')
    expect(unreasonableTimeWarning(luis, ...slot(14, 9))).toBeNull()
    expect(unreasonableTimeWarning(null, ...slot(14, 3))).toBeNull()
  })
})
