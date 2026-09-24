import { describe, expect, it } from 'vitest'
import {
  dayShift,
  formatOffsetDiff,
  formatTimeInZone,
  zoneOffsetMinutes,
  zonePlace,
  zonedDateTime,
} from './timezones'

const MADRID = 'Europe/Madrid'

// Instante de una hora de reloj de España ('2026-01-15', '18:00').
function spain(date, time) {
  const [year, month, day] = date.split('-').map(Number)
  const [hour, minute] = time.split(':').map(Number)
  return zonedDateTime({ year, month, day, hour, minute }, MADRID).date
}

// Hora en `zone`, diferencia con España y cambio de día, como se muestran a los participantes.
function inZone(instant, zone) {
  return [
    formatTimeInZone(instant, zone),
    formatOffsetDiff(zoneOffsetMinutes(instant, zone) - zoneOffsetMinutes(instant, MADRID)),
    dayShift(instant, MADRID, zone),
  ]
}

describe('zonas horarias', () => {
  it('18:00 de España en Ciudad de México, invierno y verano', () => {
    expect(inZone(spain('2026-01-15', '18:00'), 'America/Mexico_City')).toEqual(['11:00', '−7 h', 0])
    expect(inZone(spain('2026-07-15', '18:00'), 'America/Mexico_City')).toEqual(['10:00', '−8 h', 0])
  })

  it('18:00 de España en Tokio pasa al día siguiente', () => {
    expect(inZone(spain('2026-01-15', '18:00'), 'Asia/Tokyo')).toEqual(['02:00', '+8 h', 1])
    expect(inZone(spain('2026-07-15', '18:00'), 'Asia/Tokyo')).toEqual(['01:00', '+7 h', 1])
  })

  it('respeta las semanas en que EE. UU. ya ha cambiado de hora y Europa no', () => {
    expect(inZone(spain('2026-03-20', '18:00'), 'America/New_York').slice(0, 2)).toEqual(['13:00', '−5 h'])
    expect(inZone(spain('2026-04-20', '18:00'), 'America/New_York')[1]).toBe('−6 h')
  })

  it('maneja diferencias con medias horas y el día anterior', () => {
    expect(inZone(spain('2026-01-15', '10:00'), 'Asia/Kolkata').slice(0, 2)).toEqual(['14:30', '+4 h 30 min'])
    const la = inZone(spain('2026-01-15', '02:00'), 'America/Los_Angeles')
    expect([la[0], la[2]]).toEqual(['17:00', -1])
  })

  it('pasa de otra zona a España y a Canarias', () => {
    const mexico = zonedDateTime({ year: 2026, month: 7, day: 15, hour: 9, minute: 0 }, 'America/Mexico_City').date
    expect(formatTimeInZone(mexico, MADRID)).toBe('17:00')
    expect(inZone(spain('2026-07-15', '18:00'), 'Atlantic/Canary').slice(0, 2)).toEqual(['17:00', '−1 h'])
  })

  it('detecta horas que no existen por el cambio de hora', () => {
    expect(zonedDateTime({ year: 2026, month: 3, day: 29, hour: 2, minute: 30 }, MADRID).exists).toBe(false)
    expect(zonedDateTime({ year: 2026, month: 3, day: 29, hour: 3, minute: 30 }, MADRID).exists).toBe(true)
  })

  it('da nombres de lugar para frases cortas', () => {
    expect(zonePlace('America/Mexico_City')).toBe('Ciudad de México')
    expect(zonePlace('Asia/Tokyo')).toBe('Japón')
    expect(zonePlace('Europe/Madrid')).toBe('España')
    expect(zonePlace('Atlantic/Canary')).toBe('Canarias')
  })
})
