import { beforeEach, describe, expect, it } from 'vitest'
import { headerLabel, readView, stepDate, writeView } from './calendarNav'

beforeEach(() => localStorage.clear())

describe('navegación del calendario', () => {
  it('recuerda la vista elegida', () => {
    expect(readView()).toBe('month')
    writeView('week')
    expect(readView()).toBe('week')
    writeView('otra')
    expect(readView()).toBe('week')
  })

  it('anterior y siguiente según la vista', () => {
    const d = new Date(2026, 10, 4)
    expect(stepDate(d, 'month', false, 1).getMonth()).toBe(11)
    expect(stepDate(d, 'week', false, -1).getDate()).toBe(28)
    expect(stepDate(d, 'day', false, 1).getDate()).toBe(5)
  })

  it('título de la cabecera', () => {
    expect(headerLabel(new Date(2026, 10, 4), 'month', false)).toBe('noviembre 2026')
  })
})
