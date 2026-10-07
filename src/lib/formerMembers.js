import { format } from 'date-fns'
import { nextGroupColor } from './groups'
import { isTeamMember } from './team'
import { applyLeaving, isCurrentRole, rolesOf, withRoles } from './trajectory'

// Antiguos miembros del equipo (teamProfile.status = 'former', con leftAt = fecha de salida).
// No salen en la sección Equipo, pero siguen en Contactos con toda su información, y van al grupo
// de contactos "Antiguos miembros":
// - al pasar a antiguo miembro se añaden al grupo (se crea si no existe);
// - al volver al equipo salen del grupo;
// - si se les quita del grupo a mano, no se les vuelve a meter.
// teamProfile.formerGroupHandled = true: ya se le metió en el grupo (o se decidió no hacerlo), así
// que el aviso de Equipo no lo vuelve a proponer. Se quita al volver al equipo.
// teamProfile.keepActive = true: tiene todos sus roles terminados pero sigue en el equipo (se
// eligió en el aviso); el aviso no lo vuelve a proponer.

export const FORMER_GROUP_NAME = 'Antiguos miembros'

const plainKey = (text) =>
  String(text || '')
    .trim()
    .toLocaleLowerCase('es')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')

export function isFormerMember(contact) {
  return isTeamMember(contact) && contact.teamProfile.status === 'former'
}

export function findFormerGroup(groups) {
  return groups.find((g) => plainKey(g.name) === plainKey(FORMER_GROUP_NAME)) || null
}

// Datos del grupo "Antiguos miembros" para crearlo.
export function newFormerGroup(groups) {
  return { name: FORMER_GROUP_NAME, color: nextGroupColor(groups) }
}

// Fecha de fin más reciente de sus roles ('AAAA-MM-DD') o null.
export function lastRoleEnd(profile) {
  const ends = rolesOf(profile)
    .map((r) => r.end)
    .filter(Boolean)
    .sort()
  return ends.length > 0 ? ends[ends.length - 1] : null
}

// ¿Sigue activo pero con todos sus roles terminados?
export function hasAllRolesEnded(profile) {
  const roles = rolesOf(profile)
  return !!profile && profile.status !== 'former' && roles.length > 0 && !roles.some(isCurrentRole)
}

/**
 * Lo que propone el aviso de Equipo:
 * - outsideGroup: antiguos miembros que no están en el grupo y por los que aún no se ha decidido;
 * - allRolesEnded: activos con todos sus roles terminados (se decide uno a uno), con `leftAt`, la
 *   fecha de su último rol.
 */
export function formerReview(contacts, groups) {
  const group = findFormerGroup(groups)
  const outsideGroup = contacts.filter(
    (c) => isFormerMember(c) && !c.teamProfile.formerGroupHandled && !(group && (c.groupIds || []).includes(group.id)),
  )
  const allRolesEnded = contacts
    .filter((c) => isTeamMember(c) && hasAllRolesEnded(c.teamProfile) && !c.teamProfile.keepActive)
    .map((contact) => ({ contact, leftAt: lastRoleEnd(contact.teamProfile) }))
  return { outsideGroup, allRolesEnded }
}

// Al volver al equipo, los roles que se cerraron con la fecha de salida vuelven a ser actuales.
export function reopenRoles(roles, leftAt) {
  if (!leftAt) return roles
  return roles.map((r) => (r.end === leftAt ? { ...r, end: null } : r))
}

// Perfil de alguien que pasa a antiguo miembro con la fecha de salida `leftAt` (sus roles ya
// terminados no cambian; los actuales, si los hay, se cierran ese día).
export function markFormerProfile(profile, leftAt) {
  return withRoles({ ...profile, status: 'former', leftAt }, applyLeaving(rolesOf(profile), 'former', leftAt))
}

/**
 * Cambios del contacto por pasar de activo a antiguo miembro o al revés, para guardarlos junto con
 * el perfil nuevo. `groupIds`: los grupos que se van a guardar (los del formulario, si se han
 * editado). `formerGroup`: el grupo (o null si no existe; al salir del equipo hay que crearlo antes).
 * Devuelve { groupIds, teamProfile } con lo que cambia, o {} si no cambia el estado.
 */
export function statusChangePatch({ before, after, groupIds = [], formerGroup }) {
  const wasFormer = before?.status === 'former'
  const isFormer = after?.status === 'former'
  if (!after || wasFormer === isFormer) return {}
  if (isFormer) {
    const ids = formerGroup && !groupIds.includes(formerGroup.id) ? [...groupIds, formerGroup.id] : groupIds
    return { groupIds: ids, teamProfile: { ...after, formerGroupHandled: true, keepActive: false } }
  }
  const rest = { ...after }
  delete rest.formerGroupHandled
  return {
    groupIds: formerGroup ? groupIds.filter((id) => id !== formerGroup.id) : groupIds,
    teamProfile: rest,
  }
}

// ¿Pasa a antiguo miembro? (para crear el grupo antes de guardar).
export function becomesFormer(before, after) {
  return before?.status !== 'former' && after?.status === 'former'
}

// Departamentos en los que estaba el día `day` (Date o 'AAAA-MM-DD'), según su trayectoria:
// los de sus roles de ese día o, si ninguno lo cubre (roles sin fechas), su departamento actual.
// null si ese día ya no estaba en el equipo (después de su fecha de salida).
export function areasOn(profile, day) {
  if (!profile) return null
  const key = typeof day === 'string' ? day : format(day, 'yyyy-MM-dd')
  if (profile.status === 'former') {
    const leftAt = profile.leftAt || lastRoleEnd(profile)
    if (leftAt && key > leftAt) return null
  }
  const covering = rolesOf(profile).filter((r) => (!r.start || r.start <= key) && (!r.end || r.end >= key))
  const areas = covering.length > 0 ? covering.map((r) => (r.area || '').trim()) : [(profile.area || '').trim()]
  return [...new Set(areas)]
}
