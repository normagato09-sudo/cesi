import { describe, expect, it } from 'vitest'
import {
  canAskConfirmation,
  guestToContactMoves,
  inviteMessage,
  inviteMoves,
  inviteStatus,
  inviteSummaryText,
  meetingInviteUrl,
  missingInviteRows,
  occurrenceForInvite,
  occurrenceRef,
  occurrenceSummary,
  participantKeyOf,
  participantZone,
  reconcilePlan,
} from './meetingInvites'
import { durationText, meetingWhen } from './meetingWhen'
import { expandEvent } from './recurrence'
import { SCOPES } from './seriesEdits'
import { participantEntries } from './participants'

const ana = { id: 'c1', name: 'Ana López', timeZone: 'Europe/Madrid', country: 'ES' }
const luis = { id: 'c2', name: 'Luis Pérez', timeZone: 'America/Mexico_City', country: 'MX' }
const contacts = [ana, luis]

// Reunión única: lunes 5 de octubre de 2026, 18:00–19:00 en Madrid (16:00Z).
const single = {
  id: 'e1',
  title: 'Revisión',
  start: '2026-10-05T16:00:00.000Z',
  end: '2026-10-05T17:00:00.000Z',
  participantIds: ['c1', 'c2'],
  guests: ['Marta'],
  recurrence: null,
}

// Serie semanal: los lunes a las 10:00 en Madrid desde el 5 de octubre.
const weekly = {
  id: 's1',
  title: 'Semanal',
  start: '2026-10-05T08:00:00.000Z',
  end: '2026-10-05T09:00:00.000Z',
  participantIds: ['c1', 'c2'],
  guests: [],
  recurrence: { freq: 'weekly', until: null },
}

const occurrencesOf = (event, from = '2026-10-01', to = '2026-11-15') => expandEvent(event, new Date(from), new Date(to))
const occ = (event, n = 0) => occurrencesOf(event)[n]

function invite(overrides) {
  return {
    token: overrides.token || `t-${Math.random()}`,
    event_id: 'e1',
    occurrence_key: '',
    participant_key: 'contact:c1',
    name: 'Ana López',
    starts_at: single.start,
    ends_at: single.end,
    response: null,
    comment: null,
    needs_reconfirm: false,
    revoked: false,
    ...overrides,
  }
}

const NOW = new Date('2026-10-01T10:00:00.000Z')

describe('qué reunión y qué participante', () => {
  it('una reunión única usa la clave vacía; un día de una serie, su fecha', () => {
    expect(occurrenceRef(occ(single))).toEqual({ eventId: 'e1', key: '' })
    expect(occurrenceRef(occ(weekly, 1))).toEqual({ eventId: 's1', key: '2026-10-12' })
  })

  it('distingue contactos e invitados que no son contactos', () => {
    const entries = participantEntries(single, contacts)
    expect(entries.map(participantKeyOf)).toEqual(['contact:c1', 'contact:c2', 'guest:Marta'])
  })

  it('la zona de cada uno es la de su ficha; la de un invitado, la de este dispositivo', () => {
    const [a, l, m] = participantEntries(single, contacts)
    expect(participantZone(a, 'Asia/Tokyo')).toBe('Europe/Madrid')
    expect(participantZone(l, 'Asia/Tokyo')).toBe('America/Mexico_City')
    expect(participantZone(m, 'Asia/Tokyo')).toBe('Asia/Tokyo')
  })

  it('solo se pide confirmación en reuniones que aún no han empezado', () => {
    expect(canAskConfirmation(occ(single), NOW)).toBe(true)
    expect(canAskConfirmation(occ(single), new Date('2026-10-05T16:30:00.000Z'))).toBe(false)
    expect(canAskConfirmation({ ...occ(single), isUnavailable: true }, NOW)).toBe(false)
    expect(canAskConfirmation({ ...occ(single), provisional: true }, NOW)).toBe(false)
  })
})

