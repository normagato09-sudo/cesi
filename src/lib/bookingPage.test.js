import { describe, expect, it } from 'vitest'
import { bookingDays, dayKeyIn, minutesLabel, slotStarts, tokenFromPath, validateRequest } from './bookingPage'

describe('página /reservar', () => {
  it('token de la dirección', () => {
    const t = 'a'.repeat(43)
    expect(tokenFromPath(`/reservar/${t}`)).toBe(t)
    expect(tokenFromPath(`/reservar/${t}/`)).toBe(t)
    expect(tokenFromPath('/reservar/corto')).toBeNull()
    expect(tokenFromPath(`/ficha/${t}`)).toBeNull()
  })

  it('inicios cada 30 min que caben en los huecos', () => {
    const free = [['2026-10-14T07:10:00Z', '2026-10-14T09:00:00Z']]
    expect(slotStarts(free, 60, 30).map((s) => s.toISOString().slice(11, 16))).toEqual(['07:30', '08:00'])
    expect(slotStarts(free, 30, 30).map((s) => s.toISOString().slice(11, 16))).toEqual(['07:30', '08:00', '08:30'])
  })

  it('días desde hoy hasta el último que se puede reservar, en la zona de quien reserva, con vacaciones y festivos sin huecos', () => {
    const days = bookingDays({
      until: '2026-10-18',
      free: [
        ['2026-10-13T07:00:00Z', '2026-10-13T08:00:00Z'],
        ['2026-10-14T07:00:00Z', '2026-10-14T08:00:00Z'],
      ],
      daysOff: [{ date: '2026-10-14', kind: 'holiday' }],
      minutes: 30,
      stepMinutes: 30,
      tz: 'Europe/Madrid',
      now: new Date('2026-10-12T20:00:00Z'), // lunes 12, 22:00 en Madrid
    })
    expect(days.map((d) => d.key)).toEqual(['2026-10-12', '2026-10-13', '2026-10-14', '2026-10-15', '2026-10-16', '2026-10-17', '2026-10-18'])
    expect(days[1]).toMatchObject({ label: 'martes 13 de octubre', off: null })
    expect(days[1].slots.map((s) => s.time)).toEqual(['09:00', '09:30'])
    expect(days[2]).toMatchObject({ off: 'holiday', slots: [] })
    expect(days[3].slots).toEqual([])
  })

  it('en otra zona horaria cambian las horas y el día', () => {
    const days = bookingDays({
      free: [['2026-10-13T03:00:00Z', '2026-10-13T03:30:00Z']],
      minutes: 30,
      tz: 'America/Mexico_City',
      now: new Date('2026-10-10T00:00:00Z'),
    })
    expect(days).toHaveLength(1)
    expect(days[0].key).toBe('2026-10-12')
    expect(days[0].slots[0].time).toBe('21:00')
    expect(dayKeyIn(new Date('2026-10-13T03:00:00Z'), 'Europe/Madrid')).toBe('2026-10-13')
  })

  it('formulario: nombre, email o teléfono y motivo', () => {
    const ok = { name: 'Ana', email: 'ana@x.com', phone: '', reason: 'Hablar' }
    expect(validateRequest(ok)).toBeNull()
    expect(validateRequest({ ...ok, name: ' ' })).toBe('Escribe tu nombre.')
    expect(validateRequest({ ...ok, email: '', phone: '' })).toMatch(/email o tu teléfono/)
    expect(validateRequest({ ...ok, email: '', phone: '+34 600 11 22 33' })).toBeNull()
    expect(validateRequest({ ...ok, email: 'mal' })).toBe('El email no parece correcto.')
    expect(validateRequest({ ...ok, reason: '' })).toMatch(/motivo/)
    expect(minutesLabel(90)).toBe('1 hora y 30 minutos')
  })
})
