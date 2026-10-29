import { isTeamMember } from './team'
import { normalizeName } from './applications'

// Cuentas y papeles (tabla profiles, ver supabase/schema.sql). Solo la ceo entra en la app; el
// resto de papeles ve de momento una pantalla de espera.

export const ROLES = ['ceo', 'equipo', 'alumno', 'pendiente']

export const ROLE_LABELS = {
  ceo: 'CEO',
  equipo: 'Equipo',
  alumno: 'Alumno',
  pendiente: 'Pendiente',
}

// Todas las columnas: auth_provider y discord_username solo existen tras el SQL de la parte 1b.
const PROFILE_FIELDS = '*'

const PROVIDER_LABELS = { email: 'Correo', google: 'Google', discord: 'Discord' }

// Con qué se registró la cuenta: «Google», «Discord · @usuario», «Correo» (null si no se sabe).
export function providerText(profile) {
  const provider = profile?.auth_provider
  if (!provider) return null
  const label = PROVIDER_LABELS[provider] || provider
  return provider === 'discord' && profile.discord_username ? `${label} · @${profile.discord_username}` : label
}

// Último papel conocido de la cuenta de este dispositivo: { userId, role }. Sirve para abrir la
// app sin conexión (y sin esperar al servidor) como hasta ahora.
export const ROLE_CACHE_KEY = 'cesi_role_v1'

export function readCachedRole(userId = null) {
  try {
    const cached = JSON.parse(localStorage.getItem(ROLE_CACHE_KEY) || 'null')
    if (!cached || !ROLES.includes(cached.role)) return null
    if (userId && cached.userId !== userId) return null
    return cached.role
  } catch {
    return null
  }
}

export function writeCachedRole(userId, role) {
  try {
    localStorage.setItem(ROLE_CACHE_KEY, JSON.stringify({ userId, role }))
  } catch {
    // Sin localStorage solo se pierde abrir sin conexión.
  }
}

// La tabla profiles todavía no existe en Supabase (falta ejecutar el SQL de la parte 1a).
export function isMissingTable(error) {
  return error?.code === 'PGRST205' || error?.code === '42P01'
}

// Perfil de la cuenta con sesión: { status: 'ok', role, name, area } | { status: 'legacy' } (sin
// tabla profiles: la app de siempre) | { status: 'error', error } (sin conexión u otro fallo).
// Todas las columnas: `area` solo existe tras el SQL de la parte 2.
export async function fetchOwnRole(client, userId) {
  try {
    const { data, error } = await client.from('profiles').select('*').eq('id', userId).maybeSingle()
    if (error) return isMissingTable(error) ? { status: 'legacy' } : { status: 'error', error }
    return {
      status: 'ok',
      role: ROLES.includes(data?.role) ? data.role : 'pendiente',
      name: data?.display_name || '',
      area: data?.area || null,
    }
  } catch (error) {
    return { status: 'error', error }
  }
}

// Papel con el que se abre la app: el del servidor; sin tabla profiles, ceo (como antes); si no
// se ha podido comprobar, el último conocido. null: aún no se sabe.
export function resolveRole(result, cachedRole) {
  if (result?.status === 'ok') return result.role
  if (result?.status === 'legacy') return 'ceo'
  return cachedRole || null
}

function check({ data, error }) {
  if (error) throw error
  return data
}

export async function listProfiles(client) {
  return check(await client.from('profiles').select(PROFILE_FIELDS).order('created_at', { ascending: true }))
}

// patch: { role }, { display_name } o { linked_team_id, linked_student_id[, display_name] }.
export async function updateProfile(client, id, patch) {
  return check(await client.from('profiles').update(patch).eq('id', id).select(PROFILE_FIELDS).single())
}

export function profileErrorText(error) {
  const message = String(error?.message || '')
  if (isMissingTable(error)) return 'Falta ejecutar en Supabase el SQL de la parte 1a (supabase/parte1a_cuentas_papeles.sql).'
  if (/propio papel/i.test(message)) return 'No puedes cambiar tu propio papel.'
  if (/fetch|network/i.test(message) || (typeof navigator !== 'undefined' && !navigator.onLine)) {
    return 'No se pudo conectar con el servidor. Inténtalo de nuevo.'
  }
  return message || 'No se pudo guardar.'
}

// ¿Puede la ceo cambiar el papel de esta cuenta? No el suyo (no puede quitarse el de ceo).
export function canChangeRole(profile, currentUserId) {
  return !!profile && profile.id !== currentUserId
}

// Personas a las que se puede unir una cuenta: el Equipo (contactos con perfil de equipo) y los
// alumnos. [{ kind: 'team' | 'student', id, label, detail }]
export function linkOptions(contacts = [], students = []) {
  const team = contacts
    .filter(isTeamMember)
    .map((c) => ({
      kind: 'team',
      id: c.id,
      label: c.name || c.email || 'Sin nombre',
      detail: c.teamProfile.status === 'former' ? 'Equipo · antiguo miembro' : 'Equipo',
    }))
  const alumnos = students.map((s) => ({ kind: 'student', id: s.id, label: s.name || 'Sin nombre', detail: 'Alumno' }))
  const byName = (a, b) => a.label.localeCompare(b.label, 'es', { sensitivity: 'base' })
  return [...team.sort(byName), ...alumnos.sort(byName)]
}

export function filterLinkOptions(options, query) {
  const q = normalizeName(query)
  if (!q) return options
  return options.filter((o) => normalizeName(o.label).includes(q))
}

// Persona a la que está unida la cuenta: la opción, { missing: true } si ya no existe, o null.
export function linkedOption(profile, options) {
  const kind = profile?.linked_team_id ? 'team' : profile?.linked_student_id ? 'student' : null
  if (!kind) return null
  const id = kind === 'team' ? profile.linked_team_id : profile.linked_student_id
  return options.find((o) => o.kind === kind && o.id === id) || { kind, id, missing: true }
}

// Cambios para unir la cuenta a `option` (o a nadie con null): a una sola persona a la vez. Si la
// cuenta no tiene nombre, toma el de esa persona.
export function linkPatch(option, profile = null) {
  const patch = {
    linked_team_id: option?.kind === 'team' ? option.id : null,
    linked_student_id: option?.kind === 'student' ? option.id : null,
  }
  if (option && !option.missing && profile && !normalizeDisplayName(profile.display_name)) {
    patch.display_name = normalizeDisplayName(option.label)
  }
  return patch
}

export const DISPLAY_NAME_MAX = 120

// Nombre tal como se guarda: sin espacios de más y como mucho DISPLAY_NAME_MAX caracteres.
export function normalizeDisplayName(name) {
  return (name || '').replace(/\s+/g, ' ').trim().slice(0, DISPLAY_NAME_MAX)
}
