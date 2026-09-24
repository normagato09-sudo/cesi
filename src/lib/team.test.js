import { beforeEach, describe, expect, it } from 'vitest'
import {
  DEFAULT_AREAS,
  addArea,
  filterMembers,
  getTeamAreas,
  saveTeamAreas,
  seniorityText,
  socialUrl,
  sortMilestones,
} from './team'

const now = new Date(2026, 8, 24, 12, 0) // 24 sept 2026

describe('antigüedad', () => {
  it('años y meses', () => {
    expect(seniorityText('2024-06-10', now)).toBe('lleva 2 años y 3 meses')
    expect(seniorityText('2025-09-24', now)).toBe('lleva 1 año')
    expect(seniorityText('2025-08-01', now)).toBe('lleva 1 año y 1 mes')
    expect(seniorityText('2026-04-20', now)).toBe('lleva 5 meses')
    expect(seniorityText('2026-08-24', now)).toBe('lleva 1 mes')
  })

  it('semanas y días al principio', () => {
    expect(seniorityText('2026-09-03', now)).toBe('se incorporó hace 3 semanas')
    expect(seniorityText('2026-09-17', now)).toBe('se incorporó hace 1 semana')
    expect(seniorityText('2026-09-20', now)).toBe('se incorporó hace 4 días')
    expect(seniorityText('2026-09-23', now)).toBe('se incorporó ayer')
    expect(seniorityText('2026-09-24', now)).toBe('se incorporó hoy')
    expect(seniorityText('2026-10-05', now)).toBe('se incorpora el 5 de octubre de 2026')
  })

  it('antiguos miembros: cuánto tiempo estuvieron', () => {
    expect(seniorityText('2022-01-15', now, '2024-04-20')).toBe('estuvo 2 años y 3 meses')
    expect(seniorityText('2026-01-01', now, '2026-01-22')).toBe('estuvo 3 semanas')
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

  it('arma los enlaces de redes a partir de usuarios o direcciones', () => {
    expect(socialUrl('instagram', '@ana.voz')).toBe('https://instagram.com/ana.voz')
    expect(socialUrl('tiktok', 'ana')).toBe('https://www.tiktok.com/@ana')
    expect(socialUrl('web', 'cesi.es')).toBe('https://cesi.es')
    expect(socialUrl('linkedin', 'https://www.linkedin.com/in/ana')).toBe('https://www.linkedin.com/in/ana')
  })
})
