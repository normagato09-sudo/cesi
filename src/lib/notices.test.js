import { describe, expect, it } from 'vitest'
import { audienceLabel, emptyNoticeForm, formFromNotice, pendingByTeam, readSummary, unreadForMe, validateNoticeForm } from './notices'

const notice = (id, extra = {}) => ({
  id,
  title: id,
  body: '',
  area: null,
  area_name: '',
  important: false,
  show_until: null,
  created_at: '2030-11-01T10:00:00Z',
  for_me: true,
  read_at: null,
  expired: false,
  recipients: 0,
  read_count: 0,
  missing_names: '',
  ...extra,
})

describe('avisos', () => {
  it('sin leer para mí: los importantes primero y luego los más nuevos', () => {
    const rows = unreadForMe([
      notice('viejo', { created_at: '2030-11-01T10:00:00Z' }),
      notice('nuevo', { created_at: '2030-11-03T10:00:00Z' }),
      notice('importante', { important: true, created_at: '2030-10-01T10:00:00Z' }),
      notice('leido', { read_at: '2030-11-02T10:00:00Z' }),
      notice('caducado', { expired: true }),
      notice('otra area', { for_me: false }),
    ])
    expect(rows.map((n) => n.id)).toEqual(['importante', 'nuevo', 'viejo'])
  })

  it('quién falta: «8 de 10 · faltan Gabriel y Evan»', () => {
    expect(readSummary(notice('a', { recipients: 10, read_count: 8, missing_names: 'Evan, Gabriel' }))).toBe('8 de 10 · faltan Evan y Gabriel')
    expect(readSummary(notice('a', { recipients: 3, read_count: 2, missing_names: 'Ana' }))).toBe('2 de 3 · falta Ana')
    expect(readSummary(notice('a', { recipients: 3, read_count: 3 }))).toBe('Lo han leído todos (3)')
    expect(readSummary(notice('a'))).toMatch(/nadie/)
  })

  it('con gente pendiente (sin los caducados)', () => {
    const rows = pendingByTeam([
      notice('pendiente', { recipients: 4, read_count: 1 }),
      notice('todos', { recipients: 4, read_count: 4 }),
      notice('caducado', { recipients: 4, read_count: 1, expired: true }),
    ])
    expect(rows.map((n) => n.id)).toEqual(['pendiente'])
  })

  it('para quién y formulario', () => {
    expect(audienceLabel(notice('a'))).toBe('Todo el equipo')
    expect(audienceLabel(notice('a', { area: 'media', area_name: 'Media' }))).toBe('Área Media')
    expect(formFromNotice(notice('a', { area: 'media', important: true, show_until: '2030-12-01' }))).toMatchObject({ area: 'media', important: true, showUntil: '2030-12-01' })
    expect(validateNoticeForm({ ...emptyNoticeForm(), title: ' ' })).toMatchObject({ title: expect.any(String) })
    expect(validateNoticeForm({ ...emptyNoticeForm(), title: 'Reunión' })).toEqual({})
  })
})