describe('enlace y mensaje', () => {
  it('arma /confirmar/<token> en la dirección pública', () => {
    expect(meetingInviteUrl('abc', 'https://cesi.example.com/')).toBe('https://cesi.example.com/confirmar/abc')
  })

  it('el mensaje da el día y la hora en la zona de cada participante', () => {
    const url = 'https://cesi.example.com/confirmar/abc'
    const base = { title: 'Revisión', start: single.start, allDay: false }
    expect(inviteMessage({ ...base, name: 'Ana López', timeZone: 'Europe/Madrid' }, url)).toBe(
      `Hola, Ana. ¿Puedes confirmar si vienes a «Revisión» el lunes 5 de octubre a las 18:00 (hora de España)? ${url}`,
    )
    const place = meetingWhen(single.start, 'America/Mexico_City').place
    expect(inviteMessage({ ...base, name: 'Luis Pérez', timeZone: 'America/Mexico_City' }, url)).toBe(
      `Hola, Luis. ¿Puedes confirmar si vienes a «Revisión» el lunes 5 de octubre a las 10:00 (hora de ${place})? ${url}`,
    )
  })

  it('el día también es el de su zona (puede ser otro)', () => {
    // Lunes 23:30 en México es martes 07:30 en Madrid.
    const start = '2026-10-06T05:30:00.000Z'
    expect(meetingWhen(start, 'America/Mexico_City')).toMatchObject({ day: 'lunes 5 de octubre', time: '23:30' })
    expect(meetingWhen(start, 'Europe/Madrid')).toMatchObject({ day: 'martes 6 de octubre', time: '07:30' })
  })

  it('una reunión de todo el día no lleva hora', () => {
    expect(inviteMessage({ name: '', title: 'Jornada', start: '2026-10-05T00:00:00+02:00', allDay: true, timeZone: 'Europe/Madrid' }, 'U')).toBe(
      'Hola. ¿Puedes confirmar si vienes a «Jornada» el lunes 5 de octubre? U',
    )
  })

  it('duración', () => {
    expect(durationText(single.start, single.end)).toBe('1 h')
    expect(durationText('2026-10-05T16:00:00Z', '2026-10-05T16:30:00Z')).toBe('30 min')
    expect(durationText('2026-10-05T16:00:00Z', '2026-10-05T17:45:00Z')).toBe('1 h 45 min')
  })
})

describe('respuestas y resumen', () => {
  it('estado de cada participante', () => {
    expect(inviteStatus(undefined)).toBe('pending')
    expect(inviteStatus(invite({}))).toBe('pending')
    expect(inviteStatus(invite({ response: 'yes' }))).toBe('yes')
    expect(inviteStatus(invite({ response: 'no', needs_reconfirm: true }))).toBe('reconfirm')
  })

  it('"4 van · 1 no puede · 2 sin responder"', () => {
    expect(inviteSummaryText(['yes', 'yes', 'yes', 'yes', 'no', 'pending', 'pending'])).toBe('4 van · 1 no puede · 2 sin responder')
    expect(inviteSummaryText(['yes', 'no', 'no', 'maybe', 'reconfirm'])).toBe('1 va · 2 no pueden · 1 quizás · 1 a confirmar de nuevo')
  })

  it('sin enlaces no hay resumen; quien no tiene enlace cuenta como sin responder', () => {
    expect(occurrenceSummary([], occ(single), contacts)).toBeNull()
    const invites = [invite({ response: 'yes' }), invite({ participant_key: 'contact:c2', response: 'maybe' }), invite({ participant_key: 'contact:c1', revoked: true, response: 'no' })]
    expect(occurrenceSummary(invites, occ(single), contacts)).toBe('1 va · 1 quizás · 1 sin responder')
  })

  it('cada día de una serie tiene sus propias respuestas', () => {
    const invites = [invite({ event_id: 's1', occurrence_key: '2026-10-12', response: 'yes' })]
    expect(occurrenceSummary(invites, occ(weekly, 0), contacts)).toBeNull()
    expect(occurrenceSummary(invites, occ(weekly, 1), contacts)).toBe('1 va · 1 sin responder')
  })
})

