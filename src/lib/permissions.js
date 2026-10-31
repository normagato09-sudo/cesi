// Áreas y permisos del equipo (tablas areas, area_permissions y profile_permissions, ver
// supabase/schema.sql). Cada persona de equipo tiene un área con permisos por defecto por
// pantalla; los suyos propios sustituyen a los del área en las pantallas que la ceo cambie.

export const SCREENS = [
  { id: 'calendario', label: 'Calendario' },
  { id: 'contactos', label: 'Contactos' },
  { id: 'huecos', label: 'Buscar hueco' },
  { id: 'equipo', label: 'Personas' },
  { id: 'vacantes', label: 'Vacantes' },
  { id: 'fichajes', label: 'Fichajes' },
  { id: 'cursos', label: 'Cursos' },
  { id: 'alumnos', label: 'Alumnos' },
  { id: 'asistencia', label: 'Asistencia' },
]

export const LEVELS = ['none', 'read', 'write']

export const LEVEL_LABELS = { none: 'Ninguno', read: 'Ver', write: 'Editar' }

// Las de supabase/parte5_areas.sql, en orden (la tabla areas manda; esto es por si no se puede leer).
export const AREAS = [
  { id: 'direccion', name: 'Directivo' },
  { id: 'formacion', name: 'Profesor' },
  { id: 'alianzas', name: 'Alianzas' },
  { id: 'personas', name: 'RRHH' },
  { id: 'finanzas', name: 'Finanzas' },
  { id: 'legal', name: 'Legal' },
  { id: 'media', name: 'Media' },
  { id: 'tecnico', name: 'Técnico' },
  { id: 'ciberseguridad', name: 'Ciberseguridad' },
  { id: 'moderacion', name: 'Moderación' },
]

export function areaName(areaId, areas = AREAS) {
  return areas.find((a) => a.id === areaId)?.name || ''
}

function validLevel(level) {
  return LEVELS.includes(level) ? level : 'none'
}

// { pantalla: nivel } con todas las pantallas (lo que falte, none).
export function normalizeLevels(raw) {
  const out = {}
  for (const { id } of SCREENS) out[id] = validLevel(raw?.[id])
  return out
}

// ¿Llega `level` a `need`? (read: ver; write: editar, que incluye ver)
export function allows(level, need = 'read') {
  return LEVELS.indexOf(validLevel(level)) >= LEVELS.indexOf(need)
}

// Permisos de una persona: los de su área y, encima, los suyos.
// areaRows: [{ area, screen, level }]; overrideRows: [{ profile_id, screen, level }] (solo los suyos).
// { pantalla: { level, areaLevel, overridden } }
export function effectivePermissions(area, areaRows = [], overrideRows = []) {
  const out = {}
  for (const { id } of SCREENS) {
    const areaLevel = validLevel(areaRows.find((r) => r.area === area && r.screen === id)?.level)
    const own = overrideRows.find((r) => r.screen === id)
    out[id] = { level: own ? validLevel(own.level) : areaLevel, areaLevel, overridden: !!own }
  }
  return out
}

export function hasOverrides(overrideRows = []) {
  return overrideRows.length > 0
}

// Supabase ------------------------------------------------------------------

function check({ data, error }) {
  if (error) throw error
  return data
}

// Permisos de la cuenta actual ({ pantalla: nivel }).
export async function fetchMyPermissions(client) {
  return normalizeLevels(check(await client.rpc('my_permissions')))
}

export async function listAreas(client) {
  return check(await client.from('areas').select('id, name, sort').order('sort'))
}

export async function listAreaPermissions(client) {
  return check(await client.from('area_permissions').select('area, screen, level'))
}

export async function listProfilePermissions(client) {
  return check(await client.from('profile_permissions').select('profile_id, screen, level'))
}

export async function setProfilePermission(client, profileId, screen, level) {
  return check(
    await client
      .from('profile_permissions')
      .upsert({ profile_id: profileId, screen, level }, { onConflict: 'profile_id,screen' })
      .select('profile_id, screen, level')
      .single(),
  )
}

// «Volver a los del área»: quita los permisos propios de la persona.
export async function resetProfilePermissions(client, profileId) {
  check(await client.from('profile_permissions').delete().eq('profile_id', profileId))
}
