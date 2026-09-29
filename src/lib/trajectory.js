import { addDays, format, parseISO, startOfDay } from 'date-fns'
import { es } from 'date-fns/locale'
import { makeId } from './store'
import { calendarSpan, spanText } from './duration'

// Trayectoria en CESI: historial de roles de un miembro del equipo, en teamProfile.roles:
//   [{ id, role, area (el departamento), start: 'AAAA-MM-DD' | null, end: 'AAAA-MM-DD' | null }]
// end null = rol actual. Puede haber varios roles actuales a la vez.
// teamProfile.role y teamProfile.area guardan una copia del rol principal (el actual más
// reciente) para la búsqueda, las tarjetas y las copias de seguridad; se recalculan con withRoles.
//
// Tiempo en CESI: se juntan los periodos de todos los roles (lo que se solapa cuenta una sola
// vez, los huecos no cuentan) hasta hoy. Los roles sin fecha de inicio no suman.
// Solo se ve en la app: ninguna página pública lo usa.

// Id de la entrada creada al migrar a los miembros que ya había (la misma en todos los dispositivos).
export const INITIAL_ROLE_ID = 'rol-inicial'

export function newRoleId() {
  return makeId('rol')
}

export function rolesOf(profile) {
  return Array.isArray(profile?.roles) ? profile.roles : []
}

export function isCurrentRole(role) {
  return !role.end
}

// Clave de orden: la fecha de inicio; sin ella, la de fin (los actuales sin fecha, arriba).
function sortKey(role) {
  return role.start || role.end || '9999-99-99'
}

// Del más reciente al más antiguo; a igual fecha, primero el actual.
export function sortRoles(roles) {
  return [...roles].sort((a, b) => {
    const ka = sortKey(a)
    const kb = sortKey(b)
    if (ka !== kb) return ka < kb ? 1 : -1
    if (!a.end !== !b.end) return a.end ? 1 : -1
    return 0
  })
}

export function currentRoles(profile) {
  return sortRoles(rolesOf(profile).filter(isCurrentRole))
}

// Rol principal: el actual más reciente o, si no hay ninguno actual, el último que tuvo.
export function principalRole(profile) {
  return currentRoles(profile)[0] || sortRoles(rolesOf(profile))[0] || null
}

// Perfil con esos roles (ordenados) y la copia del rol principal en role y area.
export function withRoles(profile, roles) {
  const sorted = sortRoles(roles)
  const principal = sorted.find(isCurrentRole) || sorted[0] || null
  return { ...profile, roles: sorted, role: principal?.role || '', area: principal?.area || '' }
}

// ---------------------------------------------------------------------------
// Migración desde la trayectoria en texto libre
// ---------------------------------------------------------------------------
// Antes la trayectoria era texto libre (teamProfile.bio), con líneas como
// "24/2/2026 – Se incorporó como Profesor." (las escribía la app al incorporar a alguien o al
// convertir los hitos). Esas líneas pasan a ser roles con su fecha; las que no se entienden se
// quedan en bio («Sobre esta persona»), sin perder nada.

// "24/2/2026 – texto", "24/02/2026 — texto", "24/2/2026 - texto", "24/2/2026: texto"
const DATED_LINE = /^(\d{1,2})\/(\d{1,2})\/(\d{4})\s*(?:[–—-]|:)\s*(.+)$/

// Frases que dicen qué rol empezó en esa fecha (el rol, en el grupo 1).
const ROLE_PHRASES = [
  /^se (?:incorporó|incorpora|unió|une)(?: al equipo| a cesi)? como (.+)$/i,
  /^(?:empezó|empieza|comenzó|entró) como (.+)$/i,
  /^(?:pasó|pasa) a (?:ser )?(.+)$/i,
  /^(?:ascendió|asciende|ascendid[oa]|promocionó|promocionad[oa]) (?:a|como) (.+)$/i,
  /^(?:nombrad[oa]|nuevo rol:?|nuevo cargo:?|ahora es|cambi(?:ó|o) de rol a|cambio de rol a|rol:) (.+)$/i,
]
// Se incorporó sin decir el rol: vale el cargo de la ficha si es la última línea.
const JOINED_NO_ROLE = /^se (?:incorporó|incorpora|unió|une) (?:al equipo|a cesi)$/i

