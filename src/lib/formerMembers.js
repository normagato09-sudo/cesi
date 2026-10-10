import { format } from 'date-fns'
import { archivePatch, unarchivePatch } from './archive'
import { isTeamMember } from './team'
import { applyLeaving, isCurrentRole, rolesOf, withRoles } from './trajectory'

// Antiguos miembros del equipo (teamProfile.status = 'former', con leftAt = fecha de salida).
// No salen en la sección Equipo y, al pasar a antiguo miembro, se archivan (ver archive.js): se
// conserva todo (trayectoria, candidaturas, notas, reuniones y tareas). Al desarchivarlos siguen
// siendo antiguos miembros; «Marcar como miembro del equipo» los devuelve a Equipo con su
// trayectoria anterior (y los desarchiva).
// teamProfile.keepActive = true: tiene todos sus roles terminados pero sigue en el equipo (se
// eligió en el aviso); el aviso no lo vuelve a proponer.
// El antiguo grupo de contactos «Antiguos miembros» ya no se usa (lo quitó la migración
// formerToArchive2026, ver dataMigrations.js).

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

// El grupo antiguo «Antiguos miembros» (solo para la migración que lo quita).
export function findFormerGroup(groups) {
  return groups.find((g) => plainKey(g.name) === plainKey(FORMER_GROUP_NAME)) || null
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

// Aviso de Equipo: activos con todos sus roles terminados (se decide uno a uno), con `leftAt`, la
// fecha de su último rol.
export function formerReview(contacts) {
  return contacts
    .filter((c) => isTeamMember(c) && !c.archived && hasAllRolesEnded(c.teamProfile) && !c.teamProfile.keepActive)
    .map((contact) => ({ contact, leftAt: lastRoleEnd(contact.teamProfile) }))
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
 * Cambios del contacto por pasar de activo a antiguo miembro (se archiva) o al revés (vuelve a
 * Equipo y se desarchiva), para guardarlos junto con el perfil nuevo. {} si no cambia el estado.
 */
export function statusChangePatch({ before, after, now = new Date() }) {
  const wasFormer = before?.status === 'former'
  const isFormer = after?.status === 'former'
  if (!after || wasFormer === isFormer) return {}
  if (isFormer) return { teamProfile: { ...after, keepActive: false }, ...archivePatch(now) }
  const rest = { ...after }
  delete rest.formerGroupHandled
  return { teamProfile: rest, ...unarchivePatch() }
}

// Perfil de un antiguo miembro que vuelve al equipo: activo, sin fecha de salida y con los roles
// que se cerraron ese día otra vez actuales.
export function returnToTeamProfile(profile) {
  const roles = reopenRoles(rolesOf(profile), profile.leftAt)
  return withRoles({ ...profile, status: 'active', leftAt: null }, roles)
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