describe('enlaces nuevos', () => {
  it('solo para quien aún no tiene enlace, con la hora de la reunión', () => {
    let n = 0
    const rows = missingInviteRows([invite({})], occ(single), participantEntries(single, contacts), () => `tok${++n}`)
    expect(rows).toEqual([
      { token: 'tok1', event_id: 'e1', occurrence_key: '', participant_key: 'contact:c2', name: 'Luis Pérez', starts_at: single.start, ends_at: single.end },
      { token: 'tok2', event_id: 'e1', occurrence_key: '', participant_key: 'guest:Marta', name: 'Marta', starts_at: single.start, ends_at: single.end },
    ])
  })

  it('en una serie, para ese día', () => {
    const second = occ(weekly, 1)
    const rows = missingInviteRows([], second, participantEntries(second, contacts), () => 't')
    expect(rows[0]).toMatchObject({ event_id: 's1', occurrence_key: '2026-10-12', starts_at: '2026-10-12T08:00:00.000Z' })
  })
})

describe('los enlaces siguen a la reunión', () => {
  it('sin cambios no hay nada que hacer', () => {
    const plan = reconcilePlan([invite({}), invite({ participant_key: 'guest:Marta' })], [single], contacts, NOW)
    expect(plan).toEqual({ revoke: [], reschedule: [], notices: [] })
  })

  it('si se quita a un participante, su enlace deja de valer', () => {
    const plan = reconcilePlan([invite({ token: 'a' }), invite({ token: 'm', participant_key: 'guest:Marta' })], [{ ...single, participantIds: ['c2'], guests: [] }], contacts, NOW)
    expect(plan.revoke).toEqual(['a', 'm'])
  })

  it('si se borra la reunión, todos sus enlaces dejan de valer', () => {
    expect(reconcilePlan([invite({ token: 'a' })], [], contacts, NOW).revoke).toEqual(['a'])
  })

  it('si se borra el contacto, su enlace deja de valer', () => {
    expect(reconcilePlan([invite({ token: 'a' })], [single], [luis], NOW).revoke).toEqual(['a'])
  })

  it('si se cancela ese día de la serie o se quita al participante solo ese día', () => {
    const invites = [
      invite({ token: 'x', event_id: 's1', occurrence_key: '2026-10-12', starts_at: '2026-10-12T08:00:00.000Z', ends_at: '2026-10-12T09:00:00.000Z' }),
      invite({ token: 'y', event_id: 's1', occurrence_key: '2026-10-19', starts_at: '2026-10-19T08:00:00.000Z', ends_at: '2026-10-19T09:00:00.000Z' }),
      invite({ token: 'z', event_id: 's1', occurrence_key: '2026-10-26', starts_at: '2026-10-26T08:00:00.000Z', ends_at: '2026-10-26T09:00:00.000Z' }),
    ]
    const series = { ...weekly, exceptions: { '2026-10-12': { cancelled: true }, '2026-10-19': { participantIds: ['c2'] } } }
    expect(reconcilePlan(invites, [series], contacts, NOW).revoke).toEqual(['x', 'y'])
  })

  it('si la serie termina antes (este y los siguientes), los días de después dejan de valer', () => {
    const series = { ...weekly, recurrence: { freq: 'weekly', until: '2026-10-11T21:59:59.999Z' } }
    const i = invite({ token: 'x', event_id: 's1', occurrence_key: '2026-10-12', starts_at: '2026-10-12T08:00:00.000Z', ends_at: '2026-10-12T09:00:00.000Z' })
    expect(reconcilePlan([i], [series], contacts, NOW).revoke).toEqual(['x'])
    expect(occurrenceForInvite(series, '2026-10-05')).not.toBeNull()
  })

  it('si cambia la hora, se actualiza el enlace y avisa para reenviarlo', () => {
    const moved = { ...single, start: '2026-10-05T17:00:00.000Z', end: '2026-10-05T18:00:00.000Z' }
    const plan = reconcilePlan([invite({ token: 'a', response: 'yes' }), invite({ token: 'b', participant_key: 'contact:c2' })], [moved], contacts, NOW)
    expect(plan.revoke).toEqual([])
    expect(plan.reschedule).toEqual([
      { token: 'a', starts_at: moved.start, ends_at: moved.end },
      { token: 'b', starts_at: moved.start, ends_at: moved.end },
    ])
    expect(plan.notices).toEqual([{ eventId: 'e1', key: '', title: 'Revisión', start: new Date(moved.start) }])
  })

  it('un día de la serie movido solo ese día', () => {
    const series = { ...weekly, exceptions: { '2026-10-12': { start: '2026-10-13T08:00:00.000Z', end: '2026-10-13T09:00:00.000Z' } } }
    const i = invite({ token: 'x', event_id: 's1', occurrence_key: '2026-10-12', starts_at: '2026-10-12T08:00:00.000Z', ends_at: '2026-10-12T09:00:00.000Z' })
    expect(reconcilePlan([i], [series], contacts, NOW).reschedule).toEqual([{ token: 'x', starts_at: '2026-10-13T08:00:00.000Z', ends_at: '2026-10-13T09:00:00.000Z' }])
  })

  it('no toca los enlaces ya desactivados ni los de reuniones terminadas', () => {
    const later = new Date('2026-10-06T00:00:00.000Z')
    expect(reconcilePlan([invite({ revoked: true })], [], contacts, NOW).revoke).toEqual([])
    expect(reconcilePlan([invite({})], [], contacts, later).revoke).toEqual([])
  })
})

