import { describe, expect, it } from 'vitest'
import { bossText, buildOrgChart, positionOf, sinceText } from './orgChart'
import { areaPatch } from './profiles'

const row = (id, name, area, extra = {}) => ({ id, name, role: 'equipo', area, direction_role: null, time_zone: 'Europe/Madrid', ...extra })
const rows = [
  { id: 'ceo', name: 'Norma', role: 'ceo', area: null },
  row('d1', 'Ana López', 'direccion', { direction_role: 'director' }),
  row('d2', 'Luis Pérez', 'direccion', { direction_role: 'coordinador' }),
  row('d3', 'Marta Ruiz', 'direccion'),
  row('p1', 'José Gil', 'formacion'),
  row('m1', 'Sara Martín', 'media'),
  row('x1', 'Sin Área', null),
  // Un puesto que no es de Directivo no cuenta.
  row('t1', 'Tomás Ríos', 'tecnico', { direction_role: 'director' }),
]

describe('organigrama', () => {
  it('reparte por puesto, área y profesores', () => {
    const chart = buildOrgChart(rows)
    expect(chart.ceo.name).toBe('Norma')
    expect(chart.board.map((b) => [b.id, b.people.map((p) => p.id)])).toEqual([
      ['director', ['d1']],
      ['subdirector', []],
      ['secretario', []],
      ['coordinador', ['d2']],
    ])
    expect(chart.boardOther.map((p) => p.id)).toEqual(['d3'])
    expect(chart.areas.map((a) => a.name)).toEqual(['Alianzas', 'RRHH', 'Media', 'Técnico', 'Finanzas', 'Legal', 'Ciberseguridad', 'Moderación'])
    expect(chart.areas.find((a) => a.id === 'media').people.map((p) => p.id)).toEqual(['m1'])
    expect(chart.teachers.map((p) => p.id)).toEqual(['p1'])
    expect(chart.noArea.map((p) => p.id)).toEqual(['x1'])
    expect(positionOf(chart.people.get('t1'))).toBe('Técnico')
    expect(positionOf(chart.people.get('d3'))).toBe('Directivo')
  })

  it('el buscador filtra por nombre sin acentos', () => {
    const chart = buildOrgChart(rows, 'jose')
    expect(chart.teachers.map((p) => p.id)).toEqual(['p1'])
    expect(chart.areas.every((a) => a.people.length === 0)).toBe(true)
    expect(chart.board.every((b) => b.people.length === 0)).toBe(true)
  })

  it('a quién responde cada uno', () => {
    const { people } = buildOrgChart(rows)
    expect(bossText(people.get('ceo'), people)).toBe(null)
    expect(bossText(people.get('d1'), people)).toBe('Norma (CEO)')
    expect(bossText(people.get('m1'), people)).toBe('Ana López (Director/a)')
    expect(bossText(people.get('p1'), people)).toBe('Luis Pérez (Coordinador/a)')
    const sinCoordinador = buildOrgChart(rows.filter((r) => r.id !== 'd2')).people
    expect(bossText(sinCoordinador.get('p1'), sinCoordinador)).toBe('Coordinador/a (sin asignar)')
  })

  it('cuánto lleva en el equipo', () => {
    const now = new Date(2030, 10, 10)
    expect(sinceText(new Date(2030, 10, 9).toISOString(), now)).toBe('Lleva 1 día')
    expect(sinceText(new Date(2030, 7, 10).toISOString(), now)).toBe('Lleva 3 meses')
    expect(sinceText(new Date(2029, 8, 15).toISOString(), now)).toBe('Lleva 1 año y 1 mes')
    expect(sinceText(null, now)).toBe(null)
  })

  it('al cambiar de área se quita el puesto de Directivo', () => {
    expect(areaPatch({ direction_role: 'director' }, 'media')).toEqual({ area: 'media', direction_role: null })
    expect(areaPatch({ direction_role: 'director' }, 'direccion')).toEqual({ area: 'direccion' })
    expect(areaPatch({}, '')).toEqual({ area: null })
  })
})
