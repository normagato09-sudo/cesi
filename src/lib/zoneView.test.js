import { describe, expect, it } from 'vitest'
import { eventsInZone, fromWall, realEvent, toWall, viewZone } from './zoneView'
import { localTimeZone } from './timezones'

// Una zona que no es la del dispositivo de las pruebas.
const other = localTimeZone() === 'Asia/Tokyo' ? 'America/Mexico_City' : 'Asia/Tokyo'

describe('calendario en la zona del perfil', () => {
  it('usa la zona del perfil completo; si no, la del dispositivo', () => {
    expect(viewZone({ completed_at: 'x', time_zone: 'Asia/Tokyo' })).toBe('Asia/Tokyo')
    expect(viewZone({ completed_at: null, time_zone: 'Asia/Tokyo' })).toBe(localTimeZone())
    expect(viewZone(null)).toBe(localTimeZone())
  })

  it('pasa a la hora de reloj de la zona y vuelve al mismo instante', () => {
    const real = new Date('2026-11-03T09:30:00Z') // Tokio: 18:30 del 3
    const wall = toWall(real, 'Asia/Tokyo')
    if (localTimeZone() !== 'Asia/Tokyo') {
      expect([wall.getDate(), wall.getHours(), wall.getMinutes()]).toEqual([3, 18, 30])
    }
    expect(fromWall(wall, 'Asia/Tokyo').toISOString()).toBe(real.toISOString())
  })

  it('en la zona del dispositivo no cambia nada', () => {
    const d = new Date()
    expect(toWall(d, localTimeZone())).toBe(d)
    const evs = [{ id: 'a', start: d, end: d }]
    expect(eventsInZone(evs, localTimeZone())).toBe(evs)
  })

  it('los eventos de las vistas guardan el original', () => {
    const ev = { id: 'a', start: new Date('2026-11-03T09:00:00Z'), end: new Date('2026-11-03T10:00:00Z') }
    const [shown] = eventsInZone([ev], other)
    expect(realEvent(shown)).toBe(ev)
    expect(fromWall(shown.start, other).toISOString()).toBe(ev.start.toISOString())
  })
})
