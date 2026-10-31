// Áreas del equipo (antes "departamentos"): el campo `area` de teamProfile, de sus roles y de las
// vacantes guarda el nombre del área, y la lista va en la clave cesi_team_areas_v1 (sincronizada).
// Desde 2026 la lista es fija: las 10 áreas de las cuentas (ver permissions.js), en su orden.

import { rolesOf } from './trajectory'
import { AREAS } from './permissions'

// Lista de ejemplo de versiones anteriores: si la guardada es exactamente esta, se sustituye.
export const LEGACY_DEFAULT_DEPARTMENTS = ['Dirección', 'Profesorado', 'Doblaje', 'Radio', 'Redes', 'Coordinación']

// Lista de departamentos de la migración de 2026 (departments-2026), antes de pasar a las áreas.
export const DEPARTMENTS_2026 = [
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

// Las áreas, en su orden: la lista de Equipo, de las vacantes y de la trayectoria.
export const DEFAULT_DEPARTMENTS = AREAS.map((a) => a.name)

export const NO_DEPARTMENT_LABEL = 'Sin área'

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

// Miembros con ese departamento en su perfil o en algún rol de su trayectoria.
function membersIn(name, contacts) {
  return contacts.filter((c) => c.teamProfile && (c.teamProfile.area === name || rolesOf(c.teamProfile).some((r) => r.area === name)))
}

function vacanciesIn(name, vacancies) {
  return vacancies.filter((v) => v.area === name)
}

// Cuántos miembros del equipo y vacantes usan el departamento.
export function departmentUsage(name, contacts, vacancies) {
  return { members: membersIn(name, contacts).length, vacancies: vacanciesIn(name, vacancies).length }
}

// Posición en el orden del departamento (teamProfile.order, ver teamOrder.js) al pasar de `from`
// a `to`: al renombrar (`keep`) se conserva; al pasar a otro departamento, que ya tiene su orden,
// se quita y la persona va al final.
function movedOrder(order, from, to, keep) {
  if (!order || !(from in order)) return order
  const next = { ...order }
  const value = next[from]
  delete next[from]
  if (keep && !(to in next)) next[to] = value
  return next
}

// Cambios en miembros y vacantes para pasar de `from` a `to` ('' = sin departamento).
function reassign(from, to, contacts, vacancies, keepOrder = false) {
  return {
    contactPatches: membersIn(from, contacts).map((c) => {
      const p = c.teamProfile
      const next = { ...p, area: p.area === from ? to : p.area }
      if (Array.isArray(p.roles)) next.roles = p.roles.map((r) => (r.area === from ? { ...r, area: to } : r))
      if (p.order) next.order = movedOrder(p.order, from, to, keepOrder)
      return { id: c.id, patch: { teamProfile: next } }
    }),
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
    ...reassign(oldName, clean, contacts, vacancies, true),
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
 * Lista que hay que usar: siempre las áreas (DEFAULT_DEPARTMENTS). Los nombres antiguos que aún
 * usen miembros o vacantes los pasa a áreas la migración areas-2026 (areasPlan).
 * Devuelve { list, changed } (changed: hay que guardarla).
 */
export function resolveDepartments(stored) {
  const valid = Array.isArray(stored) && stored.length > 0
  const list = [...DEFAULT_DEPARTMENTS]
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
 * Migración única: la lista queda exactamente DEPARTMENTS_2026, en su orden. Los miembros y
 * vacantes con un departamento antiguo se reasignan según DEPARTMENT_RENAMES; los que usan otro
 * departamento que no está en la lista (p. ej. Doblaje) lo conservan y se añade al final.
 * Devuelve { list, contactPatches, vacancyPatches }.
 */
export function resetDepartments(contacts = [], vacancies = []) {
  const renames = new Map(Object.entries(DEPARTMENT_RENAMES).map(([from, to]) => [departmentKey(from), to]))
  const inList = (name) => DEPARTMENTS_2026.find((d) => departmentKey(d) === departmentKey(name))
  // Nombre final de un departamento usado: el de la lista (con su escritura), el reasignado o el mismo.
  const target = (name) => (name ? inList(name) || renames.get(departmentKey(name)) || name : name)

  const contactPatches = contacts
    .filter((c) => c.teamProfile && c.teamProfile.area && target(c.teamProfile.area) !== c.teamProfile.area)
    .map((c) => ({ id: c.id, patch: { teamProfile: { ...c.teamProfile, area: target(c.teamProfile.area) } } }))
  const vacancyPatches = vacancies
    .filter((v) => v.area && target(v.area) !== v.area)
    .map((v) => ({ id: v.id, patch: { area: target(v.area) } }))

  const list = [...DEPARTMENTS_2026]
  const used = [...contacts.map((c) => c.teamProfile?.area), ...vacancies.map((v) => v.area)].map(target)
  for (const name of used) {
    if (name && !list.some((d) => departmentKey(d) === departmentKey(name))) list.push(name)
  }
  return { list, contactPatches, vacancyPatches }
}

// Qué incluye cada área: los departamentos antiguos con uno de estos nombres (sin distinguir
// mayúsculas ni acentos) pasan a esa área. Los que no encajan claramente (p. ej. Tienda), a «Sin área».
export const AREA_EQUIVALENTS = {
  Directivo: ['Directivo', 'Directiva', 'Dirección', 'Subdirección', 'Coordinación', 'Coordinación general'],
  Profesor: ['Profesor', 'Profesora', 'Profesores', 'Profesorado', 'Formación', 'Clases', 'Cursos'],
  Alianzas: ['Alianzas', 'Patrocinadores', 'Patrocinio', 'Colaboraciones', 'Socios', 'Partners'],
  RRHH: ['RRHH', 'Recursos humanos', 'Personas', 'Reclutamiento', 'Selección', 'Vacantes'],
  Finanzas: ['Finanzas', 'Dinero', 'Presupuesto', 'Contabilidad', 'Donaciones'],
  Legal: ['Legal', 'Normas', 'Contratos', 'Privacidad'],
  Media: ['Media', 'Publicidad', 'Marketing', 'Redes', 'Redes sociales', 'Diseño', 'Contenido', 'Vídeo', 'Radio', 'Doblaje', 'Eventos'],
  Técnico: ['Técnico', 'Desarrollo', 'Web', 'App', 'Programación', 'Soporte técnico'],
  Ciberseguridad: ['Ciberseguridad', 'Seguridad', 'Cuentas', 'Protección de datos'],
  Moderación: ['Moderación', 'Moderación del Discord', 'Verificación', 'Soporte a la comunidad', 'Comunidad'],
}

const AREA_BY_KEY = new Map(Object.entries(AREA_EQUIVALENTS).flatMap(([area, names]) => names.map((n) => [departmentKey(n), area])))

// Área de un departamento antiguo ('' si no encaja en ninguna).
export function areaForDepartment(name) {
  return AREA_BY_KEY.get(departmentKey(name)) || ''
}

/**
 * Migración única areas-2026: cada miembro (área, y área de cada rol de su trayectoria) y cada
 * vacante pasa del departamento antiguo a su área (areaForDepartment). El nombre antiguo se
 * guarda en `legacyArea` (en el perfil, en el rol y en la vacante) para no perderlo; los que no
 * encajan quedan en «Sin área» (area ''). Devuelve { list, contactPatches, vacancyPatches }.
 */
export function areasPlan(contacts = [], vacancies = []) {
  const moved = (area) => !!area && areaForDepartment(area) !== area
  const contactPatches = contacts
    .filter((c) => c.teamProfile && (moved(c.teamProfile.area) || rolesOf(c.teamProfile).some((r) => moved(r.area))))
    .map((c) => {
      const p = c.teamProfile
      const next = { ...p }
      if (moved(p.area)) Object.assign(next, { area: areaForDepartment(p.area), legacyArea: p.area })
      if (Array.isArray(p.roles)) {
        next.roles = p.roles.map((r) => (moved(r.area) ? { ...r, area: areaForDepartment(r.area), legacyArea: r.area } : r))
      }
      // Su posición en cada departamento pasa a la del área (si no tenía ya una en esa área).
      if (p.order) {
        next.order = {}
        const entries = Object.entries(p.order).sort(([a], [b]) => Number(moved(a)) - Number(moved(b)))
        for (const [k, v] of entries) {
          const to = moved(k) ? areaForDepartment(k) : k
          if (to && !(to in next.order)) next.order[to] = v
        }
      }
      return { id: c.id, patch: { teamProfile: next } }
    })
  const vacancyPatches = vacancies
    .filter((v) => moved(v.area))
    .map((v) => ({ id: v.id, patch: { area: areaForDepartment(v.area), legacyArea: v.area } }))
  return { list: [...DEFAULT_DEPARTMENTS], contactPatches, vacancyPatches }
}

// Los que la migración dejó en «Sin área» y aún no se han colocado: [{ id, name, legacyArea }].
export function unplacedMembers(contacts = []) {
  return contacts
    .filter((c) => c.teamProfile && c.teamProfile.status !== 'former' && !c.archived && !c.teamProfile.area && c.teamProfile.legacyArea)
    .map((c) => ({ id: c.id, name: c.name, legacyArea: c.teamProfile.legacyArea }))
}

export function unplacedVacancies(vacancies = []) {
  return vacancies.filter((v) => !v.area && v.legacyArea).map((v) => ({ id: v.id, title: v.title, legacyArea: v.legacyArea }))
}