function dateKey(d, m, y) {
  const date = new Date(Number(y), Number(m) - 1, Number(d))
  if (date.getFullYear() !== Number(y) || date.getMonth() !== Number(m) - 1 || date.getDate() !== Number(d)) return null
  return format(date, 'yyyy-MM-dd')
}

function cleanRole(text) {
  return text
    .trim()
    .replace(/[.;,]+$/, '')
    .replace(/^["«“](.*)["»”]$/, '$1')
    .trim()
}

const sameRole = (a, b) => (a || '').trim().toLocaleLowerCase('es') === (b || '').trim().toLocaleLowerCase('es')

// Una línea: { start, role } (role null = se incorporó sin decir el rol) o null si no se entiende.
export function parseTrajectoryLine(line) {
  const m = DATED_LINE.exec(line.trim())
  if (!m) return null
  const start = dateKey(m[1], m[2], m[3])
  if (!start) return null
  const text = cleanRole(m[4])
  if (JOINED_NO_ROLE.test(text)) return { start, role: null }
  for (const re of ROLE_PHRASES) {
    const r = re.exec(text)
    if (r && cleanRole(r[1])) return { start, role: cleanRole(r[1]) }
  }
  return null
}

/**
 * Texto de la trayectoria antigua → { roles, notes, warnings }.
 * Cada rol empieza en su fecha y termina donde empieza el siguiente; el último sigue siendo el
 * actual (o se cierra con la fecha de salida si ya no es del equipo). El departamento solo se
 * sabe del rol que coincide con el cargo de la ficha. Las líneas que no se entienden van a
 * `notes` tal cual. Si el cargo de la ficha no es el de la última línea, se añade como rol
 * actual sin fecha de inicio (y se avisa en `warnings`).
 */
export function rolesFromText(profile) {
  const lines = (profile?.bio || '').split(/\r?\n/)
  const parsed = []
  const notes = []
  const warnings = []
  lines.forEach((line) => {
    if (!line.trim()) return
    const entry = parseTrajectoryLine(line)
    if (entry) parsed.push({ ...entry, line })
    else notes.push(line.trim())
  })
  // Del más antiguo al más reciente (a igual fecha, en el orden en que estaban).
  parsed.sort((a, b) => (a.start < b.start ? -1 : a.start > b.start ? 1 : 0))

  const fichaRole = (profile?.role || '').trim()
  const kept = []
  parsed.forEach((p, i) => {
    if (p.role) return kept.push(p)
    if (i === parsed.length - 1 && fichaRole) return kept.push({ ...p, role: fichaRole })
    notes.push(p.line.trim())
    warnings.push(`Sin rol: «${p.line.trim()}»`)
  })

  const former = profile?.status === 'former'
  const roles = kept.map((p, i) => ({
    id: `rol-texto-${i + 1}`,
    role: p.role,
    area: sameRole(p.role, fichaRole) ? profile.area || '' : '',
    start: p.start,
    end: i < kept.length - 1 ? kept[i + 1].start : former ? profile.leftAt || null : null,
  }))

  const last = roles[roles.length - 1]
  if (last && fichaRole && !sameRole(last.role, fichaRole)) {
    roles.push({ id: INITIAL_ROLE_ID, role: fichaRole, area: profile.area || '', start: null, end: former ? profile.leftAt || null : null })
    warnings.push(`El cargo de la ficha («${fichaRole}») no es el de la última línea («${last.role}»): se añade como rol actual sin fecha de inicio.`)
  }
  return { roles, notes, warnings }
}

// Ajustes de la conversión de un miembro concreto (ver trajectoryFixes.js):
//   role: cargo correcto de la ficha (si tenía una errata);
//   areas: { rol: departamento } para los roles que se quedarían sin departamento;
//   current: roles que siguen siendo actuales aunque después empezara otro.
function applyFix(roles, fix, former) {
  if (!fix) return roles
  const areas = fix.areas || {}
  const current = fix.current || []
  return roles.map((r) => {
    const next = { ...r }
    const area = Object.keys(areas).find((name) => sameRole(name, r.role))
    if (!next.area && area) next.area = areas[area]
    if (!former && current.some((name) => sameRole(name, r.role))) next.end = null
    return next
  })
}

