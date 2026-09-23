import { describe, expect, it } from 'vitest'
import { convertWallTime, formatOffsetDiff, zonePlace, zonedDateTime } from './timezones'

const MADRID = 'Europe/Madrid'

describe('conversor de hora', () => {
  it('18:00 de España en Ciudad de México, invierno y verano', () => {
    const winter = convertWallTime({ date: '2026-01-15', time: '18:00', fromZone: MADRID, toZone: 'America/Mexico_City' })
    expect([winter.time, formatOffsetDiff(winter.diffMinutes), winter.dayShift]).toEqual(['11:00', '−7 h', 0])
    const summer = convertWallTime({ date: '2026-07-15', time: '18:00', fromZone: MADRID, toZone: 'America/Mexico_City' })
    expect([summer.time, formatOffsetDiff(summer.diffMinutes), summer.dayShift]).toEqual(['10:00', '−8 h', 0])
  })

  it('18:00 de España en Tokio pasa al día siguiente', () => {
    const winter = convertWallTime({ date: '2026-01-15', time: '18:00', fromZone: MADRID, toZone: 'Asia/Tokyo' })
    expect([winter.time, formatOffsetDiff(winter.diffMinutes), winter.dayShift, winter.to.day]).toEqual([
      '02:00',
      '+8 h',
      1,
      16,
    ])
    const summer = convertWallTime({ date: '2026-07-15', time: '18:00', fromZone: MADRID, toZone: 'Asia/Tokyo' })
    expect([summer.time, formatOffsetDiff(summer.diffMinutes), summer.dayShift]).toEqual(['01:00', '+7 h', 1])
  })

  it('respeta las semanas en que EE. UU. ya ha cambiado de hora y Europa no', () => {
    const r = convertWallTime({ date: '2026-03-20', time: '18:00', fromZone: MADRID, toZone: 'America/New_York' })
    expect([r.time, formatOffsetDiff(r.diffMinutes)]).toEqual(['13:00', '−5 h'])
    const normal = convertWallTime({ date: '2026-04-20', time: '18:00', fromZone: MADRID, toZone: 'America/New_York' })
    expect(formatOffsetDiff(normal.diffMinutes)).toBe('−6 h')
  })

  it('maneja diferencias con medias horas y el día anterior', () => {
    const india = convertWallTime({ date: '2026-01-15', time: '10:00', fromZone: MADRID, toZone: 'Asia/Kolkata' })
    expect([india.time, formatOffsetDiff(india.diffMinutes)]).toEqual(['14:30', '+4 h 30 min'])
    const la = convertWallTime({ date: '2026-01-15', time: '02:00', fromZone: MADRID, toZone: 'America/Los_Angeles' })
    expect([la.time, la.dayShift]).toEqual(['17:00', -1])
  })

  it('convierte de otro país a España y a Canarias', () => {
    const r = convertWallTime({ date: '2026-07-15', time: '09:00', fromZone: 'America/Mexico_City', toZone: MADRID })
    expect(r.time).toBe('17:00')
    const canarias = convertWallTime({ date: '2026-07-15', time: '18:00', fromZone: MADRID, toZone: 'Atlantic/Canary' })
    expect([canarias.time, formatOffsetDiff(canarias.diffMinutes)]).toEqual(['17:00', '−1 h'])
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
