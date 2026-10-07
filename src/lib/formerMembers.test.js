import { describe, expect, it } from 'vitest'
import {
  FORMER_GROUP_NAME,
  areasOn,
  becomesFormer,
  findFormerGroup,
  formerReview,
  hasAllRolesEnded,
  lastRoleEnd,
  markFormerProfile,
  newFormerGroup,
  reopenRoles,
  statusChangePatch,
} from './formerMembers'

const role = (id, area, start, end = null) => ({ id, role: `Rol ${id}`, area, start, end })
const member = (id, profile, extra = {}) => ({ id, name: id, teamProfile: { status: 'active', leftAt: null, ...profile }, ...extra })
const group = { id: 'g1', name: 'Antiguos miembros', color: '#2563eb' }

describe('grupo "Antiguos miembros"', () => {
  it('se encuentra sin distinguir mayúsculas ni acentos y se crea con un color libre', () => {
    expect(findFormerGroup([{ id: 'x', name: 'Profesores' }, { id: 'g', name: ' antiguos MIEMBROS ' }]).id).toBe('g')
    expect(findFormerGroup([{ id: 'x', name: 'Profesores' }])).toBeNull()
    expect(newFormerGroup([{ color: '#2563eb' }])).toEqual({ name: FORMER_GROUP_NAME, color: '#16a34a' })
  })

  it('al pasar a antiguo miembro se añade al grupo y queda como ya revisado', () => {
    const patch = statusChangePatch({
      before: { status: 'active' },
      after: { status: 'former', leftAt: '2026-09-30', keepActive: true },
      groupIds: ['prof'],
      formerGroup: group,
    })
    expect(patch.groupIds).toEqual(['prof', 'g1'])
    expect(patch.teamProfile).toMatchObject({ status: 'former', formerGroupHandled: true, keepActive: false })
    expect(becomesFormer({ status: 'active' }, { status: 'former' })).toBe(true)
    expect(becomesFormer({ status: 'former' }, { status: 'former' })).toBe(false)
  })

  it('al volver al equipo sale del grupo', () => {
    const patch = statusChangePatch({
      before: { status: 'former', leftAt: '2026-09-30', formerGroupHandled: true },
      after: { status: 'active', leftAt: null, formerGroupHandled: true },
      groupIds: ['g1', 'prof'],
      formerGroup: group,
    })
    expect(patch.groupIds).toEqual(['prof'])
    expect(patch.teamProfile).toEqual({ status: 'active', leftAt: null })
  })

  it('si el estado no cambia, no toca los grupos (se respeta haberlo quitado a mano)', () => {
    expect(statusChangePatch({ before: { status: 'former' }, after: { status: 'former' }, groupIds: [], formerGroup: group })).toEqual({})
    expect(statusChangePatch({ before: { status: 'active' }, after: { status: 'active' }, groupIds: ['g1'], formerGroup: group })).toEqual({})
  })
})

describe('aviso de Equipo', () => {
  it('antiguos miembros fuera del grupo y activos con todos sus roles terminados', () => {
    const contacts = [
      member('fuera', { status: 'former', leftAt: '2026-01-31' }),
      member('dentro', { status: 'former', leftAt: '2026-01-31' }, { groupIds: ['g1'] }),
      member('quitado a mano', { status: 'former', leftAt: '2026-01-31', formerGroupHandled: true }),
      member('terminados', { roles: [role('a', 'Radio', '2024-01-01', '2025-06-30'), role('b', 'Media', '2025-01-01', '2025-12-31')] }),
      member('sigue', { roles: [role('c', 'Radio', '2024-01-01', '2025-06-30')], keepActive: true }),
      member('activo', { roles: [role('d', 'Radio', '2024-01-01')] }),
      member('sin roles', {}),
      { id: 'contacto', name: 'contacto' },
    ]
    const review = formerReview(contacts, [group])
    expect(review.outsideGroup.map((c) => c.id)).toEqual(['fuera'])
    expect(review.allRolesEnded.map((e) => [e.contact.id, e.leftAt])).toEqual([['terminados', '2025-12-31']])
    // Sin el grupo, todos los antiguos por los que no se ha decidido están fuera.
    expect(formerReview(contacts, []).outsideGroup.map((c) => c.id)).toEqual(['fuera', 'dentro'])
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
