import { describe, expect, it } from 'vitest'
import {
  BOARDS,
  BOARD_AREAS,
  boardColumns,
  emptyItemForm,
  filterItems,
  formFromItem,
  isLate,
  looksLikePassword,
  monthWeeks,
  myBoardItems,
  reviewState,
  validateItemForm,
} from './boards'

const item = (id, extra = {}) => ({ id, title: id, description: '', owner_id: null, due_date: null, due_time: null, priority: null, status: 'nueva', fields: {}, ...extra })
const tecnico = BOARDS.tecnico
const legal = BOARDS.legal

describe('configuración', () => {
  it('cada tablero con sus estados, los terminados entre ellos y sus campos', () => {
    expect(BOARD_AREAS).toEqual(['moderacion', 'media', 'tecnico', 'ciberseguridad', 'legal'])
    for (const area of BOARD_AREAS) {
      const cfg = BOARDS[area]
      expect(cfg.area).toBe(area)
      expect(cfg.statuses.length).toBeGreaterThan(1)
      for (const d of cfg.done) expect(cfg.statuses.map((s) => s.id)).toContain(d)
    }
    expect(BOARDS.moderacion.sensitive && BOARDS.ciberseguridad.sensitive).toBe(true)
    expect(BOARDS.media.date.withTime && BOARDS.media.calendar).toBe(true)
  })
})

describe('tablero y lista', () => {
  const items = [
    item('a', { status: 'nueva', owner_id: 'eva', fields: { type: 'error', requestedBy: 'Luis' } }),
    item('b', { status: 'en_curso', fields: { type: 'mejora' }, description: 'Cambiar el logo de la web' }),
    item('c', { status: 'resuelta', owner_id: 'eva' }),
  ]

  it('una columna por estado', () => {
    expect(boardColumns(tecnico, items).map((c) => [c.id, c.items.map((i) => i.id)])).toEqual([
      ['nueva', ['a']],
      ['en_curso', ['b']],
      ['en_pruebas', []],
      ['resuelta', ['c']],
    ])
  })

  it('filtros por estado, responsable, campos propios y buscador', () => {
    expect(filterItems(items, { owner: 'eva' }).map((i) => i.id)).toEqual(['a', 'c'])
    expect(filterItems(items, { owner: 'none' }).map((i) => i.id)).toEqual(['b'])
    expect(filterItems(items, { fields: { type: 'mejora' } }).map((i) => i.id)).toEqual(['b'])
    expect(filterItems(items, { query: 'logo' }).map((i) => i.id)).toEqual(['b'])
    expect(filterItems(items, { query: 'luis' }).map((i) => i.id)).toEqual(['a'])
    expect(filterItems(items, { status: 'resuelta' }).map((i) => i.id)).toEqual(['c'])
  })
})

describe('fechas', () => {
  const today = '2030-11-06' // miércoles

  it('atrasado: fecha pasada y sin terminar', () => {
    expect(isLate(tecnico, item('a', { due_date: '2030-11-05' }), today)).toBe(true)
    expect(isLate(tecnico, item('a', { due_date: '2030-11-05', status: 'resuelta' }), today)).toBe(false)
    expect(isLate(tecnico, item('a', { due_date: '2030-11-06' }), today)).toBe(false)
  })

  it('Legal: en naranja a menos de 30 días y en rojo si ya pasó (esté como esté)', () => {
    expect(reviewState(legal, item('a', { due_date: '2030-11-01', status: 'en_vigor' }), today)).toBe('late')
    expect(reviewState(legal, item('a', { due_date: '2030-12-01', status: 'en_vigor' }), today)).toBe('soon')
    expect(reviewState(legal, item('a', { due_date: '2031-01-01' }), today)).toBe(null)
    expect(isLate(legal, item('a', { due_date: '2030-11-01', status: 'en_vigor' }), today)).toBe(true)
  })

  it('Mi tablero: lo mío sin terminar y, en Legal, las revisiones cercanas de todos', () => {
    const rows = myBoardItems(
      tecnico,
      [item('luego', { owner_id: 'yo', due_date: '2030-11-20' }), item('semana', { owner_id: 'yo', due_date: '2030-11-09' }), item('atrasada', { owner_id: 'yo', due_date: '2030-11-01' }), item('hecha', { owner_id: 'yo', status: 'resuelta' }), item('otro', { owner_id: 'eva' })],
      'yo',
      today,
    )
    expect(rows.mine.map((r) => [r.item.id, r.late, r.week])).toEqual([
      ['atrasada', true, false],
      ['semana', false, true],
      ['luego', false, false],
    ])
    const legalRows = myBoardItems(legal, [item('pronto', { status: 'en_vigor', due_date: '2030-11-20' }), item('lejos', { status: 'en_vigor', due_date: '2031-06-01' })], 'yo', today)
    expect(legalRows.reviews.map((r) => r.item.id)).toEqual(['pronto'])
  })

  it('semanas del mes, de lunes a domingo', () => {
    const weeks = monthWeeks('2030-11-01')
    expect(weeks[0][0]).toBe('2030-10-28')
    expect(weeks.at(-1)[6]).toBe('2030-12-01')
    expect(weeks.every((w) => w.length === 7)).toBe(true)
    expect(monthWeeks('2030-12-01').at(-1)[6]).toBe('2031-01-05')
  })
})

describe('formulario', () => {
  it('vacío, desde un elemento y validado', () => {
    const empty = emptyItemForm(tecnico, 'yo')
    expect(empty).toMatchObject({ owner: 'yo', status: 'nueva', fields: { type: '', system: '', requestedBy: '' } })
    expect(formFromItem(tecnico, item('a', { fields: { type: 'error' } })).fields).toEqual({ type: 'error', system: '', requestedBy: '' })
    expect(validateItemForm(tecnico, { ...empty, title: ' ' })).toMatchObject({ title: expect.any(String) })
    expect(validateItemForm(BOARDS.media, { ...emptyItemForm(BOARDS.media), title: 'Post', fields: { network: '', link: 'instagram.com' } })).toMatchObject({
      'field:link': expect.any(String),
    })
    expect(validateItemForm(tecnico, { ...empty, title: 'A', dueTime: '10:00' })).toMatchObject({ dueDate: expect.any(String) })
  })

  it('aviso de contraseñas: avisa, pero no lo confunde con un texto normal', () => {
    expect(looksLikePassword('La contraseña: Hola1234')).toBe(true)
    expect(looksLikePassword('api_key=abc123')).toBe(true)
    expect(looksLikePassword('Usuario admin con clave Xk9#mPq2!vLz')).toBe(true)
    expect(looksLikePassword('Revisar la política de contraseñas del servidor')).toBe(false)
    expect(looksLikePassword('Ver https://example.com/Docs/Seguridad-2030?a=1')).toBe(false)
  })
})
