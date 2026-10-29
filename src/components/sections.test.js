import { describe, expect, it } from 'vitest'
import { allItems, ceoGroups, groupOfSection, memberGroups, sectionActive } from './sections.js'

describe('ceoGroups', () => {
  it('cuatro grupos con todas las pantallas; Accesos solo con sincronización', () => {
    const groups = ceoGroups(true)
    expect(groups.map((g) => g.label)).toEqual(['Mi panel', 'Agenda', 'Equipo', 'Formación'])
    expect(allItems(groups).map((i) => i.id)).toEqual([
      'home',
      'tasks',
      'calendar',
      'contacts',
      'slots',
      'team',
      'vacancies',
      'clockins',
      'access',
      'courses',
      'students',
      'attendance',
    ])
    expect(allItems(ceoGroups(false)).some((i) => i.id === 'access')).toBe(false)
  })
})

describe('memberGroups', () => {
  it('Mi panel y solo las pantallas con permiso (nunca Accesos)', () => {
    const groups = memberGroups({ calendario: 'read', cursos: 'write', alumnos: 'none', fichajes: 'write' })
    expect(groups.map((g) => g.id)).toEqual(['panel', 'agenda', 'people', 'training'])
    expect(allItems(groups).map((i) => i.id)).toEqual(['home', 'calendar', 'clockins', 'courses'])
    expect(groups[0].items[0].label).toBe('Mi panel')
  })

  it('sin permisos, solo Mi panel', () => {
    expect(allItems(memberGroups({})).map((i) => i.id)).toEqual(['home'])
  })
})

describe('groupOfSection', () => {
  it('el informe cuenta como Inicio', () => {
    expect(sectionActive('home', 'report')).toBe(true)
    expect(groupOfSection(ceoGroups(true), 'report').id).toBe('panel')
    expect(groupOfSection(ceoGroups(true), 'attendance').id).toBe('training')
  })
})
