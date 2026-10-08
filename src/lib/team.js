import { format, parseISO, startOfDay } from 'date-fns'
import { es } from 'date-fns/locale'
import { readJSON, writeJSON } from './store'
import { DEFAULT_DEPARTMENTS, addDepartment } from './departments'
import { cleanLinks, migrateProfileLinks, normalizeUrl } from './links'
import { calendarSpan, longSpan, shortSpan } from './duration'
import { currentRoles, migrateRoles, rolesOf, tenure } from './trajectory'
import { TRAJECTORY_FIXES } from './trajectoryFixes'

export { calendarSpan }

// Equipo. Cada miembro es un contacto con `teamProfile` (no se duplican sus datos):
// {
//   status: 'active' | 'former', leftAt: 'AAAA-MM-DD' | null (ver formerMembers.js: los antiguos
//           miembros no salen en Equipo; formerGroupHandled y keepActive son de ahí),
//   role, area (el departamento): copia del rol principal de `roles`,
//   roles: trayectoria en CESI, el historial de roles (ver trajectory.js),
//   joinedAt: 'AAAA-MM-DD' fecha de incorporación (la de versiones anteriores; se ofrece como
//             fecha de inicio de los roles que no la tienen),
//   bio: «Sobre esta persona» (texto libre, con saltos de línea; antes se llamaba trayectoria),
//   quote: frase personal (opcional, hasta QUOTE_MAX_LENGTH caracteres),
//   links: [{ id, label, url }]  una sola lista de enlaces (redes incluidas),
// }
// La foto, el email y el teléfono son los del contacto.

export const AREAS_KEY = 'cesi_team_areas_v1'

// Departamentos (antes "áreas"): la lógica está en departments.js.
export const DEFAULT_AREAS = DEFAULT_DEPARTMENTS

export function getTeamAreas() {
  const stored = readJSON(AREAS_KEY, null)
  return Array.isArray(stored) && stored.length > 0 ? stored : DEFAULT_AREAS
}

// Lista guardada tal cual (null si nunca se ha guardado), para la migración.
export function getStoredTeamAreas() {
  return readJSON(AREAS_KEY, null)
}

export function saveTeamAreas(areas) {
  writeJSON(AREAS_KEY, areas)
}

// Añade un departamento a la lista (sin duplicados, sin distinguir mayúsculas ni acentos).
export const addArea = addDepartment

// Dirección completa de un enlace (añade "https://" si falta).
export const linkUrl = normalizeUrl

export function isTeamMember(contact) {
  return !!contact?.teamProfile
}

export function isActiveMember(contact) {
  return isTeamMember(contact) && contact.teamProfile.status !== 'former'
}

// Contactos: todos menos los miembros activos del equipo, que solo salen en Equipo. Los antiguos
// miembros y los candidatos sí están (al pasar a antiguo miembro aparece aquí; si vuelve, se va).
export function contactsSection(contacts) {
  return contacts.filter((c) => !isActiveMember(c))
}

export function todayKey(now = new Date()) {
  return format(now, 'yyyy-MM-dd')
}

export function emptyTeamProfile(partial = {}) {
  return {
    status: 'active',
    leftAt: null,
    role: '',
    area: '',
    joinedAt: todayKey(),
    bio: '',
    quote: '',
    links: [],
    ...partial,
  }
}

// "30/07/2026"
export function formatDayKey(key) {
  const [y, m, d] = (key || '').split('-')
  return y && m && d ? `${d}/${m}/${y}` : ''
}

// Línea de la trayectoria: "30/07/2026 – Se incorporó como moderador".
export function joinedLine(dateKey, role) {
  const text = role ? `Se incorporó como ${role}` : 'Se incorporó al equipo'
  const day = formatDayKey(dateKey)
  return day ? `${day} – ${text}` : text
}

/**
 * Migración: los hitos (formato antiguo) pasan al final de la trayectoria como líneas de texto
 * ("30/07/2026 – Se incorporó como moderador"), ordenados por fecha (los que no tienen fecha, al
 * final, en su orden), y se borran. Devuelve el mismo perfil si no tenía hitos.
 */
