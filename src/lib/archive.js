import { contactMatches } from './contacts'
import { findFormerGroup, isFormerMember } from './formerMembers'

// Archivo de contactos (contacto.archived = true, con archivedAt). Un contacto archivado no sale
// en Contactos, ni en Equipo, ni al elegir participantes, responsables de tareas o grupos, ni en
// las búsquedas; solo en Contactos › Archivados. Se conserva todo: sus datos, disponibilidad,
// perfil de equipo, candidaturas, notas, grupos (al desarchivarlo vuelve a estar en ellos), y las
// reuniones, tareas e informe siguen mostrando su nombre (se buscan por id entre todos).
// Al pasar a antiguo miembro del equipo se archiva solo (ver formerMembers.js).

export function isArchived(contact) {
  return !!contact?.archived
}

// Los contactos que se ven en la app (sin los archivados).
export function unarchived(contacts) {
  return contacts.filter((c) => !isArchived(c))
}

export function archivePatch(now = new Date()) {
  return { archived: true, archivedAt: now.toISOString() }
}

export function unarchivePatch() {
  return { archived: false, archivedAt: null }
}

export const ARCHIVE_FILTERS = [
  { value: '', label: 'Todos' },
  { value: 'former', label: 'Antiguos miembros' },
  { value: 'other', label: 'Otros' },
]

// Lista de Archivados: con buscador y filtro ('' | 'former' | 'other'), por nombre.
export function archivedList(contacts, { query = '', filter = '' } = {}) {
  return contacts
    .filter(isArchived)
    .filter((c) => contactMatches(c, query))
    .filter((c) => !filter || (filter === 'former') === isFormerMember(c))
    .sort((a, b) => (a.name || '').localeCompare(b.name || '', 'es', { sensitivity: 'base' }))
}

/**
 * Migración única: los antiguos miembros pasan al archivo y desaparece el grupo «Antiguos
 * miembros» (se saca a todos de él y se borra el grupo; sus contactos no se tocan en nada más).
 * Devuelve { contactPatches: [{ id, patch }], groupId } (groupId: el grupo que hay que borrar o null).
 */
export function formerToArchivePlan(contacts, groups, now = new Date()) {
  const group = findFormerGroup(groups)
  const contactPatches = []
  for (const c of contacts) {
    const patch = {}
    if (isFormerMember(c) && !isArchived(c)) Object.assign(patch, archivePatch(now))
    if (group && (c.groupIds || []).includes(group.id)) patch.groupIds = c.groupIds.filter((id) => id !== group.id)
    if (c.teamProfile && 'formerGroupHandled' in c.teamProfile) {
      const profile = { ...c.teamProfile }
      delete profile.formerGroupHandled
      patch.teamProfile = profile
    }
    if (Object.keys(patch).length > 0) contactPatches.push({ id: c.id, patch })
  }
  return { contactPatches, groupId: group?.id || null }
}
