import { NO_DEPARTMENT_LABEL } from './departments'
import { isActiveMember, memberMatches } from './team'
import { currentRoles } from './trajectory'

// Orden de las personas dentro de cada departamento (sección Equipo). No hay niveles fijos: lo
// decido yo moviéndolas, y la primera es quien dirige el departamento («Jefe/a de departamento»).
// Se guarda en el perfil de cada persona, teamProfile.order = { [departamento]: posición }, así se
// sincroniza con los contactos. Quien no tiene posición en un departamento (p. ej. quien entra
// nuevo) va al final, por nombre. Quien tiene roles en varios departamentos sale en cada uno con
// su propia posición. '' es «Sin departamento».

const byName = (a, b) => (a.name || '').localeCompare(b.name || '', 'es', { sensitivity: 'base' })

// Departamentos en los que está ahora: los de sus roles actuales o, si no tiene, el del perfil.
export function memberAreas(contact) {
  const p = contact?.teamProfile
  if (!p) return []
  const areas = [...new Set(currentRoles(p).map((r) => (r.area || '').trim()))]
  if (areas.length === 0) areas.push((p.area || '').trim())
  return areas
}

export function positionIn(contact, area) {
  const value = contact.teamProfile?.order?.[area]
  return Number.isFinite(value) ? value : null
}

// Miembros de un departamento en su orden: primero los que tienen posición; después, por nombre.
export function sortByPosition(members, area) {
  return [...members].sort((a, b) => {
    const pa = positionIn(a, area)
    const pb = positionIn(b, area)
    if (pa !== null && pb !== null && pa !== pb) return pa - pb
    if ((pa === null) !== (pb === null)) return pa === null ? 1 : -1
    return byName(a, b)
  })
}

// Su cargo en ese departamento ("Moderadora"), o el principal si no tiene rol ahí.
export function roleIn(contact, area) {
  const p = contact.teamProfile || {}
  const role = currentRoles(p).find((r) => (r.area || '').trim() === area)
  return role?.role || p.role || ''
}

const plain = (text) =>
  String(text || '')
    .toLocaleLowerCase('es')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')

/**
 * Vista agrupada de Equipo: [{ area, label, members, vacancies }] en el orden de la lista de
 * departamentos, más los que usan los miembros o las vacantes y no están en la lista, y «Sin
 * departamento» al final si hay alguien o alguna vacante. `vacancies`: todas (cada grupo lleva
 * las suyas, en cualquier estado, por fecha de apertura). `area`: solo ese departamento. Con
 * `query`, solo las personas y vacantes (por título) que coinciden, y solo los grupos con alguna
 * (sin búsqueda ni filtro, también los departamentos vacíos).
 */
export function teamGroups(contacts, areas, { query = '', area = '', vacancies = [] } = {}) {
  const members = contacts.filter(isActiveMember)
  const byArea = new Map()
  for (const c of members) {
    for (const a of memberAreas(c)) {
      if (!byArea.has(a)) byArea.set(a, [])
      byArea.get(a).push(c)
    }
  }
  const vacancyArea = (v) => (v.area || '').trim()
  const used = [...byArea.keys(), ...vacancies.map(vacancyArea)]
  const names = [...areas, ...new Set(used.filter((a) => a && !areas.includes(a)))]
  if (used.includes('')) names.push('')
  const q = plain(query).trim()
  return names
    .filter((name) => !area || name === area)
    .map((name) => ({
      area: name,
      label: name || NO_DEPARTMENT_LABEL,
      members: sortByPosition(byArea.get(name) || [], name).filter((c) => memberMatches(c, query)),
      vacancies: vacancies
        .filter((v) => vacancyArea(v) === name && (!q || plain(v.title).includes(q)))
        .sort((a, b) => (b.openedAt || '').localeCompare(a.openedAt || '')),
    }))
    .filter((g) => !q || g.members.length > 0 || g.vacancies.length > 0)
}

// ¿Dirige ese departamento? La primera de la lista, si ya se ha ordenado (tiene posición).
export function isHeadOf(contact, area, contacts) {
  if (!area) return false
  const members = contacts.filter((c) => isActiveMember(c) && memberAreas(c).includes(area))
  const first = sortByPosition(members, area)[0]
  return first?.id === contact.id && positionIn(contact, area) !== null
}

// Departamentos que dirige.
export function headAreas(contact, contacts) {
  return memberAreas(contact).filter((a) => isHeadOf(contact, a, contacts))
}

// Lista con el elemento de `from` movido a `to`.
export function moveItem(list, from, to) {
  if (from === to || from < 0 || to < 0 || from >= list.length || to >= list.length) return list
  const next = [...list]
  const [item] = next.splice(from, 1)
  next.splice(to, 0, item)
  return next
}

/**
 * Cambios para guardar el orden de un departamento: cada persona de `ordered` (contactos, en su
 * orden nuevo) recibe su posición. Solo los que cambian: [{ id, patch: { teamProfile } }].
 */
export function orderPatches(ordered, area) {
  return ordered
    .map((c, index) => ({ c, index }))
    .filter(({ c, index }) => positionIn(c, area) !== index)
    .map(({ c, index }) => ({
      id: c.id,
      patch: { teamProfile: { ...c.teamProfile, order: { ...(c.teamProfile.order || {}), [area]: index } } },
    }))
}
