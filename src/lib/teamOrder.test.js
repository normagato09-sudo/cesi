import { describe, expect, it } from 'vitest'
import { headAreas, isHeadOf, memberAreas, moveItem, orderPatches, roleIn, sortByPosition, teamGroups } from './teamOrder'
import { removeDepartment, renameDepartment } from './departments'

const member = (id, name, roles, extra = {}) => ({
  id,
  name,
  teamProfile: { status: 'active', roles: roles.map(([role, area], i) => ({ id: `${id}${i}`, role, area, start: '2025-01-01', end: null })), ...extra },
})

const ana = member('ana', 'Ana', [['Moderadora', 'Moderación']])
const bea = member('bea', 'Bea', [['Moderadora', 'Moderación'], ['Técnica', 'Técnico']])
const carlos = member('carlos', 'Carlos', [['Técnico', 'Técnico']])
const sinDep = { id: 'sd', name: 'Sin', teamProfile: { status: 'active', area: '', roles: [] } }
const antiguo = { ...member('old', 'Antiguo', [['Moderador', 'Moderación']]), teamProfile: { status: 'former', area: 'Moderación', roles: [] } }

describe('memberAreas y roleIn', () => {
  it('los departamentos de sus roles actuales, o «sin departamento»', () => {
    expect(memberAreas(bea)).toEqual(['Moderación', 'Técnico'])
    expect(memberAreas(sinDep)).toEqual([''])
    expect(roleIn(bea, 'Técnico')).toBe('Técnica')
  })
})

describe('sortByPosition', () => {
  it('primero por su posición; sin posición, al final y por nombre', () => {
    const zoe = member('zoe', 'Zoe', [['X', 'Moderación']], { order: { Moderación: 0 } })
    const list = sortByPosition([ana, bea, zoe], 'Moderación')
    expect(list.map((c) => c.id)).toEqual(['zoe', 'ana', 'bea'])
  })
})

describe('teamGroups', () => {
  const contacts = [ana, bea, carlos, sinDep, antiguo, { id: 'x', name: 'Contacto' }]
  const areas = ['Moderación', 'Técnico', 'Radio']

  it('agrupa a los activos por departamento, en el orden de la lista, con «Sin departamento» al final', () => {
    const groups = teamGroups(contacts, areas)
    expect(groups.map((g) => [g.label, g.members.map((c) => c.id)])).toEqual([
      ['Moderación', ['ana', 'bea']],
      ['Técnico', ['bea', 'carlos']],
      ['Radio', []],
      ['Sin departamento', ['sd']],
    ])
  })

  it('con búsqueda, solo los grupos con alguien que coincide; con filtro, solo ese departamento', () => {
    expect(teamGroups(contacts, areas, { query: 'carl' }).map((g) => g.area)).toEqual(['Técnico'])
    expect(teamGroups(contacts, areas, { area: 'Radio' }).map((g) => g.area)).toEqual(['Radio'])
  })

  it('cada persona tiene su propia posición en cada departamento', () => {
    const b = { ...bea, teamProfile: { ...bea.teamProfile, order: { Moderación: 1, Técnico: 0 } } }
    const a = { ...ana, teamProfile: { ...ana.teamProfile, order: { Moderación: 0 } } }
    const groups = teamGroups([a, b, carlos], areas)
    expect(groups[0].members.map((c) => c.id)).toEqual(['ana', 'bea'])
    expect(groups[1].members.map((c) => c.id)).toEqual(['bea', 'carlos'])
  })
})

describe('orderPatches y jefe del departamento', () => {
  it('guarda la posición de cada uno, solo de los que cambian, sin tocar la de otros departamentos', () => {
    const patches = orderPatches([carlos, bea], 'Técnico')
    expect(patches.map((p) => [p.id, p.patch.teamProfile.order])).toEqual([
      ['carlos', { Técnico: 0 }],
      ['bea', { Técnico: 1 }],
    ])
    const applied = { ...bea, teamProfile: { ...bea.teamProfile, order: { Moderación: 3, Técnico: 1 } } }
    expect(orderPatches([carlos, applied], 'Técnico').map((p) => p.id)).toEqual(['carlos'])
  })

  it('jefe/a: el primero, solo si ya se ha ordenado', () => {
    expect(isHeadOf(ana, 'Moderación', [ana, bea])).toBe(false)
    const b = { ...bea, teamProfile: { ...bea.teamProfile, order: { Técnico: 0 } } }
    expect(isHeadOf(b, 'Técnico', [b, carlos])).toBe(true)
    expect(headAreas(b, [ana, b, carlos])).toEqual(['Técnico'])
  })

  it('moveItem', () => {
    expect(moveItem(['a', 'b', 'c'], 0, 2)).toEqual(['b', 'c', 'a'])
    expect(moveItem(['a', 'b'], 1, 5)).toEqual(['a', 'b'])
  })
})

describe('departamentos y orden', () => {
  const ordered = { ...ana, teamProfile: { ...ana.teamProfile, area: 'Moderación', order: { Moderación: 2, Radio: 0 } } }

  it('al renombrar, la posición pasa al nombre nuevo', () => {
    const { contactPatches } = renameDepartment(['Moderación', 'Radio'], 'Moderación', 'Comunidad', [ordered], [])
    expect(contactPatches[0].patch.teamProfile.order).toEqual({ Comunidad: 2, Radio: 0 })
  })

  it('al borrar y pasar a otro departamento, va al final de ese', () => {
    const { contactPatches } = removeDepartment(['Moderación', 'Radio'], 'Moderación', 'Radio', [ordered], [])
    expect(contactPatches[0].patch.teamProfile.order).toEqual({ Radio: 0 })
  })
})

describe('teamGroups con vacantes', () => {
  const vacancies = [
    { id: 'v1', title: 'Moderador/a', area: 'Moderación', status: 'open', openedAt: '2026-09-01' },
    { id: 'v2', title: 'Locutor/a', area: 'Radio', status: 'filled', openedAt: '2026-08-01' },
    { id: 'v3', title: 'Sin área', area: '', status: 'in_progress', openedAt: '2026-07-01' },
    { id: 'v4', title: 'Moderador/a de noche', area: 'Moderación', status: 'in_progress', openedAt: '2026-10-01' },
  ]

  it('cada departamento lleva sus vacantes (las más recientes primero) y sale «Sin departamento» si hay alguna', () => {
    const groups = teamGroups([ana], ['Moderación', 'Radio'], { vacancies })
    expect(groups.map((g) => [g.label, g.vacancies.map((v) => v.id)])).toEqual([
      ['Moderación', ['v4', 'v1']],
      ['Radio', ['v2']],
      ['Sin departamento', ['v3']],
    ])
  })

  it('con búsqueda, también las vacantes por su título', () => {
    const groups = teamGroups([ana], ['Moderación', 'Radio'], { vacancies, query: 'locutor' })
    expect(groups.map((g) => [g.area, g.members.length, g.vacancies.map((v) => v.id)])).toEqual([['Radio', 0, ['v2']]])
  })
})
