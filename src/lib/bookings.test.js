import { describe, expect, it } from 'vitest'
import { bookingAvailability, bookingContactData, decisionMessage, linkSettings, matchContact, requestDescription, requestTitle, requestVisitor } from './bookings'
import { emptyWeek } from './weeklySchedule'

const d = (month, day, h = 0, m = 0) => new Date(2026, month - 1, day, h, m)
const iso = (date) => date.toISOString()
// Mi horario: lunes a viernes de 9:00 a 13:00.
const morning = emptyWeek().map((e) => (e.day >= 1 && e.day <= 5 ? { ...e, enabled: true, slots: [{ start: '09:00', end: '13:00' }] } : e))
const ev = (id, start, end, extra = {}) => ({ id, title: `Secreto ${id}`, start: iso(start), end: iso(end), recurrence: null, participantIds: ['x'], ...extra })

describe('huecos que se publican', () => {
  const now = d(10, 7, 10) // miércoles 7/10/2026
  it('mi horario desde hoy hasta las semanas elegidas + 2, sin mis reuniones ni franjas, y nada más', () => {
    const rawEvents = [
      ev('a', d(10, 8, 10), d(10, 8, 11)),
      ev('b', d(10, 9, 9), d(10, 9, 13), { isUnavailable: true }),
      ev('c', d(10, 13, 9), d(10, 13, 10), { notAttending: true }), // no es tiempo mío
      ev('p', d(10, 14, 12, 50), d(10, 14, 13), { provisional: true, proposalId: 'p1' }),
      ev('v', d(10, 15), d(10, 17), { isUnavailable: true, allDay: true, unavailableKind: 'vacation', unavailableNote: 'Puente' }),
    ]
    const pub = bookingAvailability({ rawEvents, workingHours: morning, horizonWeeks: 1, now, timeZone: 'Europe/Madrid' })
    // 1 semana + 2 de margen desde hoy (Supabase recorta a la semana que se puede reservar).
    expect(pub.horizonEnd).toBe(iso(d(10, 28)))
    expect(pub.daysOff).toEqual([
      { date: '2026-10-15', kind: 'vacation' },
      { date: '2026-10-16', kind: 'vacation' },
    ])
    const free = pub.free.map(([s, e]) => [new Date(s), new Date(e)])
    expect(free[0]).toEqual([d(10, 7, 9), d(10, 7, 13)]) // hoy, desde el principio del día
    expect(free[free.length - 1]).toEqual([d(10, 27, 9), d(10, 27, 13)])
    expect(free.some(([s]) => s.getDay() === 0 || s.getDay() === 6)).toBe(false)
    expect(free).toContainEqual([d(10, 8, 9), d(10, 8, 10)])
    expect(free).toContainEqual([d(10, 8, 11), d(10, 8, 13)])
    expect(free.some(([s]) => s.getDate() === 9)).toBe(false)
    expect(free).toContainEqual([d(10, 13, 9), d(10, 13, 13)])
    expect(free).toContainEqual([d(10, 14, 9), d(10, 14, 12, 50)])
    expect(free.some(([s]) => s.getDate() === 15 || s.getDate() === 16)).toBe(false)
    expect(JSON.stringify(pub)).not.toMatch(/Secreto|Puente|title|participant/)
  })

  it('con el horario vacío no hay nada que reservar', () => {
    expect(bookingAvailability({ rawEvents: [], workingHours: emptyWeek(), now, timeZone: 'Europe/Madrid' })).toEqual({
      free: [],
      daysOff: [],
      horizonEnd: iso(d(11, 18)),
      timeZone: 'Europe/Madrid',
    })
  })

  it('"Se puede reservar hasta": 4 semanas por defecto', () => {
    expect(linkSettings(null).horizonWeeks).toBe(4)
    expect(linkSettings({ horizon_weeks: 8 }).horizonWeeks).toBe(8)
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

describe('país de quien reserva', () => {
  const request = { starts_at: '2026-10-14T16:00:00Z', ends_at: '2026-10-14T17:00:00Z', time_zone: 'America/Mexico_City' }

  it('requestVisitor da su país y su hora local', () => {
    expect(requestVisitor(request, 'Europe/Madrid')).toEqual({ flag: '🇲🇽', place: 'México (Ciudad de México)', time: '10:00', dayNote: '' })
    expect(requestVisitor({ ...request, time_zone: 'Asia/Tokyo' }, 'Europe/Madrid')).toMatchObject({
      place: 'Japón',
      time: '01:00',
      dayNote: 'día siguiente',
    })
  })

  it('sin hora si es la misma que la mía, y null si no se sabe su zona', () => {
    expect(requestVisitor({ ...request, time_zone: 'Europe/Madrid' }, 'Europe/Madrid')).toMatchObject({ time: null })
    expect(requestVisitor({ ...request, time_zone: '' })).toBeNull()
  })

  it('el contacto queda con el país y la zona elegidos', () => {
    expect(bookingContactData({ name: 'Ana', time_zone: 'America/Argentina/Cordoba' })).toMatchObject({
      country: 'AR',
      timeZone: 'America/Argentina/Cordoba',
    })
  })
})