describe('mover enlaces al cambiar una serie', () => {
  const seriesInvites = ['2026-10-05', '2026-10-12', '2026-10-19'].map((k) => invite({ token: k, event_id: 's1', occurrence_key: k }))

  it('solo este día: el enlace sigue en su día', () => {
    expect(inviteMoves(seriesInvites, { series: weekly, updated: weekly, occurrence: occ(weekly, 1), scope: SCOPES.THIS })).toEqual([])
  })

  it('toda la serie a otro día de la semana: los días se mueven con ella, sin pisarse', () => {
    const updated = { ...weekly, start: '2026-10-12T08:00:00.000Z', end: '2026-10-12T09:00:00.000Z' }
    expect(inviteMoves(seriesInvites, { series: weekly, updated, occurrence: occ(weekly, 1), scope: SCOPES.ALL })).toEqual([
      { token: '2026-10-19', event_id: 's1', occurrence_key: '2026-10-26' },
      { token: '2026-10-12', event_id: 's1', occurrence_key: '2026-10-19' },
      { token: '2026-10-05', event_id: 's1', occurrence_key: '2026-10-12' },
    ])
  })

  it('toda la serie a otra hora del mismo día: nada que mover (luego cambia la hora)', () => {
    const updated = { ...weekly, start: '2026-10-05T09:00:00.000Z', end: '2026-10-05T10:00:00.000Z' }
    expect(inviteMoves(seriesInvites, { series: weekly, updated, occurrence: occ(weekly, 0), scope: SCOPES.ALL })).toEqual([])
  })

  it('este y los siguientes: los días desde ese pasan a la serie nueva', () => {
    const newEvent = { ...weekly, id: 's2', start: '2026-10-13T08:00:00.000Z', end: '2026-10-13T09:00:00.000Z' }
    expect(inviteMoves(seriesInvites, { series: weekly, updated: weekly, occurrence: occ(weekly, 1), scope: SCOPES.FOLLOWING, newEvent })).toEqual([
      { token: '2026-10-12', event_id: 's2', occurrence_key: '2026-10-13' },
      { token: '2026-10-19', event_id: 's2', occurrence_key: '2026-10-20' },
    ])
  })

  it('si deja de repetirse, queda el enlace de ese día', () => {
    const updated = { ...weekly, recurrence: null }
    expect(inviteMoves(seriesInvites, { series: weekly, updated, occurrence: occ(weekly, 1), scope: SCOPES.ALL })).toEqual([
      { token: '2026-10-12', event_id: 's1', occurrence_key: '' },
    ])
  })

  it('una reunión única que pasa a repetirse: su enlace es el del primer día', () => {
    const updated = { ...single, recurrence: { freq: 'weekly' } }
    expect(inviteMoves([invite({ token: 'a' })], { series: single, updated, occurrence: occ(single), scope: null })).toEqual([
      { token: 'a', event_id: 'e1', occurrence_key: '2026-10-05' },
    ])
  })

  it('un invitado guardado como contacto conserva su enlace', () => {
    const invites = [invite({ token: 'm', participant_key: 'guest:Marta' }), invite({ token: 'a' })]
    expect(guestToContactMoves(invites, 'e1', 'Marta', 'c9')).toEqual([{ token: 'm', participant_key: 'contact:c9' }])
  })
})
