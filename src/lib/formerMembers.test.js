import { describe, expect, it } from 'vitest'
import {
  areasOn,
  findFormerGroup,
  formerReview,
  hasAllRolesEnded,
  lastRoleEnd,
  markFormerProfile,
  reopenRoles,
  returnToTeamProfile,
  statusChangePatch,
} from './formerMembers'

const role = (id, area, start, end = null) => ({ id, role: `Rol ${id}`, area, start, end })
const member = (id, profile, extra = {}) => ({ id, name: id, teamProfile: { status: 'active', leftAt: null, ...profile }, ...extra })

const NOW = new Date('2026-10-10T10:00:00Z')

describe('antiguos miembros y archivo', () => {
  it('el grupo antiguo se encuentra sin distinguir mayúsculas ni acentos (para quitarlo)', () => {
    expect(findFormerGroup([{ id: 'x', name: 'Profesores' }, { id: 'g', name: ' antiguos MIEMBROS ' }]).id).toBe('g')
    expect(findFormerGroup([{ id: 'x', name: 'Profesores' }])).toBeNull()
  })

  it('al pasar a antiguo miembro se archiva', () => {
    const patch = statusChangePatch({
      before: { status: 'active' },
      after: { status: 'former', leftAt: '2026-09-30', keepActive: true },
      now: NOW,
    })
    expect(patch).toEqual({
      teamProfile: { status: 'former', leftAt: '2026-09-30', keepActive: false },
      archived: true,
      archivedAt: NOW.toISOString(),
    })
  })

  it('al volver al equipo se desarchiva', () => {
    const patch = statusChangePatch({
      before: { status: 'former', leftAt: '2026-09-30' },
      after: { status: 'active', leftAt: null, formerGroupHandled: true },
    })
    expect(patch).toEqual({ teamProfile: { status: 'active', leftAt: null }, archived: false, archivedAt: null })
  })

  it('si el estado no cambia, no se toca el archivo', () => {
    expect(statusChangePatch({ before: { status: 'former' }, after: { status: 'former' } })).toEqual({})
    expect(statusChangePatch({ before: { status: 'active' }, after: { status: 'active' } })).toEqual({})
  })

  it('«Marcar como miembro del equipo» recupera su trayectoria', () => {
    const p = returnToTeamProfile({ status: 'former', leftAt: '2025-06-30', roles: [role('a', 'Radio', '2024-01-01', '2025-06-30')] })
    expect(p).toMatchObject({ status: 'active', leftAt: null })
    expect(p.roles[0].end).toBeNull()
  })
})

describe('aviso de Equipo', () => {
  it('activos con todos sus roles terminados', () => {
    const contacts = [
      member('antiguo', { status: 'former', leftAt: '2026-01-31' }, { archived: true }),
      member('terminados', { roles: [role('a', 'Radio', '2024-01-01', '2025-06-30'), role('b', 'Media', '2025-01-01', '2025-12-31')] }),
      member('sigue', { roles: [role('c', 'Radio', '2024-01-01', '2025-06-30')], keepActive: true }),
      member('activo', { roles: [role('d', 'Radio', '2024-01-01')] }),
      member('sin roles', {}),
      { id: 'contacto', name: 'contacto' },
    ]
    expect(formerReview(contacts).map((e) => [e.contact.id, e.leftAt])).toEqual([['terminados', '2025-12-31']])
  })

  it('roles terminados y fecha del último', () => {
    expect(hasAllRolesEnded({ roles: [role('a', 'R', '2024-01-01', '2024-02-01')] })).toBe(true)
    expect(hasAllRolesEnded({ roles: [role('a', 'R', '2024-01-01', '2024-02-01'), role('b', 'R', '2024-03-01')] })).toBe(false)
    expect(hasAllRolesEnded({ status: 'former', roles: [role('a', 'R', '2024-01-01', '2024-02-01')] })).toBe(false)
    expect(hasAllRolesEnded({ roles: [] })).toBe(false)
    expect(lastRoleEnd({ roles: [role('a', 'R', null, '2025-03-01'), role('b', 'R', null, '2024-12-01')] })).toBe('2025-03-01')
  })

  it('marcar como antiguo con la fecha de su último rol', () => {
    const p = markFormerProfile({ status: 'active', roles: [role('a', 'Radio', '2024-01-01', '2025-06-30')] }, '2025-06-30')
    expect(p).toMatchObject({ status: 'former', leftAt: '2025-06-30', role: 'Rol a', area: 'Radio' })
    expect(p.roles[0].end).toBe('2025-06-30')
  })
})

describe('volver al equipo', () => {
  it('reabre los roles que se cerraron con la fecha de salida', () => {
    const roles = [role('a', 'Radio', '2024-01-01', '2025-06-30'), role('b', 'Media', '2023-01-01', '2023-12-31')]
    expect(reopenRoles(roles, '2025-06-30').map((r) => r.end)).toEqual([null, '2023-12-31'])
    expect(reopenRoles(roles, null)).toBe(roles)
  })
})

describe('departamento en una fecha', () => {
  const profile = {
    status: 'former',
    leftAt: '2026-03-31',
    area: 'Media',
    roles: [role('a', 'Radio', '2024-01-01', '2025-06-30'), role('b', 'Media', '2025-07-01', '2026-03-31')],
  }

  it('según su trayectoria, y nada después de la salida', () => {
    expect(areasOn(profile, '2025-01-15')).toEqual(['Radio'])
    expect(areasOn(profile, new Date(2025, 8, 1, 10))).toEqual(['Media'])
    expect(areasOn(profile, '2026-03-31')).toEqual(['Media'])
    expect(areasOn(profile, '2026-04-01')).toBeNull()
  })

  it('roles a la vez en dos departamentos; sin roles que lo cubran, el actual', () => {
    const p = { status: 'active', area: 'Radio', roles: [role('a', 'Radio', '2024-01-01'), role('b', 'Media', '2025-01-01')] }
    expect(areasOn(p, '2025-02-01')).toEqual(['Radio', 'Media'])
    expect(areasOn({ status: 'active', area: 'Radio', roles: [] }, '2025-02-01')).toEqual(['Radio'])
    expect(areasOn({ status: 'active', area: '', roles: [role('a', '', null)] }, '2025-02-01')).toEqual([''])
  })
})