/**
 * Migración: los miembros que aún no tienen trayectoria (`roles`) la reciben a partir de las
 * líneas con fecha de su trayectoria en texto (ver rolesFromText). Las líneas que no se entienden
 * se quedan en bio, que pasa a ser «Sobre esta persona». Sin ninguna línea con fecha, la
 * trayectoria empieza con su cargo y departamento de ahora, desde la fecha de incorporación. A los
 * antiguos miembros se les cierra con su fecha de salida. `fix`: ajustes de ese miembro (ver
 * applyFix). El texto, el cargo, el departamento y la fecha de antes se guardan tal cual en
 * `legacyTrajectory` (no se muestra en la app; sirve para recuperarlos si hiciera falta).
 * Devuelve el mismo perfil si ya tenía `roles`.
 */
export function migrateRoles(profile, fix = null) {
  if (!profile || Array.isArray(profile.roles)) return profile
  const legacyTrajectory = {
    bio: profile.bio || '',
    role: profile.role || '',
    area: profile.area || '',
    joinedAt: profile.joinedAt || null,
  }
  const source = fix?.role ? { ...profile, role: fix.role } : profile
  const { roles, notes } = rolesFromText(source)
  const former = profile.status === 'former'
  const moved = { ...source, bio: notes.join('\n'), legacyTrajectory }
  if (roles.length > 0) return withRoles(moved, applyFix(roles, fix, former))
  const role = (source.role || '').trim()
  const area = source.area || ''
  if (!role && !area) return { ...moved, roles: [] }
  const end = former ? profile.leftAt || null : null
  return withRoles(moved, [{ id: INITIAL_ROLE_ID, role, area, start: profile.joinedAt || null, end }])
}

// "Moderadora · Moderación"
export function roleLabel(role) {
  return [role.role, role.area].filter(Boolean).join(' · ')
}

// Mensaje de error de una entrada, o null.
export function validateRole({ role, start, end }) {
  if (!(role || '').trim()) return 'Escribe el rol.'
  if (start && end && end < start) return 'La fecha de fin es anterior a la de inicio.'
  return null
}

// Cierra esos roles con esa fecha (nunca antes de su inicio).
export function closeRoles(roles, ids, date) {
  const set = new Set(ids)
  return roles.map((r) => (set.has(r.id) && !r.end ? { ...r, end: r.start && r.start > date ? r.start : date } : r))
}

// Al marcar a alguien como antiguo miembro, sus roles actuales se cierran con la fecha de salida.
export function applyLeaving(roles, status, leftAt) {
  if (status !== 'former' || !leftAt) return roles
  return closeRoles(
    roles,
    roles.filter(isCurrentRole).map((r) => r.id),
    leftAt,
  )
}

/**
 * Nuevo rol al aceptar a alguien en una vacante (con fecha de hoy). `closeIds`: los roles
 * actuales que sustituye (se cierran hoy); vacío si el nuevo rol se suma a los que ya tiene.
 */
export function acceptRole(profile, { role, area, closeIds = [], today }) {
  const roles = closeRoles(rolesOf(profile), closeIds, today)
  const entry = { id: newRoleId(), role, area: area || '', start: today, end: null }
  return { ...withRoles(profile, [...roles, entry]), status: 'active', leftAt: null }
}

// ---------------------------------------------------------------------------
// Duraciones
// ---------------------------------------------------------------------------

function parseDay(key) {
  if (!key) return null
  const d = parseISO(key)
  return Number.isNaN(d.getTime()) ? null : d
}

// Periodo de un rol hasta hoy como mucho, o null (sin inicio, futuro o fechas al revés).
function roleRange(role, today) {
  const start = parseDay(role.start)
  if (!start || start > today) return null
  const endDay = parseDay(role.end)
  const end = endDay && endDay < today ? endDay : today
  return end < start ? null : { start, end }
}

