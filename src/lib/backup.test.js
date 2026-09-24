import { beforeEach, describe, expect, it } from 'vitest'
import { buildBackup, parseBackup, restoreBackup } from './backup'
import { getPreferences, savePreferences } from './preferences'
import { getAllRules, newRule, rulesStore } from './rules'
import { getAllProposals, proposalsStore } from './proposals'
import { createContact, getAllContacts } from './contacts'
import { getAllGroups, groupsStore } from './groups'
import { DEFAULT_AREAS, getTeamAreas, saveTeamAreas } from './team'
import { createEvent, getAllEvents } from './localEvents'

beforeEach(() => localStorage.clear())

describe('copia de seguridad', () => {
  it('incluye las preferencias y las restaura', () => {
    savePreferences({ bufferMinutes: 15 })
    const backup = buildBackup()
    expect(backup.preferences.bufferMinutes).toBe(15)
    localStorage.clear()
    restoreBackup(parseBackup(JSON.stringify(backup)))
    expect(getPreferences().bufferMinutes).toBe(15)
  })

  it('acepta copias antiguas (v1) sin preferencias', () => {
    savePreferences({ bufferMinutes: 10 })
    restoreBackup(parseBackup(JSON.stringify({ app: 'cesi', version: 1, events: [], contacts: [] })))
    expect(getPreferences().bufferMinutes).toBe(0)
  })

  it('incluye las reglas por tipo de reunión', () => {
    rulesStore.create(newRule({ target: 'Cliente' }))
    const backup = buildBackup()
    expect(backup.rules).toHaveLength(1)
    localStorage.clear()
    restoreBackup(parseBackup(JSON.stringify(backup)))
    expect(getAllRules()[0].target).toBe('Cliente')
    restoreBackup(parseBackup(JSON.stringify({ app: 'cesi', version: 2, events: [], contacts: [] })))
    expect(getAllRules()).toEqual([])
    expect(() => parseBackup(JSON.stringify({ app: 'cesi', events: [], contacts: [], rules: 'x' }))).toThrow(/reglas/)
  })

  it('incluye propuestas y contactos con zona horaria y disponibilidad', () => {
    proposalsStore.create({ title: 'Demo', durationMinutes: 60, participantIds: [], guests: [] })
    createContact({ name: 'Luis', timeZone: 'America/Mexico_City', country: 'MX', availability: [] })
    const backup = buildBackup()
    expect(backup.version).toBe(9)
    localStorage.clear()
    restoreBackup(parseBackup(JSON.stringify(backup)))
    expect(getAllProposals()[0].title).toBe('Demo')
    expect(getAllContacts()[0]).toMatchObject({ timeZone: 'America/Mexico_City', country: 'MX' })
  })

  it('incluye los grupos, los grupos de cada contacto y las notas de las reuniones', () => {
    const group = groupsStore.create({ name: 'Profesores', color: '#2563eb' })
    createContact({ name: 'Ana', country: 'ES', timeZone: 'Europe/Madrid', groupIds: [group.id] })
    createEvent({ title: 'Clase', start: '2026-09-01T08:00:00.000Z', end: '2026-09-01T09:00:00.000Z', notes: 'Tema 3' })
    const backup = buildBackup()
    localStorage.clear()
    restoreBackup(parseBackup(JSON.stringify(backup)))
    expect(getAllGroups()[0].name).toBe('Profesores')
    expect(getAllContacts()[0].groupIds).toEqual([group.id])
    expect(getAllEvents()[0].notes).toBe('Tema 3')
  })

  it('acepta copias v4 sin grupos (quedan vacíos)', () => {
    groupsStore.create({ name: 'Equipo', color: '#2563eb' })
    restoreBackup(parseBackup(JSON.stringify({ app: 'cesi', version: 4, events: [], contacts: [], proposals: [] })))
    expect(getAllGroups()).toEqual([])
    expect(() => parseBackup(JSON.stringify({ app: 'cesi', events: [], contacts: [], groups: {} }))).toThrow(/grupos/)
  })

  it('incluye el perfil de equipo de los contactos y las áreas', () => {
    saveTeamAreas([...DEFAULT_AREAS, 'Producción'])
    createContact({
      name: 'Ana',
      country: 'ES',
      timeZone: 'Europe/Madrid',
      teamProfile: { status: 'active', role: 'Profesora', area: 'Profesorado', joinedAt: '2024-01-10', milestones: [] },
    })
    const backup = buildBackup()
    localStorage.clear()
    restoreBackup(parseBackup(JSON.stringify(backup)))
    expect(getTeamAreas()).toContain('Producción')
    expect(getAllContacts()[0].teamProfile.role).toBe('Profesora')
    // Las copias v6 no traen áreas: se usan las de siempre.
    restoreBackup(parseBackup(JSON.stringify({ app: 'cesi', version: 6, events: [], contacts: [] })))
    expect(getTeamAreas()).toEqual(DEFAULT_AREAS)
  })

  it('rechaza archivos que no son de CESI', () => {
    expect(() => parseBackup('{"app":"otra"}')).toThrow(/no es una copia/)
    expect(() => parseBackup('no json')).toThrow(/JSON/)
  })
})
