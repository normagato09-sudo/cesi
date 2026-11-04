import { describe, expect, it } from 'vitest'
import { allItems, ceoGroups, groupOfSection, memberGroups, sectionActive } from './sections.js'

describe('ceoGroups', () => {
  it('cuatro grupos, sin las pantallas de las áreas; Mi perfil y Accesos solo con sincronización', () => {
    const groups = ceoGroups(true)
    expect(groups.map((g) => g.label)).toEqual(['Mi panel', 'Agenda', 'Equipo', 'Formación'])
    expect(allItems(groups).map((i) => i.id)).toEqual([
      'home',
      'messages',
      'newsletter',
      'profile',
      'calendar',
      'contacts',
      'org',
      'team-tasks',
      'goals',
      'notices',
      'clockins',
      'access',
      'team-edits',
      'courses',
      'students',
      'testimonials',
    ])
    expect(allItems(groups).find((i) => i.id === 'contacts').label).toBe('Mis contactos')
    expect(allItems(ceoGroups(false)).some((i) => ['access', 'profile', 'team-tasks', 'org', 'testimonials', 'goals', 'messages'].includes(i.id))).toBe(false)
  })
})

describe('memberGroups', () => {
  it('Mi panel y solo las pantallas con permiso (nunca Accesos)', () => {
    const groups = memberGroups({ calendario: 'read', cursos: 'write', alumnos: 'none', fichajes: 'write' })
    expect(groups.map((g) => g.id)).toEqual(['panel', 'agenda', 'training'])
    expect(allItems(groups).map((i) => i.id)).toEqual(['home', 'messages', 'notices', 'newsletter', 'shared-calendar', 'team-tasks', 'org', 'testimonials', 'goals', 'clock', 'contacts', 'courses'])
    expect(groups[0].items[0].label).toBe('Mi panel')
  })

  it('sin permisos, Mi panel, Calendario, Tareas, Objetivos, Fichaje y sus Contactos', () => {
    expect(allItems(memberGroups({})).map((i) => i.id)).toEqual(['home', 'messages', 'notices', 'newsletter', 'shared-calendar', 'team-tasks', 'org', 'testimonials', 'goals', 'clock', 'contacts'])
    expect(allItems(memberGroups({})).find((i) => i.id === 'contacts').label).toBe('Contactos')
  })

  it('Alianzas solo para el área Alianzas (con permiso de contactos)', () => {
    const ids = (area) => allItems(memberGroups({ contactos: 'write' }, area)).map((i) => i.id)
    expect(ids('alianzas')).toContain('alliances')
    expect(ids('direccion')).not.toContain('alliances')
    expect(ids('media')).not.toContain('alliances')
    expect(ids('media')).toContain('contacts')
  })

  it('el tablero de su área con su nombre; Directivo, ni tableros ni Finanzas', () => {
    const items = (area) => allItems(memberGroups({}, area))
    expect(items('media').find((i) => i.id === 'board').label).toBe('Publicaciones')
    expect(items('moderacion').find((i) => i.id === 'board').label).toBe('Registro de moderación')
    expect(items('direccion').some((i) => i.id === 'board' || i.id === 'boards')).toBe(false)
    expect(items('alianzas').some((i) => i.id === 'board' || i.id === 'boards')).toBe(false)
    expect(items('finanzas').map((i) => i.id)).toContain('finance')
    expect(items('direccion').map((i) => i.id)).not.toContain('finance')
    expect(items('media').map((i) => i.id)).not.toContain('finance')
  })

  it('Directivo: Mi panel, su Contactos, Cursos y Alumnos; nunca Equipo, Vacantes ni Asistencia', () => {
    const levels = { contactos: 'read', equipo: 'read', vacantes: 'read', cursos: 'write', alumnos: 'read', asistencia: 'read' }
    expect(allItems(memberGroups(levels, 'direccion')).map((i) => i.id)).toEqual([
      'home', 'messages', 'notices', 'newsletter', 'shared-calendar', 'team-tasks', 'org', 'testimonials', 'goals', 'clock', 'contacts', 'courses', 'students',
    ])
  })

  it('con permiso de calendario sigue sin ver el mío (solo el compartido)', () => {
    const items = allItems(memberGroups({ calendario: 'write', contactos: 'read' })).map((i) => i.id)
    expect(items).toEqual(['home', 'messages', 'notices', 'newsletter', 'shared-calendar', 'team-tasks', 'org', 'testimonials', 'goals', 'clock', 'contacts'])
  })
})

describe('groupOfSection', () => {
  it('el informe cuenta como Inicio', () => {
    expect(sectionActive('home', 'report')).toBe(true)
    expect(groupOfSection(ceoGroups(true), 'report').id).toBe('panel')
    expect(groupOfSection(ceoGroups(true), 'students').id).toBe('training')
  })
})
