import { describe, expect, it } from 'vitest'
import { EMPTY_FILTER, filterCategories, filterEvents, filterLabel, isFilterActive } from './calendarFilter'

const events = [
  { id: 1, category: 'Cliente', tags: ['Entrevista'] },
  { id: 2, category: 'Cliente', tags: [] },
  { id: 3, category: 'Reunión', tags: ['entrevista'] },
  { id: 4, category: 'No disponible', tags: [], isUnavailable: true },
]

describe('filtro del calendario', () => {
  it('sin filtro se ve todo', () => {
    expect(isFilterActive(EMPTY_FILTER)).toBe(false)
    expect(filterEvents(events, EMPTY_FILTER)).toBe(events)
  })

  it('filtra por categoría, por etiqueta (sin distinguir mayúsculas) o por las dos', () => {
    const ids = (filter) => filterEvents(events, filter).map((e) => e.id)
    expect(ids({ category: 'Cliente', tag: null })).toEqual([1, 2, 4])
    expect(ids({ category: null, tag: 'ENTREVISTA' })).toEqual([1, 3, 4])
    expect(ids({ category: 'Cliente', tag: 'entrevista' })).toEqual([1, 4])
  })

  it('describe el filtro activo', () => {
    expect(filterLabel({ category: 'Cliente', tag: 'entrevista' })).toBe('Cliente · #entrevista')
    expect(filterLabel({ category: null, tag: 'entrevista' })).toBe('#entrevista')
  })

  it('ofrece también las categorías usadas en reuniones antiguas', () => {
    expect(filterCategories(['Reunión', 'Cliente'], [...events, { category: 'Congreso' }])).toEqual([
      'Reunión',
      'Cliente',
      'Congreso',
    ])
  })
})