export function milestonesToBio(profile) {
  if (!profile || !('milestones' in profile)) return profile
  const { milestones, ...rest } = profile
  const lines = (Array.isArray(milestones) ? milestones : [])
    .filter((m) => m && (m.text || '').trim())
    .map((m, index) => ({ m, index }))
    .sort((a, b) => {
      const da = a.m.date || ''
      const db = b.m.date || ''
      if (da && db && da !== db) return da < db ? -1 : 1
      if (!da !== !db) return da ? -1 : 1
      return a.index - b.index
    })
    .map(({ m }) => (m.date ? `${formatDayKey(m.date)} – ${m.text.trim()}` : m.text.trim()))
  if (lines.length === 0) return rest
  const bio = (rest.bio || '').replace(/\s+$/, '')
  return { ...rest, bio: [bio, ...lines].filter(Boolean).join('\n') }
}


/**
 * Antigüedad a partir de la fecha de incorporación ('AAAA-MM-DD'), por calendario:
 * - menos de 1 mes: "se incorporó hace 3 semanas", "hace 5 días", "ayer", "hoy";
 * - entre 1 mes y 1 año: "lleva 1 mes y 25 días", "lleva 2 meses";
 * - 1 año o más: "lleva 1 año y 2 meses", "lleva 2 años".
 * Antiguos miembros (con leftAt): lo mismo hasta la salida, "estuvo 1 año y 3 meses".
 */
export function seniorityText(joinedAt, now = new Date(), leftAt = null) {
  if (!joinedAt) return ''
  const joined = parseISO(joinedAt)
  if (Number.isNaN(joined.getTime())) return ''
  if (leftAt) {
    const left = parseISO(leftAt)
    if (Number.isNaN(left.getTime()) || left < joined) return ''
    const span = calendarSpan(joined, left)
    return `estuvo ${span.months >= 1 ? longSpan(span) : shortSpan(Math.max(span.days, 1))}`
  }
  const today = startOfDay(now)
  if (joined > today) return `se incorpora el ${format(joined, "d 'de' MMMM 'de' yyyy", { locale: es })}`
  const span = calendarSpan(joined, today)
  if (span.months >= 1) return `lleva ${longSpan(span)}`
  if (span.days === 0) return 'se incorporó hoy'
  if (span.days === 1) return 'se incorporó ayer'
  return `se incorporó hace ${shortSpan(span.days)}`
}

export function capitalize(text) {
  return text ? text[0].toLocaleUpperCase('es') + text.slice(1) : text
}

// Busca en nombre, cargo, departamento, email y trayectoria.
export function memberMatches(contact, query) {
  const norm = (t) =>
    (t || '')
      .toString()
      .toLocaleLowerCase('es')
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
  const q = norm(query).trim()
  if (!q) return true
  const p = contact.teamProfile || {}
  const roles = rolesOf(p).flatMap((r) => [r.role, r.area])
  return [contact.name, contact.email, p.role, p.area, p.bio, ...roles].some((f) => norm(f).includes(q))
}

// ¿Está en ese departamento? Por sus roles actuales (los antiguos miembros, por cualquiera de sus roles).
export function memberInArea(contact, area) {
  const p = contact.teamProfile || {}
  if (p.area === area) return true
  const roles = p.status === 'former' ? rolesOf(p) : currentRoles(p)
  return roles.some((r) => r.area === area)
}

export const MEMBER_SORTS = { name: 'Nombre', tenure: 'Antigüedad' }

const byName = (a, b) => (a.name || '').localeCompare(b.name || '', 'es', { sensitivity: 'base' })

// Miembros de la sección Equipo: solo los activos (los antiguos miembros están en Contactos).
// sort: 'name' o 'tenure' (más tiempo en CESI primero; quien no tiene ningún rol con fecha, al final).
export function filterMembers(contacts, { query = '', area = '', sort = 'name', now = new Date() } = {}) {
  const list = contacts
    .filter(isActiveMember)
    .filter((c) => !area || memberInArea(c, area))
    .filter((c) => memberMatches(c, query))
  if (sort !== 'tenure') return list.sort(byName)
  const times = new Map(list.map((c) => [c.id, tenure(c.teamProfile, now)]))
  return list.sort((a, b) => {
    const ta = times.get(a.id)
    const tb = times.get(b.id)
    if (!ta.span !== !tb.span) return ta.span ? -1 : 1
    return tb.days - ta.days || byName(a, b)
  })
}

