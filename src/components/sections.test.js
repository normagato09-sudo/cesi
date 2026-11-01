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
      'alliances',
      'team',
      'vacancies',
      'team-tasks',
      'goals',
      'boards',
      'notices',
      'clockins',
      'access',
      'courses',
      'students',
      'attendance',
    ])
    expect(allItems(ceoGroups(false)).some((i) => ['access', 'profile', 'team-tasks', 'goals'].includes(i.id))).toBe(false)
  })
})

describe('memberGroups', () => {
  it('Mi panel y solo las pantallas con permiso (nunca Accesos)', () => {
    const groups = memberGroups({ calendario: 'read', cursos: 'write', alumnos: 'none', fichajes: 'write' })
    expect(groups.map((g) => g.id)).toEqual(['panel', 'training'])
    expect(allItems(groups).map((i) => i.id)).toEqual(['home', 'notices', 'shared-calendar', 'team-tasks', 'goals', 'clock', 'courses'])
    expect(groups[0].items[0].label).toBe('Mi panel')
  })

  it('sin permisos, Mi panel, Calendario, Tareas, Objetivos y Fichaje', () => {
    expect(allItems(memberGroups({})).map((i) => i.id)).toEqual(['home', 'notices', 'shared-calendar', 'team-tasks', 'goals', 'clock'])
  })

  it('Alianzas solo para las áreas Alianzas y Directivo (con permiso de contactos)', () => {
    const ids = (area) => allItems(memberGroups({ contactos: 'write' }, area)).map((i) => i.id)
    expect(ids('alianzas')).toContain('alliances')
    expect(ids('direccion')).toContain('alliances')
    expect(ids('media')).not.toContain('alliances')
    expect(ids('media')).toContain('contacts')
  })

  it('el tablero de su área con su nombre; Directivo, «Tableros»', () => {
    const items = (area) => allItems(memberGroups({}, area))
    expect(items('media').find((i) => i.id === 'board').label).toBe('Publicaciones')
    expect(items('moderacion').find((i) => i.id === 'board').label).toBe('Registro de moderación')
    expect(items('direccion').map((i) => i.id)).toContain('boards')
    expect(items('alianzas').some((i) => i.id === 'board' || i.id === 'boards')).toBe(false)
  })

  it('con permiso de calendario sigue sin ver el mío (solo el compartido)', () => {
    const items = allItems(memberGroups({ calendario: 'write', contactos: 'read' })).map((i) => i.id)
    expect(items).toEqual(['home', 'notices', 'shared-calendar', 'team-tasks', 'goals', 'clock', 'contacts'])
  })
})

describe('groupOfSection', () => {
  it('el informe cuenta como Inicio', () => {
    expect(sectionActive('home', 'report')).toBe(true)
    expect(groupOfSection(ceoGroups(true), 'report').id).toBe('panel')
    expect(groupOfSection(ceoGroups(true), 'attendance').id).toBe('training')
  })
})
