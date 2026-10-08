import { describe, expect, it } from 'vitest'
import { bookingAvailability, bookingContactData, decisionMessage, matchContact, requestDescription, requestTitle } from './bookings'
import { emptyWeek } from './weeklySchedule'

const d = (month, day, h = 0, m = 0) => new Date(2026, month - 1, day, h, m)
const iso = (date) => date.toISOString()
// Semana declarada: lunes a viernes de 9:00 a 13:00.
const morning = emptyWeek().map((e) => (e.day >= 1 && e.day <= 5 ? { ...e, enabled: true, slots: [{ start: '09:00', end: '13:00' }] } : e))
const declared = (key) => ({ id: `wk_${key}`, weekStart: key, week: morning, dismissed: false })
const ev = (id, start, end, extra = {}) => ({ id, title: `Secreto ${id}`, start: iso(start), end: iso(end), recurrence: null, participantIds: ['x'], ...extra })

describe('huecos que se publican', () => {
  const now = d(10, 7, 10) // miércoles 7/10/2026
  const weeklyAvailability = [
    declared('2026-10-05'),
    declared('2026-10-12'),
    declared('2026-09-28'), // ya pasó
    { id: 'wk_2026-10-19', weekStart: '2026-10-19', week: null, dismissed: true }, // horario habitual: no cuenta
  ]

  it('solo las semanas declaradas desde la actual, sin mis reuniones ni franjas, y nada más', () => {
    const rawEvents = [
      ev('a', d(10, 8, 10), d(10, 8, 11)),
      ev('b', d(10, 9, 9), d(10, 9, 13), { isUnavailable: true }),
      ev('c', d(10, 13, 9), d(10, 13, 10), { notAttending: true }), // no es tiempo mío
      ev('p', d(10, 14, 12, 50), d(10, 14, 13), { provisional: true, proposalId: 'p1' }),
      ev('v', d(10, 15), d(10, 17), { isUnavailable: true, allDay: true, unavailableKind: 'vacation', unavailableNote: 'Puente' }),
    ]
    const pub = bookingAvailability({ rawEvents, weeklyAvailability, now, timeZone: 'Europe/Madrid' })
    expect(pub.weeks).toEqual(['2026-10-05', '2026-10-12'])
    expect(pub.horizonEnd).toBe(iso(d(10, 19)))
    expect(pub.daysOff).toEqual([
      { date: '2026-10-15', kind: 'vacation' },
      { date: '2026-10-16', kind: 'vacation' },
    ])
    const free = pub.free.map(([s, e]) => [new Date(s), new Date(e)])
    expect(free).toContainEqual([d(10, 8, 9), d(10, 8, 10)])
    expect(free).toContainEqual([d(10, 8, 11), d(10, 8, 13)])
    expect(free.some(([s]) => s.getDate() === 9)).toBe(false)
    expect(free).toContainEqual([d(10, 13, 9), d(10, 13, 13)])
    expect(free).toContainEqual([d(10, 14, 9), d(10, 14, 12, 50)])
    expect(free.some(([s]) => s.getDate() === 15 || s.getDate() === 16)).toBe(false)
    expect(JSON.stringify(pub)).not.toMatch(/Secreto|Puente|title|participant/)
  })

  it('sin semanas declaradas no hay nada que reservar', () => {
    expect(bookingAvailability({ rawEvents: [], weeklyAvailability: [], now, timeZone: 'Europe/Madrid' })).toEqual({
      free: [],
      weeks: [],
      daysOff: [],
      horizonEnd: null,
      timeZone: 'Europe/Madrid',
    })
  })
})

describe('solicitudes', () => {
  const request = {
    id: 'r1',
    name: 'Ana López',
    email: 'Ana@Example.com',
    phone: '',
    reason: 'Hablar del proyecto',
    starts_at: '2026-10-14T08:00:00.000Z',
    ends_at: '2026-10-14T08:30:00.000Z',
    time_zone: 'America/Mexico_City',
  }

  it('busca el contacto por email o teléfono', () => {
    const contacts = [
      { id: 'c1', name: 'Otra', email: 'otra@example.com' },
      { id: 'c2', name: 'Ana', email: 'ana@example.com ' },
      { id: 'c3', name: 'Luis', phone: '+34 600 111 222' },
    ]
    expect(matchContact(request, contacts).id).toBe('c2')
    expect(matchContact({ email: '', phone: '600111222' }, contacts).id).toBe('c3')
    expect(matchContact({ email: 'nadie@x.com', phone: '' }, contacts)).toBeNull()
  })

  it('contacto nuevo con el país de su zona horaria (o España sin revisar)', () => {
    expect(bookingContactData(request)).toEqual({ name: 'Ana López', email: 'Ana@Example.com', phone: '', country: 'MX', timeZone: 'America/Mexico_City' })
    expect(bookingContactData({ ...request, time_zone: 'Etc/Desconocida' })).toMatchObject({ country: 'ES', timeZone: 'Europe/Madrid', countryUnreviewed: true })
  })

  it('título, descripción y mensajes de plantilla en la zona de quien reservó', () => {
    expect(requestTitle(request)).toBe('Reunión con Ana López')
    expect(requestDescription(request)).toBe('Motivo: Hablar del proyecto\nEmail: Ana@Example.com\nReservada desde el enlace de reservas.')
    const yes = decisionMessage(request, 'accepted')
    expect(yes.text).toBe(
      'Hola, Ana.\n\nTe confirmo la reunión del miércoles 14 de octubre a las 02:00 (hora de Ciudad de México), de 30 minutos.\nSi al final no puedes, avísame.\n\nUn saludo.',
    )
    expect(yes.email).toBe('Ana@Example.com')
    const no = decisionMessage(request, 'rejected', { url: 'https://cesi.app/reservar/abc' })
    expect(no.text).toContain('Lo siento, no puedo reunirme el miércoles 14 de octubre a las 02:00')
    expect(no.text).toContain('https://cesi.app/reservar/abc')
  })
})
