import { addMonths, differenceInCalendarDays, format, parseISO, startOfDay } from 'date-fns'
import { es } from 'date-fns/locale'
import { readJSON, writeJSON, makeId } from './store'
import { DEFAULT_DEPARTMENTS, addDepartment } from './departments'
import { cleanLinks, migrateProfileLinks, normalizeUrl } from './links'

// Equipo. Cada miembro es un contacto con `teamProfile` (no se duplican sus datos):
// {
//   status: 'active' | 'former', leftAt: 'AAAA-MM-DD' | null,
//   role, area (el departamento), joinedAt: 'AAAA-MM-DD',
//   bio: texto libre de trayectoria,
//   milestones: [{ id, date: 'AAAA-MM-DD' | '', text }],
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
    milestones: [],
    social: {},
    links: [],
    ...partial,
  }
}

export function newMilestone(date = '', text = '') {
  return { id: makeId('hito'), date, text }
}

// Hitos como una línea de tiempo: del más antiguo al más reciente; los que no tienen fecha, al
// final, en el orden en que se escribieron.
export function sortMilestones(milestones = []) {
  return milestones
    .map((m, index) => ({ m, index }))
    .sort((a, b) => {
      const da = a.m.date || ''
      const db = b.m.date || ''
      if (da && db && da !== db) return da < db ? -1 : 1
      if (!da !== !db) return da ? -1 : 1
      return a.index - b.index
    })
    .map(({ m }) => m)
}

function plural(n, one, many) {
  return `${n} ${n === 1 ? one : many}`
}

/**
 * Tiempo entre dos fechas por calendario: meses completos y días que sobran.
 * Del 30/07 al 30/08 es 1 mes; del 30/07 al 24/09, 1 mes y 25 días. En los finales de mes se
 * cuenta hasta el último día del mes siguiente: del 31/01 al 28/02 es 1 mes.
 */
export function calendarSpan(from, to) {
  let months = (to.getFullYear() - from.getFullYear()) * 12 + (to.getMonth() - from.getMonth())
  // addMonths ajusta al último día del mes (31/01 + 1 mes = 28/02).
  while (months > 0 && addMonths(from, months) > to) months -= 1
  const days = differenceInCalendarDays(to, addMonths(from, months))
  return { months, days }
}

// "3 semanas", "5 días" (menos de un mes)
function shortSpan(days) {
  if (days >= 7) return plural(Math.floor(days / 7), 'semana', 'semanas')
  return plural(days, 'día', 'días')
}

// "1 mes y 25 días", "2 meses", "1 año y 2 meses", "2 años" (un mes o más)
function longSpan({ months, days }) {
  if (months < 12) return days > 0 ? `${plural(months, 'mes', 'meses')} y ${plural(days, 'día', 'días')}` : plural(months, 'mes', 'meses')
  const years = Math.floor(months / 12)
  const rest = months % 12
  return rest > 0 ? `${plural(years, 'año', 'años')} y ${plural(rest, 'mes', 'meses')}` : plural(years, 'año', 'años')
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
  return [contact.name, contact.email, p.role, p.area, p.bio].some((f) => norm(f).includes(q))
}

export function filterMembers(contacts, { query = '', area = '', status = 'active' } = {}) {
  return contacts
    .filter(isTeamMember)
    .filter((c) => (status === 'former' ? c.teamProfile.status === 'former' : c.teamProfile.status !== 'former'))
    .filter((c) => !area || c.teamProfile.area === area)
    .filter((c) => memberMatches(c, query))
    .sort((a, b) => (a.name || '').localeCompare(b.name || '', 'es', { sensitivity: 'base' }))
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
 * Migraciones del perfil de equipo al leer los contactos (también los que llegan de la nube o de
 * una copia antigua). Devuelve el mismo contacto si no hay nada que cambiar.
 */
export function migrateTeamProfile(contact) {
  let next = mergeTeamContactData(contact)
  if (next?.teamProfile) {
    const profile = migrateProfileLinks(next.teamProfile)
    if (profile !== next.teamProfile) next = { ...next, teamProfile: profile }
  }
  return next
}
