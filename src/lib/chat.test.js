import { describe, expect, it } from 'vitest'
import { dayHeading, groupByDay, linkify, listTime, previewText, searchPeople, seenMessageId, totalUnread, unreadText } from './chat'

const zone = 'Europe/Madrid'
const now = new Date('2030-11-06T12:00:00Z')

describe('enlaces', () => {
  it('los enlaces salen como enlaces, sin el punto final', () => {
    expect(linkify('Mira https://cifa.es/x. Y www.ejemplo.com, gracias')).toEqual([
      { text: 'Mira ' },
      { url: 'https://cifa.es/x', text: 'https://cifa.es/x' },
      { text: '. Y ' },
      { url: 'https://www.ejemplo.com', text: 'www.ejemplo.com' },
      { text: ', gracias' },
    ])
    expect(linkify('sin enlaces')).toEqual([{ text: 'sin enlaces' }])
    expect(linkify('')).toEqual([])
  })
})

describe('lista', () => {
  it('última línea: «Tú:», el nombre en las de grupo o «Mensaje eliminado»', () => {
    const base = { last_at: '2030-11-06T10:00:00Z', last_body: 'hola  qué tal', last_author_id: 'ana', last_author_name: 'Ana López' }
    expect(previewText({ ...base, kind: 'private' }, 'yo')).toBe('hola qué tal')
    expect(previewText({ ...base, kind: 'area' }, 'yo')).toBe('Ana: hola qué tal')
    expect(previewText({ ...base, kind: 'team', last_author_id: 'yo' }, 'yo')).toBe('Tú: hola qué tal')
    expect(previewText({ ...base, kind: 'private', last_deleted: true }, 'yo')).toBe('Mensaje eliminado')
    expect(previewText({ kind: 'team' }, 'yo')).toBe('Sin mensajes todavía')
  })

  it('hora: la de hoy, «ayer» o el día (en mi zona)', () => {
    expect(listTime('2030-11-06T09:05:00Z', zone, now)).toBe('10:05')
    expect(listTime('2030-11-05T09:05:00Z', zone, now)).toBe('ayer')
    expect(listTime('2030-11-01T09:05:00Z', zone, now)).toBe('1/11')
  })

  it('no leídos y buscador de personas', () => {
    expect(totalUnread([{ unread: 2 }, { unread: 0 }, { unread: 1 }])).toBe(3)
    expect(unreadText(3)).toBe('Tienes 3 mensajes sin leer')
    expect(unreadText(1)).toBe('Tienes 1 mensaje sin leer')
    const people = [
      { id: 'a', name: 'Álvaro Ruiz', area_name: 'Media' },
      { id: 'b', name: 'Eva', area_name: 'Técnico' },
    ]
    expect(searchPeople(people, 'alva').map((p) => p.id)).toEqual(['a'])
    expect(searchPeople(people, 'tecnico').map((p) => p.id)).toEqual(['b'])
  })
})

describe('conversación', () => {
  const messages = [
    { id: '1', created_at: '2030-11-05T20:00:00Z', mine: true },
    { id: '2', created_at: '2030-11-06T08:00:00Z', mine: false },
    { id: '3', created_at: '2030-11-06T09:00:00Z', mine: true },
  ]

  it('por días, con «Hoy» y «Ayer»', () => {
    expect(groupByDay(messages, zone).map((g) => [g.day, g.messages.length])).toEqual([
      ['2030-11-05', 1],
      ['2030-11-06', 2],
    ])
    expect(dayHeading('2030-11-06', zone, now)).toBe('Hoy')
    expect(dayHeading('2030-11-05', zone, now)).toBe('Ayer')
    expect(dayHeading('2030-11-03', zone, now)).toMatch(/domingo, 3 de noviembre/)
  })

  it('«visto»: mi último mensaje, si la otra persona ha leído después (solo en las privadas)', () => {
    expect(seenMessageId(messages, { kind: 'private', other_read_at: '2030-11-06T09:30:00Z' })).toBe('3')
    expect(seenMessageId(messages, { kind: 'private', other_read_at: '2030-11-06T08:30:00Z' })).toBe(null)
    expect(seenMessageId(messages, { kind: 'area', other_read_at: '2030-11-06T09:30:00Z' })).toBe(null)
  })
})
