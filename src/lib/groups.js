import { createCollection } from './store'

// Grupos de contactos ("Profesores", "Equipo"...). Grupo: { id, name, color, createdAt, updatedAt }.
// Cada contacto guarda los grupos a los que pertenece en `groupIds` (puede estar en varios).

export const STORAGE_KEY = 'cesi_groups_v1'

export const groupsStore = createCollection(STORAGE_KEY, { prefix: 'grp' })

export const GROUP_COLORS = ['#2563eb', '#16a34a', '#db2777', '#f59e0b', '#7c3aed', '#0891b2', '#dc2626', '#6b7280']

const MAX_NAME_LENGTH = 40

function nameKey(name) {
  return (name || '')
    .trim()
    .toLocaleLowerCase('es')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
}

export function getAllGroups() {
  return groupsStore.getAll().sort((a, b) => a.name.localeCompare(b.name, 'es', { sensitivity: 'base' }))
}

export function normalizeGroupName(name) {
  return (name || '').replace(/\s+/g, ' ').trim().slice(0, MAX_NAME_LENGTH)
}

// Mensaje de error del nombre o null si es válido. `exceptId`: el grupo que se está renombrando.
export function validateGroupName(name, groups, exceptId = null) {
  const clean = normalizeGroupName(name)
  if (!clean) return 'Escribe el nombre del grupo.'
  if (groups.some((g) => g.id !== exceptId && nameKey(g.name) === nameKey(clean))) return `Ya tienes un grupo «${clean}».`
  return null
}

// Primer color de la paleta que aún no usa ningún grupo.
export function nextGroupColor(groups) {
  return GROUP_COLORS.find((c) => !groups.some((g) => g.color === c)) || GROUP_COLORS[groups.length % GROUP_COLORS.length]
}

// Grupos (existentes) de un contacto, en el orden de la lista de grupos.
export function groupsOfContact(contact, groups) {
  const ids = contact?.groupIds || []
  return groups.filter((g) => ids.includes(g.id))
}

export function contactsInGroup(groupId, contacts) {
  return contacts.filter((c) => (c.groupIds || []).includes(groupId))
}

// Añade todos los contactos del grupo a los participantes, sin duplicar los que ya estén.
export function addGroupToParticipants(participantIds, groupId, contacts) {
  const next = [...participantIds]
  for (const c of contactsInGroup(groupId, contacts)) {
    if (!next.includes(c.id)) next.push(c.id)
  }
  return next
}

// Grupos que se ofrecen en el desplegable de participantes: los que tienen contactos y
// coinciden con lo escrito.
export function groupOptions(groups, contacts, query = '') {
  const q = nameKey(query)
  return groups
    .map((group) => ({ group, members: contactsInGroup(group.id, contacts) }))
    .filter(({ group, members }) => members.length > 0 && (!q || nameKey(group.name).includes(q)))
}

// Cambios para quitar el grupo borrado de sus contactos: [{ id, groupIds }].
export function contactsWithoutGroup(groupId, contacts) {
  return contactsInGroup(groupId, contacts).map((c) => ({ id: c.id, groupIds: c.groupIds.filter((id) => id !== groupId) }))
}
