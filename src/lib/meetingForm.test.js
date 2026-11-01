import { describe, expect, it } from 'vitest'
import { AVAILABILITY_LABELS, availabilityAt, externalLocalTime, busyDuring, chosenTimes, firstUsefulHour, hourCells, initialForm, initials, localPayload, sharedDescription, withoutInterval } from './meetingForm'

const zone = 'Europe/Madrid'
const now = new Date('2026-11-01T08:00:00Z')

describe('formulario «Nueva reunión»', () => {
  it('parte de un hueco o de un contacto', () => {
    const f = initialForm({ prefill: { date: '2026-11-05', time: '18:00', externalIds: ['c1'], interview: true }, zone, now })
    expect(f).toMatchObject({ mode: 'meeting', date: '2026-11-05', time: '18:00', minutes: 60, contactIds: ['c1'], interview: true })
  })

  it('al editar un evento mío lo rellena todo', () => {
    const event = {
      id: 'e',
      title: 'Claustro',
      start: '2026-11-05T17:00:00.000Z',
      end: '2026-11-05T18:30:00.000Z',
      meetLink: 'https://meet.x/abc',
      location: 'Sala 2',
      description: 'Orden del día',
      participantIds: ['c1'],
      guests: ['Pepe'],
      notAttending: true,
      recurrence: { freq: 'weekly', interval: 2, until: '2027-01-31T22:59:59.000Z' },
    }
    const contacts = [{ id: 'c1', name: 'Ana' }]
    const f = initialForm({ event, contacts, zone, now })
    expect(f).toMatchObject({
      title: 'Claustro',
      date: '2026-11-05',
      time: '18:00',
      minutes: 90,
      link: 'https://meet.x/abc',
      place: 'Sala 2',
      contactIds: ['c1'],
      guests: ['Pepe'],
      notAttending: true,
      repeatFreq: 'weekly',
      repeatInterval: '2',
    })
  })

  it('una franja «No disponible» de todo el día, de varios días', () => {
    const f = { ...initialForm({ zone, now }), mode: 'unavailable', allDay: true, date: '2026-12-24', endDate: '2026-12-26', kind: 'vacation' }
    const t = chosenTimes(f, zone)
    expect(t.start.toISOString()).toBe('2026-12-23T23:00:00.000Z')
    expect(t.end.toISOString()).toBe('2026-12-26T23:00:00.000Z')
    const { payload } = localPayload(f, zone)
    expect(payload).toMatchObject({ isUnavailable: true, allDay: true, unavailableKind: 'vacation', meetLink: '' })
  })

  it('mis eventos acaban como muy tarde a las 23:59 y piden título', () => {
    const f = { ...initialForm({ zone, now }), title: '', date: '2026-11-05', time: '23:30', minutes: 60 }
    expect(localPayload(f, zone).error).toMatch(/título/)
    const { payload } = localPayload({ ...f, title: 'Tarde' }, zone)
    expect(payload.end.toISOString()).toBe('2026-11-05T22:59:00.000Z')
  })

  it('la repetición necesita «cada» válido', () => {
    const f = { ...initialForm({ zone, now }), title: 'x', repeatFreq: 'weekly', repeatInterval: '0' }
    expect(localPayload(f, zone).error).toMatch(/cada cuántas/)
  })
})

