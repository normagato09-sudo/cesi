import { describe, expect, it } from 'vitest'
import { allItems, ceoGroups, groupOfSection, memberGroups, sectionActive } from './sections.js'

describe('ceoGroups', () => {
  it('cuatro grupos con todas las pantallas; Mi perfil y Accesos solo con sincronización', () => {
    const groups = ceoGroups(true)
    expect(groups.map((g) => g.label)).toEqual(['Mi panel', 'Agenda', 'Equipo', 'Formación'])
    expect(allItems(groups).map((i) => i.id)).toEqual([
      'home',
      'profile',
      'calendar',
      'contacts',
      'slots',
      'team',
      'vacancies',
      'team-tasks',
      'clockins',
      'access',
      'courses',
      'students',
      'attendance',
    ])
    expect(allItems(ceoGroups(false)).some((i) => ['access', 'profile', 'team-tasks'].includes(i.id))).toBe(false)
  })
})

describe('memberGroups', () => {
  it('Mi panel y solo las pantallas con permiso (nunca Accesos)', () => {
    const groups = memberGroups({ calendario: 'read', cursos: 'write', alumnos: 'none', fichajes: 'write' })
    expect(groups.map((g) => g.id)).toEqual(['panel', 'training'])
    expect(allItems(groups).map((i) => i.id)).toEqual(['home', 'shared-calendar', 'team-tasks', 'clock', 'courses'])
    expect(groups[0].items[0].label).toBe('Mi panel')
  })

  it('sin permisos, Mi panel, Calendario, Tareas y Fichaje', () => {
    expect(allItems(memberGroups({})).map((i) => i.id)).toEqual(['home', 'shared-calendar', 'team-tasks', 'clock'])
  })

  it('con permiso de calendario sigue sin ver el mío (solo el compartido)', () => {
    const items = allItems(memberGroups({ calendario: 'write', contactos: 'read' })).map((i) => i.id)
    expect(items).toEqual(['home', 'shared-calendar', 'team-tasks', 'clock', 'contacts'])
  })
})

describe('groupOfSection', () => {
  it('el informe cuenta como Inicio', () => {
    expect(sectionActive('home', 'report')).toBe(true)
    expect(groupOfSection(ceoGroups(true), 'report').id).toBe('panel')
    expect(groupOfSection(ceoGroups(true), 'attendance').id).toBe('training')
  })
})
