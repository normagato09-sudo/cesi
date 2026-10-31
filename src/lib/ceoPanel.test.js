import { describe, expect, it } from 'vitest'
import { areaProgress, nameOf, overdueTasks, panelRanges, splitOpenEntries, teamMeetings, weekHoursByPerson } from './ceoPanel'

const profiles = new Map([
  ['a', { id: 'a', display_name: 'Ana cuenta', email: 'a@x.com' }],
  ['b', { id: 'b', display_name: '', email: 'b@x.com' }],
  ['c', { id: 'c', display_name: 'Ceo', email: 'c@x.com' }],
])
const portals = new Map([['a', { full_name: 'Ana López' }]])
const nameFor = (id) => nameOf(id, profiles, portals)

describe('nombres', () => {
  it('el del perfil, el de la cuenta o el email', () => {
    expect(nameFor('a')).toBe('Ana López')
    expect(nameFor('b')).toBe('b@x.com')
    expect(nameFor('c')).toBe('Ceo')
  })
})

describe('fichajes', () => {
  it('trabajando ahora (menos de 16 h) y sin salida (más antiguas)', () => {
    const now = new Date('2030-11-04T12:00:00Z')
    const { working, stale } = splitOpenEntries(
      [
        { id: '1', profile_id: 'a', clock_in: '2030-11-04T09:30:00Z' },
        { id: '2', profile_id: 'b', clock_in: '2030-11-02T09:00:00Z' },
      ],
      nameFor,
      now,
    )
    expect(working).toMatchObject([{ id: '1', name: 'Ana López', minutes: 150, can_fix: true }])
    expect(stale.map((e) => e.id)).toEqual(['2'])
  })

  it('horas de la semana de todas las personas de equipo, con las de 0 horas marcadas', () => {
    const rows = weekHoursByPerson(
      [
        { id: 'a', area: 'media' },
        { id: 'b', area: null },
      ],
      [
        { profile_id: 'a', clock_in: '2030-11-04T08:00:00Z', clock_out: '2030-11-04T10:00:00Z' },
        { profile_id: 'a', clock_in: '2030-11-05T08:00:00Z', clock_out: null },
      ],
      nameFor,
      (area) => (area === 'media' ? 'Media' : 'Sin área'),
    )
    expect(rows).toEqual([
      { id: 'a', name: 'Ana López', areaName: 'Media', minutes: 120, count: 2, zero: false },
      { id: 'b', name: 'b@x.com', areaName: 'Sin área', minutes: 0, count: 0, zero: true },
    ])
  })
})

describe('tareas', () => {
  const t = (id, extra) => ({ id, title: id, area: 'media', status: 'pendiente', due_date: null, created_at: '2030-10-01T10:00:00Z', ...extra })

  it('atrasadas, con los días de retraso', () => {
    const rows = overdueTasks([t('ayer', { due_date: '2030-11-03' }), t('semana', { due_date: '2030-10-28' }), t('hecha', { due_date: '2030-10-01', status: 'hecha' })], '2030-11-04')
    expect(rows.map((r) => [r.id, r.daysLate])).toEqual([
      ['semana', 7],
      ['ayer', 1],
    ])
  })

  it('progreso por área este mes (fecha límite del mes o, sin fecha, creadas este mes)', () => {
    const rows = areaProgress(
      [
        t('a', { due_date: '2030-11-10', status: 'hecha' }),
        t('b', { due_date: '2030-11-20' }),
        t('c', { due_date: '2030-10-20', status: 'hecha' }),
        t('d', { created_at: '2030-11-02T10:00:00Z', status: 'hecha' }),
        t('e', { area: 'legal', due_date: '2030-11-01' }),
      ],
      [
        { id: 'media', name: 'Media' },
        { id: 'legal', name: 'Legal' },
        { id: 'finanzas', name: 'Finanzas' },
      ],
      '2030-11-04',
      'Europe/Madrid',
    )
    expect(rows).toEqual([
      { id: 'media', name: 'Media', done: 2, total: 3 },
      { id: 'legal', name: 'Legal', done: 0, total: 1 },
      { id: 'finanzas', name: 'Finanzas', done: 0, total: 0 },
    ])
  })
})

describe('reuniones de hoy y mañana', () => {
  it('todas las del equipo, con las mías marcadas y cuántos han aceptado', () => {
    const rows = teamMeetings(
      [
        { id: 'm2', organizer_id: 'a', title: 'Tarde', starts_at: '2030-11-04T16:00:00Z', ends_at: '2030-11-04T17:00:00Z', cancelled_at: null },
        { id: 'm1', organizer_id: 'b', title: 'Mañana', starts_at: '2030-11-04T09:00:00Z', ends_at: '2030-11-04T10:00:00Z', cancelled_at: null },
      ],
      [
        { meeting_id: 'm1', profile_id: 'b', status: 'accepted' },
        { meeting_id: 'm1', profile_id: 'a', status: 'accepted' },
        { meeting_id: 'm1', profile_id: 'c', status: 'pending' },
        { meeting_id: 'm2', profile_id: 'a', status: 'accepted' },
        { meeting_id: 'm2', profile_id: 'b', status: 'declined' },
      ],
      nameFor,
      'c',
    )
    expect(rows.map((r) => [r.id, r.mine, r.accepted, r.invited, r.my_status])).toEqual([
      ['m1', true, 1, 2, 'pending'],
      ['m2', false, 0, 1, null],
    ])
    expect(rows[0].participants[0]).toMatchObject({ id: 'b', name: 'b@x.com' })
  })

  it('rangos en mi zona', () => {
    const r = panelRanges(new Date('2030-11-06T10:00:00Z'), 'Europe/Madrid')
    expect(r.today).toBe('2030-11-06')
    expect(r.tomorrow).toBe('2030-11-07')
    expect(r.days.start.toISOString()).toBe('2030-11-05T23:00:00.000Z')
    expect(r.days.end.toISOString()).toBe('2030-11-07T23:00:00.000Z')
    expect(r.week.start.toISOString()).toBe('2030-11-03T23:00:00.000Z')
  })
})
