import { beforeEach, describe, expect, it } from 'vitest'
import {
  DEFAULT_AREAS,
  addArea,
  filterMembers,
  getTeamAreas,
  saveTeamAreas,
  calendarSpan,
  seniorityText,
  sortMilestones,
} from './team'

const now = new Date(2026, 8, 24, 12, 0) // 24 sept 2026

describe('antigüedad', () => {
  const on = (y, m, d) => new Date(y, m - 1, d, 12, 0)

  it('menos de 1 mes: días o semanas', () => {
    expect(seniorityText('2026-09-03', now)).toBe('se incorporó hace 3 semanas')
    expect(seniorityText('2026-09-17', now)).toBe('se incorporó hace 1 semana')
    expect(seniorityText('2026-09-19', now)).toBe('se incorporó hace 5 días')
    expect(seniorityText('2026-09-23', now)).toBe('se incorporó ayer')
    expect(seniorityText('2026-09-24', now)).toBe('se incorporó hoy')
    expect(seniorityText('2026-10-05', now)).toBe('se incorpora el 5 de octubre de 2026')
  })

  it('entre 1 mes y 1 año: meses y días', () => {
    expect(seniorityText('2026-07-30', on(2026, 8, 30))).toBe('lleva 1 mes')
    expect(seniorityText('2026-07-30', now)).toBe('lleva 1 mes y 25 días')
    expect(seniorityText('2026-07-24', now)).toBe('lleva 2 meses')
    expect(seniorityText('2026-06-23', now)).toBe('lleva 3 meses y 1 día')
    expect(seniorityText('2026-04-20', now)).toBe('lleva 5 meses y 4 días')
  })

  it('1 año o más: años y meses', () => {
    expect(seniorityText('2025-07-10', now)).toBe('lleva 1 año y 2 meses')
    expect(seniorityText('2024-09-24', now)).toBe('lleva 2 años')
    expect(seniorityText('2024-06-10', now)).toBe('lleva 2 años y 3 meses')
    expect(seniorityText('2025-09-24', now)).toBe('lleva 1 año')
  })

  it('finales de mes: del 31/01 al 28/02 es 1 mes', () => {
    expect(calendarSpan(on(2026, 1, 31), on(2026, 2, 28))).toEqual({ months: 1, days: 0 })
    expect(calendarSpan(on(2026, 7, 30), on(2026, 9, 24))).toEqual({ months: 1, days: 25 })
    expect(calendarSpan(on(2026, 1, 31), on(2026, 2, 27))).toEqual({ months: 0, days: 27 })
    expect(calendarSpan(on(2024, 1, 31), on(2024, 2, 29))).toEqual({ months: 1, days: 0 })
    expect(calendarSpan(on(2026, 3, 31), on(2026, 4, 30))).toEqual({ months: 1, days: 0 })
    expect(seniorityText('2026-01-31', on(2026, 2, 28))).toBe('lleva 1 mes')
  })

  it('antiguos miembros: el mismo formato hasta la salida', () => {
    expect(seniorityText('2025-01-15', now, '2026-04-20')).toBe('estuvo 1 año y 3 meses')
    expect(seniorityText('2026-01-01', now, '2026-01-22')).toBe('estuvo 3 semanas')
    expect(seniorityText('2026-07-30', now, '2026-09-24')).toBe('estuvo 1 mes y 25 días')
    expect(seniorityText('2026-01-01', now, '2026-01-01')).toBe('estuvo 1 día')
  })

  it('sin fecha o con fecha inválida no dice nada', () => {
    expect(seniorityText('', now)).toBe('')
    expect(seniorityText('no', now)).toBe('')
  })
})

describe('hitos', () => {
  it('se ordenan como una línea de tiempo y los que no tienen fecha van al final', () => {
    const list = [
      { id: 'c', date: '2025-03-01', text: 'Curso de doblaje' },
      { id: 'x', date: '', text: 'Sin fecha 1' },
      { id: 'a', date: '2023-09-01', text: 'Se incorporó como profesora' },
      { id: 'y', date: '', text: 'Sin fecha 2' },
      { id: 'b', date: '2024-05-10', text: 'Proyecto de radio' },
      { id: 'b2', date: '2024-05-10', text: 'Mismo día, escrito después' },
    ]
    expect(sortMilestones(list).map((m) => m.id)).toEqual(['a', 'b', 'b2', 'c', 'x', 'y'])
    expect(list[0].id).toBe('c') // no cambia la lista original
  })
})

describe('áreas y búsqueda', () => {
  beforeEach(() => localStorage.clear())

  it('la lista de áreas se puede ampliar y se guarda', () => {
    expect(getTeamAreas()).toEqual(DEFAULT_AREAS)
    const next = addArea(getTeamAreas(), '  Producción ')
    expect(addArea(next, 'producción')).toBe(next)
    saveTeamAreas(next)
    expect(getTeamAreas().at(-1)).toBe('Producción')
  })

  it('filtra por estado, área y texto', () => {
    const contacts = [
      { id: '1', name: 'Ana', teamProfile: { status: 'active', area: 'Radio', role: 'Locutora' } },
      { id: '2', name: 'Bea', teamProfile: { status: 'former', area: 'Radio', role: 'Técnica' } },
      { id: '3', name: 'Carlos', teamProfile: { status: 'active', area: 'Doblaje', role: 'Director' } },
      { id: '4', name: 'Sin perfil' },
    ]
    const names = (f) => filterMembers(contacts, f).map((c) => c.name)
    expect(names({})).toEqual(['Ana', 'Carlos'])
    expect(names({ status: 'former' })).toEqual(['Bea'])
    expect(names({ area: 'Radio' })).toEqual(['Ana'])
    expect(names({ query: 'director' })).toEqual(['Carlos'])
  })
})
