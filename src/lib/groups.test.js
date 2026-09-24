import { beforeEach, describe, expect, it } from 'vitest'
import {
  addGroupToParticipants,
  contactsWithoutGroup,
  getAllGroups,
  groupOptions,
  groupsOfContact,
  groupsStore,
  nextGroupColor,
  validateGroupName,
  GROUP_COLORS,
} from './groups'

const contacts = [
  { id: 'ana', name: 'Ana', groupIds: ['prof', 'equipo'] },
  { id: 'luis', name: 'Luis', groupIds: ['prof'] },
  { id: 'eva', name: 'Eva', groupIds: [] },
  { id: 'sin', name: 'Sin grupos' },
]
const groups = [
  { id: 'equipo', name: 'Equipo', color: GROUP_COLORS[0] },
  { id: 'prof', name: 'Profesores', color: GROUP_COLORS[1] },
  { id: 'vacio', name: 'Colaboradores', color: GROUP_COLORS[2] },
]

describe('añadir grupo a los participantes', () => {
  it('añade a todos sus contactos de una vez', () => {
    expect(addGroupToParticipants([], 'prof', contacts)).toEqual(['ana', 'luis'])
  })

  it('no duplica los que ya estaban', () => {
    expect(addGroupToParticipants(['luis', 'eva'], 'prof', contacts)).toEqual(['luis', 'eva', 'ana'])
    expect(addGroupToParticipants(['ana', 'luis'], 'prof', contacts)).toEqual(['ana', 'luis'])
  })

  it('ofrece solo grupos con contactos que coinciden con lo escrito (sin acentos)', () => {
    expect(groupOptions(groups, contacts).map((o) => [o.group.name, o.members.length])).toEqual([
      ['Equipo', 1],
      ['Profesores', 2],
    ])
    expect(groupOptions(groups, contacts, 'PROFE').map((o) => o.group.id)).toEqual(['prof'])
  })
})

describe('grupos', () => {
  beforeEach(() => localStorage.clear())

  it('valida nombres vacíos y repetidos (salvo el propio al renombrar)', () => {
    expect(validateGroupName('  ', groups)).toBe('Escribe el nombre del grupo.')
    expect(validateGroupName('equipo', groups)).toBe('Ya tienes un grupo «equipo».')
    expect(validateGroupName('Equipo', groups, 'equipo')).toBeNull()
  })

  it('borrar un grupo solo lo quita de sus contactos', () => {
    expect(contactsWithoutGroup('prof', contacts)).toEqual([
      { id: 'ana', groupIds: ['equipo'] },
      { id: 'luis', groupIds: [] },
    ])
  })

  it('ignora grupos borrados al mostrar los de un contacto', () => {
    expect(groupsOfContact({ groupIds: ['prof', 'borrado'] }, groups).map((g) => g.name)).toEqual(['Profesores'])
  })

  it('guarda los grupos en localStorage ordenados por nombre y con colores distintos', () => {
    groupsStore.create({ name: 'Profesores', color: nextGroupColor([]) })
    groupsStore.create({ name: 'Equipo', color: nextGroupColor(getAllGroups()) })
    const list = getAllGroups()
    expect(list.map((g) => g.name)).toEqual(['Equipo', 'Profesores'])
    expect(list[0].color).not.toBe(list[1].color)
    expect(JSON.parse(localStorage.getItem('cesi_groups_v1'))).toHaveLength(2)
  })
})
