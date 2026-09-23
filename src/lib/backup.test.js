import { beforeEach, describe, expect, it } from 'vitest'
import { buildBackup, parseBackup, restoreBackup } from './backup'
import { getPreferences, savePreferences } from './preferences'
import { getAllRules, newRule, rulesStore } from './rules'
import { getAllProposals, proposalsStore } from './proposals'
import { createContact, getAllContacts } from './contacts'

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
    expect(backup.version).toBe(4)
    localStorage.clear()
    restoreBackup(parseBackup(JSON.stringify(backup)))
    expect(getAllProposals()[0].title).toBe('Demo')
    expect(getAllContacts()[0]).toMatchObject({ timeZone: 'America/Mexico_City', country: 'MX' })
  })

  it('rechaza archivos que no son de CESI', () => {
    expect(() => parseBackup('{"app":"otra"}')).toThrow(/no es una copia/)
    expect(() => parseBackup('no json')).toThrow(/JSON/)
  })
})