// ---------------------------------------------------------------------------
// Miembro y contacto son la misma ficha
// ---------------------------------------------------------------------------
// Nombre, email, teléfono, país y zona, foto, grupos, disponibilidad y notas se guardan solo en
// el contacto. El perfil de equipo añade lo propio del equipo: cargo, departamento, incorporación,
// trayectoria, enlaces y estado.

// Perfil con el que se abre "Marcar como miembro del equipo": el cargo del contacto, hoy como
// fecha de incorporación y los enlaces que ya tuviera el contacto.
export function teamProfileDefaults(contact, now = new Date()) {
  return emptyTeamProfile({ role: contact?.role || '', joinedAt: todayKey(now), links: [...(contact?.links || [])] })
}

const MERGED_FIELDS = [
  { key: 'email', label: 'Otro email' },
  { key: 'phone', label: 'Otro teléfono' },
]

function sameValue(a, b) {
  return (a || '').trim().toLocaleLowerCase('es') === (b || '').trim().toLocaleLowerCase('es')
}

/**
 * Datos guardados por separado en el perfil de equipo (formato antiguo: email, teléfono, foto)
 * que pasan al contacto sin perder nada: si el contacto no tenía ese dato, se copia; si los dos
 * lo tienen y son distintos, se conserva el del contacto y el otro se añade a sus notas.
 * Devuelve el mismo contacto si no hay nada que fusionar.
 */
export function mergeTeamContactData(contact) {
  const profile = contact?.teamProfile
  if (!profile || !['email', 'phone', 'photo'].some((k) => k in profile)) return contact
  const next = { ...contact }
  const { email, phone, photo, ...rest } = profile
  const extra = []
  for (const { key, label } of MERGED_FIELDS) {
    const raw = key === 'email' ? email : phone
    const value = typeof raw === 'string' ? raw.trim() : ''
    if (!value) continue
    if (!(contact[key] || '').trim()) next[key] = value
    else if (!sameValue(contact[key], value)) extra.push(`${label}: ${value}`)
  }
  if (photo && !contact.photo) next.photo = photo
  const notes = (contact.notes || '').trim()
  const missing = extra.filter((line) => !notes.includes(line))
  if (missing.length > 0) next.notes = [notes, ...missing].filter(Boolean).join('\n')
  next.teamProfile = rest
  return next
}

// "Quitar del equipo": el contacto se queda con todos sus datos; los enlaces del perfil pasan al
// contacto para no perderlos (y vuelven al perfil si se le marca otra vez como miembro).
export function removeFromTeamPatch(contact) {
  const profile = migrateProfileLinks(contact.teamProfile)
  return { teamProfile: null, links: cleanLinks([...(contact.links || []), ...(profile?.links || [])]) }
}

/**
 * Migraciones del perfil de equipo al leer los contactos (datos del contacto, redes, hitos y trayectoria) (también los que llegan de la nube o de
 * una copia antigua). Devuelve el mismo contacto si no hay nada que cambiar.
 */
export function migrateTeamProfile(contact) {
  let next = mergeTeamContactData(contact)
  if (next?.teamProfile) {
    const profile = migrateRoles(milestonesToBio(migrateProfileLinks(next.teamProfile)), TRAJECTORY_FIXES[next.id])
    if (profile !== next.teamProfile) next = { ...next, teamProfile: profile }
  }
  return next
}

// ---------------------------------------------------------------------------
// Frase personal
// ---------------------------------------------------------------------------

export const QUOTE_MAX_LENGTH = 150

// Frase lista para guardar: sin espacios de más ni saltos de línea, y como mucho 150 caracteres.
export function normalizeQuote(text) {
  return (text || '').replace(/\s+/g, ' ').trim().slice(0, QUOTE_MAX_LENGTH)
}

// Error si la frase es demasiado larga, o null.
export function validateQuote(text) {
  const length = (text || '').replace(/\s+/g, ' ').trim().length
  return length > QUOTE_MAX_LENGTH ? `La frase personal tiene ${length} caracteres; el máximo es ${QUOTE_MAX_LENGTH}.` : null
}

// Entre comillas: «Si tú cambias, todo cambia»
export function quoteDisplay(text) {
  const clean = normalizeQuote(text).replace(/^["“«]+|["”»]+$/g, '')
  return clean ? `«${clean}»` : ''
}
