import { describe, expect, it } from 'vitest'
import { meetingWhen } from './meetingWhen'

describe('meetingWhen', () => {
  it('día y hora en la zona de quien lo recibe', () => {
    expect(meetingWhen('2026-10-05T16:00:00.000Z', 'Europe/Madrid')).toMatchObject({
      day: 'lunes 5 de octubre',
      time: '18:00',
      place: 'España',
      timeZone: 'Europe/Madrid',
    })
  })

  it('el día también es el de su zona (puede ser otro)', () => {
    // Lunes 23:30 en México es martes 07:30 en Madrid.
    const start = '2026-10-06T05:30:00.000Z'
    expect(meetingWhen(start, 'America/Mexico_City')).toMatchObject({ day: 'lunes 5 de octubre', time: '23:30' })
    expect(meetingWhen(start, 'Europe/Madrid')).toMatchObject({ day: 'martes 6 de octubre', time: '07:30' })
  })
})
