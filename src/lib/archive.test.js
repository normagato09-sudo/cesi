import { beforeEach, describe, expect, it } from 'vitest'
import { archivePatch, archivedList, formerToArchivePlan, isArchived, unarchivePatch, unarchived } from './archive'
import { addGroupToParticipants, contactsInGroup, contactsWithoutGroup, groupOptions } from './groups'
import { contactsSection, isActiveMember } from './team'
import { runPendingMigrations } from './dataMigrations'
import { MIGRATIONS } from './migrations'
import { getAllContacts } from './contacts'
import { getAllGroups } from './groups'
import { migrateBackupData } from './backup'

const NOW = new Date('2026-10-10T10:00:00Z')
const former = (id, extra = {}) => ({ id, name: id, country: 'ES', timeZone: 'Europe/Madrid', teamProfile: { status: 'former', leftAt: '2026-01-31' }, ...extra })
const active = (id, extra = {}) => ({ id, name: id, country: 'ES', timeZone: 'Europe/Madrid', teamProfile: { status: 'active' }, ...extra })
const contact = (id, extra = {}) => ({ id, name: id, country: 'ES', timeZone: 'Europe/Madrid', ...extra })

beforeEach(() => localStorage.clear())

describe('archivo de contactos', () => {
  it('archivar y desarchivar', () => {
    expect(archivePatch(NOW)).toEqual({ archived: true, archivedAt: NOW.toISOString() })
    expect(unarchivePatch()).toEqual({ archived: false, archivedAt: null })
    expect(isArchived(contact('a', { archived: true }))).toBe(true)
    expect(unarchived([contact('a', { archived: true }), contact('b')]).map((c) => c.id)).toEqual(['b'])
  })

  it('los archivados no salen en Contactos, Equipo ni grupos, pero siguen en sus grupos', () => {
    const list = [contact('a', { archived: true, groupIds: ['g'] }), contact('b', { groupIds: ['g'] }), active('c', { archived: true })]
    expect(contactsSection(list).map((c) => c.id)).toEqual(['b'])
    expect(isActiveMember(list[2])).toBe(false)
    expect(contactsInGroup('g', list).map((c) => c.id)).toEqual(['b'])
    expect(addGroupToParticipants([], 'g', list)).toEqual(['b'])
    expect(groupOptions([{ id: 'g', name: 'G' }], [list[0]])).toEqual([])
    // Al borrar el grupo se quita también de los archivados.
    expect(contactsWithoutGroup('g', list).map((p) => p.id)).toEqual(['a', 'b'])
  })

  it('lista de archivados con buscador y filtro', () => {
    const list = [former('Zoe', { archived: true }), contact('Ana', { archived: true, email: 'ana@x.es' }), contact('Bea')]
    expect(archivedList(list).map((c) => c.id)).toEqual(['Ana', 'Zoe'])
    expect(archivedList(list, { filter: 'former' }).map((c) => c.id)).toEqual(['Zoe'])
    expect(archivedList(list, { filter: 'other' }).map((c) => c.id)).toEqual(['Ana'])
    expect(archivedList(list, { query: 'ana@' }).map((c) => c.id)).toEqual(['Ana'])
  })
})

describe('migración: antiguos miembros al archivo', () => {
  const groups = [{ id: 'gf', name: 'Antiguos miembros' }, { id: 'gp', name: 'Profesores' }]

  it('archiva a los antiguos miembros y saca a todos del grupo, sin tocar nada más', () => {
    const contacts = [
      former('f1', { groupIds: ['gf', 'gp'], teamProfile: { status: 'former', leftAt: '2026-01-31', formerGroupHandled: true } }),
      contact('c1', { groupIds: ['gf'] }),
      active('a1', { groupIds: ['gp'] }),
    ]
    const plan = formerToArchivePlan(contacts, groups, NOW)
    expect(plan.groupId).toBe('gf')
    expect(plan.contactPatches).toEqual([
      { id: 'f1', patch: { archived: true, archivedAt: NOW.toISOString(), groupIds: ['gp'], teamProfile: { status: 'former', leftAt: '2026-01-31' } } },
      { id: 'c1', patch: { groupIds: [] } },
    ])
  })

  it('se ejecuta una sola vez y borra el grupo', () => {
    localStorage.setItem('cesi_contacts_v1', JSON.stringify([former('f1', { groupIds: ['gf'] }), contact('c1')]))
    localStorage.setItem('cesi_groups_v1', JSON.stringify(groups))
    expect(runPendingMigrations(NOW)).toContain(MIGRATIONS.formerToArchive2026)
    expect(getAllContacts().find((c) => c.id === 'f1')).toMatchObject({ archived: true, groupIds: [] })
    expect(getAllGroups().map((g) => g.id)).toEqual(['gp'])
    expect(runPendingMigrations(NOW)).not.toContain(MIGRATIONS.formerToArchive2026)
  })

  it('una copia de seguridad anterior se importa ya migrada', () => {
    const out = migrateBackupData({ version: 16, contacts: [former('f1', { groupIds: ['gf'] })], groups })
    expect(out.contacts[0]).toMatchObject({ archived: true, groupIds: [] })
    expect(out.groups.map((g) => g.id)).toEqual(['gp'])
  })
})
