import { describe, expect, it } from 'vitest'
import { INITIAL_ROLE_ID, migrateRoles, parseTrajectoryLine, rolesFromText, tenure, tenureText } from './trajectory'

const now = new Date(2026, 8, 29, 12, 0) // 29 sept 2026

describe('trayectoria en texto → roles', () => {
  it('entiende las líneas con fecha y rol', () => {
    expect(parseTrajectoryLine('24/2/2026 — Se incorporó como Profesor.')).toEqual({ start: '2026-02-24', role: 'Profesor' })
    expect(parseTrajectoryLine('30/07/2026 – Se incorporó como moderador')).toEqual({ start: '2026-07-30', role: 'moderador' })
    expect(parseTrajectoryLine('1/3/2025 - Pasó a ser Jefa de Doblaje')).toEqual({ start: '2025-03-01', role: 'Jefa de Doblaje' })
    expect(parseTrajectoryLine('1/3/2025: Nuevo rol: Coordinadora')).toEqual({ start: '2025-03-01', role: 'Coordinadora' })
    expect(parseTrajectoryLine('5/5/2025 – Se incorporó al equipo')).toEqual({ start: '2025-05-05', role: null })
  })

  it('no se inventa nada: sin fecha, fecha imposible o frase desconocida → null', () => {
    expect(parseTrajectoryLine('Muy implicado en los talleres.')).toBeNull()
    expect(parseTrajectoryLine('31/2/2026 – Se incorporó como Profesor')).toBeNull()
    expect(parseTrajectoryLine('3/4/2026 – Dio una charla sobre redes')).toBeNull()
  })

  it('cada rol se cierra con la fecha del siguiente; el último es el actual', () => {
    const profile = {
      status: 'active',
      role: 'Jefe de Ciberseguridad',
      area: 'Ciberseguridad',
      bio: '27/9/2026 — Pasó a ser Jefe de Ciberseguridad.\n24/2/2026 — Se incorporó como Profesor.\nMuy implicado en los talleres.',
    }
    const { roles, notes, warnings } = rolesFromText(profile)
    expect(roles.map(({ role, area, start, end }) => ({ role, area, start, end }))).toEqual([
      { role: 'Profesor', area: '', start: '2026-02-24', end: '2026-09-27' },
      { role: 'Jefe de Ciberseguridad', area: 'Ciberseguridad', start: '2026-09-27', end: null },
    ])
    expect(notes).toEqual(['Muy implicado en los talleres.'])
    expect(warnings).toEqual([])
  })

  it('el tiempo total cuenta desde la primera fecha', () => {
    const migrated = migrateRoles({
      status: 'active',
      role: 'Jefe de Ciberseguridad',
      bio: '24/2/2026 — Se incorporó como Profesor.\n27/9/2026 — Pasó a ser Jefe de Ciberseguridad.',
    })
    expect(tenureText(tenure(migrated, now))).toBe('7 meses y 5 días en CESI')
    expect(migrated).toMatchObject({ role: 'Jefe de Ciberseguridad', bio: '' })
  })

  it('antiguos miembros: el último rol se cierra con la fecha de salida', () => {
    const { roles } = rolesFromText({ status: 'former', leftAt: '2026-06-30', role: 'Profesor', bio: '1/10/2025 – Se incorporó como Profesor' })
    expect(roles[0]).toMatchObject({ start: '2025-10-01', end: '2026-06-30' })
  })

  it('si el cargo de la ficha no es el de la última línea, se añade sin fecha y se avisa', () => {
    const { roles, warnings } = rolesFromText({ status: 'active', role: 'Coordinadora', bio: '1/1/2026 – Se incorporó como Profesora' })
    expect(roles).toHaveLength(2)
    expect(roles[1]).toMatchObject({ id: INITIAL_ROLE_ID, role: 'Coordinadora', start: null, end: null })
    expect(warnings).toHaveLength(1)
  })

  it('sin líneas con fecha: rol de la ficha desde la fecha de incorporación, y el texto se queda en «Sobre esta persona»', () => {
    const migrated = migrateRoles({ status: 'active', role: 'Moderadora', area: 'Moderación', joinedAt: '2025-03-01', bio: 'Le encanta el doblaje.' })
    expect(migrated.roles).toEqual([{ id: INITIAL_ROLE_ID, role: 'Moderadora', area: 'Moderación', start: '2025-03-01', end: null }])
    expect(migrated.bio).toBe('Le encanta el doblaje.')
  })

  it('las líneas que no se entienden se quedan en «Sobre esta persona»', () => {
    const migrated = migrateRoles({ status: 'active', role: 'Profesor', bio: '1/1/2026 – Se incorporó como Profesor\nMuy implicado en los talleres.' })
    expect(migrated.roles).toHaveLength(1)
    expect(migrated.bio).toBe('Muy implicado en los talleres.')
  })

  it('guarda una copia del texto, el cargo, el departamento y la fecha de antes', () => {
    const before = { status: 'active', role: 'Revidor', area: 'RRHH', joinedAt: '2026-08-12', bio: '12/08/2026 — Se incorporó como Revisor' }
    const migrated = migrateRoles(before, { role: 'Revisor' })
    expect(migrated.legacyTrajectory).toEqual({ bio: before.bio, role: 'Revidor', area: 'RRHH', joinedAt: '2026-08-12' })
  })

  it('ajuste de un miembro: cargo con errata → un solo rol, con su departamento', () => {
    const migrated = migrateRoles(
      { status: 'active', role: 'Revidor de Postulaciones', area: 'RRHH', joinedAt: '2026-08-12', bio: '12/08/2026 — Se incorporó como Revisor de Postulaciones' },
      { role: 'Revisor de Postulaciones' },
    )
    expect(migrated.roles.map(({ role, area, start, end }) => ({ role, area, start, end }))).toEqual([
      { role: 'Revisor de Postulaciones', area: 'RRHH', start: '2026-08-12', end: null },
    ])
    expect(migrated.role).toBe('Revisor de Postulaciones')
  })

  it('ajuste de un miembro: departamento del rol anterior y los dos roles a la vez', () => {
    const profile = {
      status: 'active',
      role: 'Jefe de Ciberseguridad',
      area: 'Ciberseguridad',
      bio: '24/2/2026 — Se incorporó como Profesor.\n27/9/2026 — Se incorporó como Jefe de Ciberseguridad',
    }
    const both = migrateRoles(profile, { areas: { Profesor: 'Profesores' }, current: ['Profesor'] })
    expect(both.roles.map(({ role, area, start, end }) => ({ role, area, start, end }))).toEqual([
      { role: 'Jefe de Ciberseguridad', area: 'Ciberseguridad', start: '2026-09-27', end: null },
      { role: 'Profesor', area: 'Profesores', start: '2026-02-24', end: null },
    ])
    expect(both).toMatchObject({ role: 'Jefe de Ciberseguridad', area: 'Ciberseguridad' })
    // Lo que se solapa cuenta una sola vez.
    expect(tenureText(tenure(both, now))).toBe('7 meses y 5 días en CESI')

    const replaced = migrateRoles(profile, { areas: { Profesor: 'Profesores' } })
    expect(replaced.roles[1]).toMatchObject({ role: 'Profesor', area: 'Profesores', end: '2026-09-27' })
  })

  it('no toca a quien ya tiene la trayectoria nueva', () => {
    const profile = { roles: [], bio: '24/2/2026 — Se incorporó como Profesor.' }
    expect(migrateRoles(profile)).toBe(profile)
  })
})