// Periodos juntados: lo que se solapa (o va seguido, de un día al siguiente) es un solo periodo.
export function mergedRanges(roles, now = new Date()) {
  const today = startOfDay(now)
  const ranges = roles
    .map((r) => roleRange(r, today))
    .filter(Boolean)
    .sort((a, b) => a.start - b.start)
  const merged = []
  for (const r of ranges) {
    const last = merged[merged.length - 1]
    if (last && r.start <= addDays(last.end, 1)) {
      if (r.end > last.end) last.end = r.end
    } else {
      merged.push({ ...r })
    }
  }
  return merged
}

/**
 * Tiempo total en CESI: { span: { months, days } | null, days (para ordenar), missingStart }.
 * Cada periodo se mide por calendario y se suman; cada 30 días que sobran cuentan como un mes.
 */
export function tenure(profile, now = new Date()) {
  const roles = rolesOf(profile)
  const missingStart = roles.filter((r) => !r.start).length
  const ranges = mergedRanges(roles, now)
  if (ranges.length === 0) return { span: null, days: 0, missingStart }
  let months = 0
  let days = 0
  let total = 0
  for (const { start, end } of ranges) {
    const s = calendarSpan(start, end)
    months += s.months
    days += s.days
    total += Math.round((end - start) / 86400000)
  }
  months += Math.floor(days / 30)
  days %= 30
  return { span: { months, days }, days: total, missingStart }
}

// "1 año y 7 meses en CESI" ('' sin ningún rol con fecha).
export function tenureText(t) {
  return t.span ? `${spanText(t.span)} en CESI` : ''
}

// Aviso de los roles sin fecha de inicio ('' si no falta ninguna).
export function missingStartText(n) {
  if (n === 0) return ''
  return n === 1
    ? 'Falta la fecha de inicio de 1 rol: no cuenta en el total.'
    : `Falta la fecha de inicio de ${n} roles: no cuentan en el total.`
}

// "03/02/2025"
export function dayShort(key) {
  const d = parseDay(key)
  return d ? format(d, 'dd/MM/yyyy') : ''
}

// "3 de febrero de 2025"
export function dayLong(key) {
  const d = parseDay(key)
  return d ? format(d, "d 'de' MMMM 'de' yyyy", { locale: es }) : ''
}

// "03/02/2025 – actual", "Sin fecha de inicio – 10/05/2026"
export function roleDatesText(role) {
  const from = role.start ? dayShort(role.start) : 'Sin fecha de inicio'
  return `${from} – ${role.end ? dayShort(role.end) : 'actual'}`
}

// Duración de un rol: "1 año y 2 meses", "empieza el 05/10/2026", o '' sin fecha de inicio.
export function roleDurationText(role, now = new Date()) {
  const start = parseDay(role.start)
  if (!start) return ''
  const today = startOfDay(now)
  if (start > today) return `empieza el ${dayShort(role.start)}`
  const range = roleRange(role, today)
  return range ? spanText(calendarSpan(range.start, range.end)) : ''
}

/**
 * Resumen para una candidatura de alguien que ya es (o fue) del equipo, o null:
 * "Ya es del equipo: Moderadora desde el 3 de febrero de 2025 · 1 año y 7 meses en CESI".
 */
export function memberSummary(contact, now = new Date()) {
  const profile = contact?.teamProfile
  if (!profile) return null
  const total = tenureText(tenure(profile, now))
  if (profile.status === 'former') {
    const last = sortRoles(rolesOf(profile))[0]
    const until = profile.leftAt || last?.end
    const what = [last?.role, until ? `hasta el ${dayLong(until)}` : ''].filter(Boolean).join(' ')
    return { former: true, text: ['Fue del equipo' + (what ? `: ${what}` : ''), total].filter(Boolean).join(' · ') }
  }
  const roles = currentRoles(profile)
    .map((r) => [r.role || r.area, r.start ? `desde el ${dayLong(r.start)}` : ''].filter(Boolean).join(' '))
    .join(' y ')
  return { former: false, text: ['Ya es del equipo' + (roles ? `: ${roles}` : ''), total].filter(Boolean).join(' · ') }
}
