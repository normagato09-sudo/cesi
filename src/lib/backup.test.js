import { beforeEach, describe, expect, it } from 'vitest'
import { buildBackup, parseBackup, restoreBackup } from './backup'
import { getPreferences, savePreferences } from './preferences'

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

  it('rechaza archivos que no son de CESI', () => {
    expect(() => parseBackup('{"app":"otra"}')).toThrow(/no es una copia/)
    expect(() => parseBackup('no json')).toThrow(/JSON/)
  })
})