describe('tabla «¿Cuándo les va bien?»', () => {
  const rows = [
    { profile_id: 'yo', starts_at: '2026-11-02T00:00:00Z', ends_at: '2026-11-02T08:00:00Z' },
    { profile_id: 'ana', starts_at: '2026-11-02T00:00:00Z', ends_at: '2026-11-02T09:00:00Z' },
  ]
  const cells = hourCells(rows, ['yo', 'ana'], ['2026-11-02'], 'UTC', now)
  const day = cells.get('2026-11-02')

  it('verde si les va bien a todos, naranja si a algunos, gris si a nadie', () => {
    expect(day[7]).toMatchObject({ state: 'nobody', free: 0, total: 2 })
    expect(day[8]).toMatchObject({ state: 'some', free: 1, busy: ['ana'] })
    expect(day[9]).toMatchObject({ state: 'all', free: 2 })
  })

  it('empieza en la primera hora en que a alguien le va bien', () => {
    expect(firstUsefulHour(cells)).toBe(8)
  })

  it('dice quién está ocupado a la hora elegida', () => {
    expect(busyDuring(rows, ['yo', 'ana'], new Date('2026-11-02T08:00:00Z'), new Date('2026-11-02T09:00:00Z'))).toEqual(['ana'])
  })

  it('al editar mi evento, su rato no cuenta como ocupado', () => {
    const mine = [{ profile_id: 'yo', starts_at: '2026-11-02T10:00:00Z', ends_at: '2026-11-02T13:00:00Z' }]
    const out = withoutInterval(mine, 'yo', new Date('2026-11-02T11:00:00Z'), new Date('2026-11-02T12:00:00Z'))
    expect(out.map((r) => [r.starts_at, r.ends_at])).toEqual([
      ['2026-11-02T10:00:00Z', '2026-11-02T11:00:00.000Z'],
      ['2026-11-02T12:00:00.000Z', '2026-11-02T13:00:00Z'],
    ])
  })
})

describe('reunión compartida', () => {
  it('el lugar y los externos van en la descripción', () => {
    const f = { description: 'Hola', place: 'Sala 2' }
    expect(sharedDescription(f, [{ name: 'Ana', email: 'ana@x.com' }, { name: 'Pepe' }])).toBe('Hola\n\nLugar: Sala 2\n\nExternos: Ana (ana@x.com), Pepe')
  })

  it('iniciales', () => {
    expect(initials('Gabriel Ruiz')).toBe('GR')
    expect(initials('')).toBe('?')
  })
})

describe('contactos externos', () => {
  it('su hora allí y si le cae fuera de su horario', () => {
    const week = [0, 1, 2, 3, 4, 5, 6].map((day) => ({ day, enabled: true, slots: [{ start: '09:00', end: '17:00' }] }))
    const ana = { id: 'a', name: 'Ana', timeZone: 'America/Mexico_City', availability: week }
    // 18:00 en Madrid = 11:00 en Ciudad de México (5 nov).
    const start = new Date('2026-11-05T17:00:00Z')
    const end = new Date('2026-11-05T18:00:00Z')
    expect(externalLocalTime(ana, start, end)).toEqual({ time: '11:00', outside: false })
    const late = new Date('2026-11-06T01:00:00Z') // 19:00 allí
    expect(externalLocalTime(ana, late, new Date(late.getTime() + 3600000))).toEqual({ time: '19:00', outside: true })
    expect(externalLocalTime({ name: 'Sin zona' }, start, end)).toBeNull()
    expect(externalLocalTime({ timeZone: 'Asia/Tokyo' }, start, end)).toEqual({ time: '02:00', outside: false })
  })
})

describe('disponibilidad en la lista de participantes', () => {
  it('Disponible, Ocupado (algo que se solapa) o Sin perfil', () => {
    const start = new Date('2030-11-04T17:00:00Z')
    const end = new Date('2030-11-04T18:00:00Z')
    const busy = [
      { profile_id: 'ana', starts_at: '2030-11-04T17:30:00Z', ends_at: '2030-11-04T19:00:00Z' },
      { profile_id: 'luis', starts_at: '2030-11-04T18:00:00Z', ends_at: '2030-11-04T19:00:00Z' },
      { profile_id: 'eva', starts_at: '2030-11-04T00:00:00Z', ends_at: '2030-11-05T00:00:00Z' },
    ]
    const map = availabilityAt(busy, ['ana', 'luis', 'eva', 'iker'], start, end, new Set(['eva']))
    expect(Object.fromEntries(map)).toEqual({ ana: 'busy', luis: 'free', eva: 'noprofile', iker: 'free' })
    expect(AVAILABILITY_LABELS.busy).toBe('Ocupado')
  })
})
