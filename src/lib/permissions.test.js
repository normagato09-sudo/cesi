import { describe, expect, it } from 'vitest'
import { AREAS, SCREENS, allows, areaName, effectivePermissions, normalizeLevels } from './permissions'

describe('allows', () => {
  it('editar incluye ver; ninguno no deja nada', () => {
    expect(allows('write', 'read')).toBe(true)
    expect(allows('read', 'read')).toBe(true)
    expect(allows('read', 'write')).toBe(false)
    expect(allows('none', 'read')).toBe(false)
    expect(allows(undefined, 'read')).toBe(false)
  })
})

describe('normalizeLevels', () => {
  it('rellena todas las pantallas y descarta niveles raros', () => {
    const levels = normalizeLevels({ calendario: 'read', cursos: 'admin' })
    expect(Object.keys(levels)).toEqual(SCREENS.map((s) => s.id))
    expect(levels.calendario).toBe('read')
    expect(levels.cursos).toBe('none')
    expect(normalizeLevels(null).fichajes).toBe('none')
  })
})

describe('effectivePermissions', () => {
  const areaRows = [
    { area: 'formacion', screen: 'cursos', level: 'write' },
    { area: 'formacion', screen: 'calendario', level: 'read' },
    { area: 'personas', screen: 'equipo', level: 'write' },
  ]

  it('los de su área, y los suyos encima', () => {
    const perms = effectivePermissions('formacion', areaRows, [{ screen: 'calendario', level: 'none' }])
    expect(perms.cursos).toEqual({ level: 'write', areaLevel: 'write', overridden: false })
    expect(perms.calendario).toEqual({ level: 'none', areaLevel: 'read', overridden: true })
    expect(perms.equipo.level).toBe('none')
  })

  it('sin área, solo los suyos', () => {
    const perms = effectivePermissions(null, areaRows, [{ screen: 'fichajes', level: 'write' }])
    expect(perms.fichajes.level).toBe('write')
    expect(perms.cursos.level).toBe('none')
  })
})

describe('areaName', () => {
  it('nombre del área', () => {
    expect(areaName('alianzas')).toBe('Alianzas')
    expect(areaName(null)).toBe('')
  })

  it('las 10 áreas, en orden (sin Comunicación)', () => {
    expect(AREAS.map((a) => a.name)).toEqual(['Directivo', 'Profesor', 'Alianzas', 'RRHH', 'Finanzas', 'Legal', 'Media', 'Técnico', 'Ciberseguridad', 'Moderación'])
    expect(areaName('personas')).toBe('RRHH')
    expect(areaName('comunicacion')).toBe('')
  })
})
