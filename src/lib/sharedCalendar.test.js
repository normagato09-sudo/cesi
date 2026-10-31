import { describe, expect, it } from 'vitest'
import {
  addDaysKey,
  ceoBusyBlocks,
  dayLabel,
  daysRange,
  emptyMeetingForm,
  formFromMeeting,
  freeHours,
  itemsByDay,
  meetingItem,
  meetingTimes,
  mondayOf,
  sharedEventsForCalendar,
  validateMeetingForm,
  weekKeys,
  weekLabel,
} from './sharedCalendar'

const MADRID = 'Europe/Madrid'
const GUAYAQUIL = 'America/Guayaquil'

describe('días en una zona', () => {
  it('lunes de la semana y sus 7 días', () => {
    expect(mondayOf('2030-11-07')).toBe('2030-11-04')
    expect(mondayOf('2030-11-10')).toBe('2030-11-04')
    expect(mondayOf('2030-11-04')).toBe('2030-11-04')
    expect(weekKeys('2030-11-04')).toEqual(['2030-11-04', '2030-11-05', '2030-11-06', '2030-11-07', '2030-11-08', '2030-11-09', '2030-11-10'])
    expect(addDaysKey('2030-12-30', 3)).toBe('2031-01-02')
  })

  it('rango de la semana en la zona (en UTC)', () => {
    const { start, end } = daysRange('2030-11-04', 7, MADRID)
    expect(start.toISOString()).toBe('2030-11-03T23:00:00.000Z')
    expect(end.toISOString()).toBe('2030-11-10T23:00:00.000Z')
  })

  it('etiquetas', () => {
    expect(dayLabel('2030-11-04')).toBe('lun 4 nov')
    expect(weekLabel('2030-11-04')).toBe('4–10 nov 2030')
    expect(weekLabel('2030-10-28')).toBe('28 oct – 3 nov 2030')
  })
})

describe('formulario de reunión', () => {
  const form = { title: 'Ensayo', date: '2030-11-04', time: '18:00', minutes: 30, description: '', link: '', participants: ['p1'] }

  it('la hora elegida se guarda en UTC según la zona de quien organiza', () => {
    expect(meetingTimes(form, MADRID).start.toISOString()).toBe('2030-11-04T17:00:00.000Z')
    expect(meetingTimes(form, GUAYAQUIL).start.toISOString()).toBe('2030-11-04T23:00:00.000Z')
    expect(meetingTimes(form, MADRID).end.toISOString()).toBe('2030-11-04T17:30:00.000Z')
  })

  it('validación', () => {
    expect(validateMeetingForm(form, MADRID)).toEqual({})
    expect(validateMeetingForm({ ...form, title: ' ', participants: [] }, MADRID)).toMatchObject({
      title: expect.any(String),
      participants: expect.any(String),
    })
    // 2:30 del último domingo de marzo no existe en Madrid.
    expect(validateMeetingForm({ ...form, date: '2030-03-31', time: '02:30' }, MADRID).time).toContain('no existe')
  })

  it('editar: el formulario sale de la reunión en mi zona, sin el organizador', () => {
    const meeting = {
      title: 'Ensayo',
      starts_at: '2030-11-04T17:00:00Z',
      ends_at: '2030-11-04T18:30:00Z',
      description: 'x',
      link: '',
      organizer_id: 'yo',
      participants: [
        { id: 'yo', name: 'Yo', status: 'accepted' },
        { id: 'p1', name: 'Ana', status: 'pending' },
      ],
    }
    expect(formFromMeeting(meeting, GUAYAQUIL)).toMatchObject({ date: '2030-11-04', time: '12:00', minutes: 90, participants: ['p1'] })
  })

  it('nueva: la próxima hora en punto', () => {
    const f = emptyMeetingForm(MADRID, new Date('2030-11-04T16:20:00Z'))
    expect(f).toMatchObject({ date: '2030-11-04', time: '18:00', minutes: 60, participants: [] })
  })
})

describe('libre/ocupado', () => {
  it('una hora es libre si nadie tiene nada en ella; las pasadas, no cuentan', () => {
    const busy = [
      { profile_id: 'a', starts_at: '2030-11-04T00:00:00Z', ends_at: '2030-11-04T16:00:00Z' }, // hasta las 17:00 en Madrid
      { profile_id: 'b', starts_at: '2030-11-04T17:30:00Z', ends_at: '2030-11-04T18:00:00Z' }, // 18:30–19:00
    ]
    const grid = freeHours(busy, ['2030-11-04'], MADRID, new Date('2030-01-01T00:00:00Z'))
    const hours = grid.get('2030-11-04')
    expect(hours[16]).toBe('busy')
    expect(hours[17]).toBe('free')
    expect(hours[18]).toBe('busy')
    expect(hours[19]).toBe('free')
    expect(freeHours([], ['2030-11-04'], MADRID, new Date('2030-11-04T12:00:00Z')).get('2030-11-04')[10]).toBe('past')
  })
})

describe('en el calendario', () => {
  const row = (id, extra = {}) => ({
    id,
    title: id,
    starts_at: '2030-11-04T17:00:00Z',
    ends_at: '2030-11-04T18:00:00Z',
    cancelled: false,
    my_status: 'accepted',
    participants: [],
    ...extra,
  })

  it('en el mío salen como «Compartida», sin las canceladas ni las rechazadas', () => {
    const events = sharedEventsForCalendar([row('a'), row('b', { cancelled: true }), row('c', { my_status: 'declined' }), row('d', { my_status: 'pending' })])
    expect(events.map((e) => e.id)).toEqual(['shared:a', 'shared:d'])
    expect(events[0]).toMatchObject({ shared: true, sharedPending: false, title: 'a' })
    expect(events[1].sharedPending).toBe(true)
  })

  it('por día, según la zona', () => {
    // 23:30 UTC del lunes es martes en Madrid y lunes en Guayaquil.
    const item = meetingItem(row('x', { starts_at: '2030-11-04T23:30:00Z', ends_at: '2030-11-05T00:00:00Z' }))
    expect(itemsByDay([item], ['2030-11-04', '2030-11-05'], MADRID).get('2030-11-05')).toHaveLength(1)
    expect(itemsByDay([item], ['2030-11-04', '2030-11-05'], GUAYAQUIL).get('2030-11-04')).toHaveLength(1)
  })
})

describe('mis bloques ocupados', () => {
  it('solo horas, juntas, sin las que organizo sin asistir', () => {
    const now = new Date(2030, 10, 4, 9, 0)
    const ev = (id, h1, h2, extra = {}) => ({ id, title: `secreto ${id}`, start: new Date(2030, 10, 4, h1).toISOString(), end: new Date(2030, 10, 4, h2).toISOString(), ...extra })
    const blocks = ceoBusyBlocks([ev('a', 10, 11), ev('b', 11, 12), ev('c', 15, 16, { notAttending: true })], now)
    expect(blocks).toEqual([[new Date(2030, 10, 4, 10).toISOString(), new Date(2030, 10, 4, 12).toISOString()]])
    expect(JSON.stringify(blocks)).not.toContain('secreto')
  })
})
