import { differenceInCalendarDays, differenceInMonths, format, parseISO } from 'date-fns'
import { es } from 'date-fns/locale'
import { readJSON, writeJSON, makeId } from './store'
import { DEFAULT_DEPARTMENTS, addDepartment } from './departments'

// Equipo. Cada miembro es un contacto con `teamProfile` (no se duplican sus datos):
// {
//   status: 'active' | 'former', leftAt: 'AAAA-MM-DD' | null,
//   role, area (el departamento), joinedAt: 'AAAA-MM-DD',
//   bio: texto libre de trayectoria,
//   milestones: [{ id, date: 'AAAA-MM-DD' | '', text }],
//   social: { instagram, linkedin, tiktok, youtube, web },
//   links: [{ id, label, url }],
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

export const SOCIAL_NETWORKS = [
  { key: 'instagram', label: 'Instagram', placeholder: '@usuario', base: 'https://instagram.com/' },
  { key: 'linkedin', label: 'LinkedIn', placeholder: 'Enlace al perfil', base: 'https://www.linkedin.com/in/' },
  { key: 'tiktok', label: 'TikTok', placeholder: '@usuario', base: 'https://www.tiktok.com/@' },
  { key: 'youtube', label: 'YouTube', placeholder: 'Enlace al canal', base: 'https://www.youtube.com/@' },
  { key: 'web', label: 'Web', placeholder: 'https://…', base: 'https://' },
]

// Enlace a partir de lo que se escribió ("@ana", "ana", "instagram.com/ana" o una URL completa).
export function socialUrl(key, value) {
  const v = (value || '').trim()
  if (!v) return ''
  if (/^https?:\/\//i.test(v)) return v
  if (/^[\w-]+(\.[\w-]+)+(\/|$)/.test(v)) return `https://${v}`
  const network = SOCIAL_NETWORKS.find((n) => n.key === key)
  return `${network?.base || 'https://'}${v.replace(/^@/, '')}`
}

export function linkUrl(value) {
  const v = (value || '').trim()
  if (!v) return ''
  return /^[a-z]+:\/\//i.test(v) || v.startsWith('mailto:') ? v : `https://${v}`
}

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

// "2 años y 3 meses", "1 año", "5 meses"
function yearsAndMonths(months) {
  const years = Math.floor(months / 12)
  const rest = months % 12
  if (years === 0) return plural(rest, 'mes', 'meses')
  if (rest === 0) return plural(years, 'año', 'años')
  return `${plural(years, 'año', 'años')} y ${plural(rest, 'mes', 'meses')}`
}

// "3 semanas", "5 días"
function shortSpan(days) {
  if (days >= 7) return plural(Math.floor(days / 7), 'semana', 'semanas')
  return plural(days, 'día', 'días')
}

/**
 * Antigüedad a partir de la fecha de incorporación ('AAAA-MM-DD').
 * Activos: "lleva 2 años y 3 meses", "se incorporó hace 3 semanas", "se incorporó hoy".
 * Antiguos miembros (con leftAt): "estuvo 2 años y 3 meses".
 */
export function seniorityText(joinedAt, now = new Date(), leftAt = null) {
  if (!joinedAt) return ''
  const joined = parseISO(joinedAt)
  if (Number.isNaN(joined.getTime())) return ''
  if (leftAt) {
    const left = parseISO(leftAt)
    const months = differenceInMonths(left, joined)
    const days = differenceInCalendarDays(left, joined)
    if (days < 0) return ''
    return `estuvo ${months >= 1 ? yearsAndMonths(months) : shortSpan(Math.max(days, 1))}`
  }
  const days = differenceInCalendarDays(now, joined)
  if (days < 0) return `se incorpora el ${format(joined, "d 'de' MMMM 'de' yyyy", { locale: es })}`
  if (days === 0) return 'se incorporó hoy'
  if (days === 1) return 'se incorporó ayer'
  const months = differenceInMonths(now, joined)
  if (months < 1) return `se incorporó hace ${shortSpan(days)}`
  return `lleva ${yearsAndMonths(months)}`
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

// Enlaces del perfil (y, en el formato antiguo, sus redes) como lista [{ id, label, url }].
export function profileLinks(profile) {
  const social = Object.entries(profile?.social || {})
    .filter(([, value]) => value && String(value).trim())
    .map(([key, value]) => ({ id: makeId('link'), label: '', url: socialUrl(key, value) }))
  return [...(profile?.links || []), ...social]
}

// "Quitar del equipo": el contacto se queda con todos sus datos; los enlaces del perfil pasan al
// contacto para no perderlos (y vuelven al perfil si se le marca otra vez como miembro).
export function removeFromTeamPatch(contact) {
  const seen = new Set()
  const links = [...(contact.links || []), ...profileLinks(contact.teamProfile)].filter((l) => {
    const key = linkUrl(l.url).toLowerCase()
    if (!key || seen.has(key)) return false
    seen.add(key)
    return true
  })
  return { teamProfile: null, links }
}
