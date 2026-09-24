// Departamentos del equipo (en la interfaz "Departamento"; por dentro se siguen llamando
// áreas: el campo `area` de teamProfile y de las vacantes, y la clave cesi_team_areas_v1, así
// no hay que migrar datos ni cambiar la sincronización).
//
// La lista es ordenada: el orden es el de los desplegables y filtros.

// Lista de ejemplo de versiones anteriores: si la guardada es exactamente esta, se sustituye.
export const LEGACY_DEFAULT_DEPARTMENTS = ['Dirección', 'Profesorado', 'Doblaje', 'Radio', 'Redes', 'Coordinación']

export const DEFAULT_DEPARTMENTS = [
  'Directivo',
  'Alianzas',
  'Moderación',
  'Eventos',
  'Media',
  'Técnico',
  'Verificación',
  'Reclutamiento',
  'Finanzas',
  'Radio',
  'Marketing',
  'Legal',
  'Tienda',
  'Socios',
  'Profesores',
]

export const NO_DEPARTMENT_LABEL = 'Sin departamento'

const MAX_NAME_LENGTH = 50

// Clave para comparar nombres sin distinguir mayúsculas ni acentos.
export function departmentKey(name) {
  return (name || '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLocaleLowerCase('es')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
}

export function normalizeDepartmentName(name) {
  return (name || '').replace(/\s+/g, ' ').trim().slice(0, MAX_NAME_LENGTH)
}

// Mensaje de error del nombre o null si es válido. `except`: el departamento que se renombra.
export function validateDepartmentName(name, list, except = null) {
  const clean = normalizeDepartmentName(name)
  if (!clean) return 'Escribe el nombre del departamento.'
  const taken = list.find((d) => d !== except && departmentKey(d) === departmentKey(clean))
  if (taken) return `Ya existe el departamento «${taken}».`
  return null
}

// Añade un departamento al final (sin duplicados). Devuelve la misma lista si ya existía o está vacío.
export function addDepartment(list, name) {
  const clean = normalizeDepartmentName(name)
  if (validateDepartmentName(clean, list)) return list
  return [...list, clean]
}

export function moveDepartment(list, index, delta) {
  const to = index + delta
  if (index < 0 || index >= list.length || to < 0 || to >= list.length) return list
  const next = [...list]
  const [item] = next.splice(index, 1)
  next.splice(to, 0, item)
  return next
}

function membersIn(name, contacts) {
  return contacts.filter((c) => c.teamProfile && c.teamProfile.area === name)
}

function vacanciesIn(name, vacancies) {
  return vacancies.filter((v) => v.area === name)
}

// Cuántos miembros del equipo y vacantes usan el departamento.
export function departmentUsage(name, contacts, vacancies) {
  return { members: membersIn(name, contacts).length, vacancies: vacanciesIn(name, vacancies).length }
}

// Cambios en miembros y vacantes para pasar de `from` a `to` ('' = sin departamento).
function reassign(from, to, contacts, vacancies) {
  return {
    contactPatches: membersIn(from, contacts).map((c) => ({ id: c.id, patch: { teamProfile: { ...c.teamProfile, area: to } } })),
    vacancyPatches: vacanciesIn(from, vacancies).map((v) => ({ id: v.id, patch: { area: to } })),
  }
}

/**
 * Renombrar: la lista cambia en su sitio y el nombre nuevo pasa a todos los miembros y vacantes
 * que tenían el anterior. Devuelve { error } si el nombre no es válido.
 */
export function renameDepartment(list, oldName, newName, contacts, vacancies) {
  const clean = normalizeDepartmentName(newName)
  const error = validateDepartmentName(clean, list, oldName)
  if (error) return { error }
  return {
    list: list.map((d) => (d === oldName ? clean : d)),
    ...reassign(oldName, clean, contacts, vacancies),
  }
}

/**
 * Borrar: sus miembros y vacantes pasan a `target` (otro departamento de la lista, o '' para
 * dejarlos sin departamento).
 */
export function removeDepartment(list, name, target, contacts, vacancies) {
  if (target && (target === name || !list.includes(target))) return { error: 'Elige otro departamento.' }
  return {
    list: list.filter((d) => d !== name),
    ...reassign(name, target || '', contacts, vacancies),
  }
}

/**
 * Lista que hay que usar a partir de la guardada:
 * - sin lista guardada, o si es exactamente la de ejemplo antigua, la nueva lista;
 * - se añaden al final los departamentos que usan miembros o vacantes y no están en la lista,
 *   para no perderlos.
 * Devuelve { list, changed } (changed: hay que guardarla).
 */
export function resolveDepartments(stored, contacts = [], vacancies = []) {
  const valid = Array.isArray(stored) && stored.length > 0
  const isLegacy =
    valid && stored.length === LEGACY_DEFAULT_DEPARTMENTS.length && stored.every((d, i) => d === LEGACY_DEFAULT_DEPARTMENTS[i])
  let list = valid && !isLegacy ? [...stored] : [...DEFAULT_DEPARTMENTS]
  const used = [...contacts.map((c) => c.teamProfile?.area), ...vacancies.map((v) => v.area)]
  for (const name of used) {
    if (name && !list.some((d) => departmentKey(d) === departmentKey(name)) && !list.includes(name)) list = [...list, name]
  }
  const changed = !valid || list.length !== stored.length || list.some((d, i) => d !== stored[i])
  return { list, changed }
}

// Departamentos antiguos que pasan a uno de la lista nueva (sin distinguir mayúsculas ni acentos).
export const DEPARTMENT_RENAMES = {
  Dirección: 'Directivo',
  Profesorado: 'Profesores',
  Redes: 'Marketing',
  Coordinación: 'Directivo',
}

/**
 * Migración única: la lista queda exactamente DEFAULT_DEPARTMENTS, en su orden. Los miembros y
 * vacantes con un departamento antiguo se reasignan según DEPARTMENT_RENAMES; los que usan otro
 * departamento que no está en la lista (p. ej. Doblaje) lo conservan y se añade al final.
 * Devuelve { list, contactPatches, vacancyPatches }.
 */
export function resetDepartments(contacts = [], vacancies = []) {
  const renames = new Map(Object.entries(DEPARTMENT_RENAMES).map(([from, to]) => [departmentKey(from), to]))
  const inList = (name) => DEFAULT_DEPARTMENTS.find((d) => departmentKey(d) === departmentKey(name))
  // Nombre final de un departamento usado: el de la lista (con su escritura), el reasignado o el mismo.
  const target = (name) => (name ? inList(name) || renames.get(departmentKey(name)) || name : name)

  const contactPatches = contacts
    .filter((c) => c.teamProfile && c.teamProfile.area && target(c.teamProfile.area) !== c.teamProfile.area)
    .map((c) => ({ id: c.id, patch: { teamProfile: { ...c.teamProfile, area: target(c.teamProfile.area) } } }))
  const vacancyPatches = vacancies
    .filter((v) => v.area && target(v.area) !== v.area)
    .map((v) => ({ id: v.id, patch: { area: target(v.area) } }))

  const list = [...DEFAULT_DEPARTMENTS]
  const used = [...contacts.map((c) => c.teamProfile?.area), ...vacancies.map((v) => v.area)].map(target)
  for (const name of used) {
    if (name && !list.some((d) => departmentKey(d) === departmentKey(name))) list.push(name)
  }
  return { list, contactPatches, vacancyPatches }
}
