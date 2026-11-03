import { DIRECTION_ROLES, DIRECTION_ROLE_LABEL } from './profiles'
import { normalizeName } from './applications'

// Organigrama (OrgChartView.jsx): las cuentas de la ceo y del equipo (cesi_org_chart, parte 28)
// agrupadas por puesto y área. Jefes: el equipo directivo responde a la ceo; el Director, a las
// áreas (menos Profesor); el Coordinador, a los profesores.

// Las 8 áreas que dependen del Director, en 2 filas de 4, cada una con su color.
export const ORG_AREAS = [
  { id: 'alianzas', name: 'Alianzas', color: '#7c3aed' },
  { id: 'personas', name: 'RRHH', color: '#db2777' },
  { id: 'media', name: 'Media', color: '#ea580c' },
  { id: 'tecnico', name: 'Técnico', color: '#0891b2' },
  { id: 'finanzas', name: 'Finanzas', color: '#ca8a04' },
  { id: 'legal', name: 'Legal', color: '#4f46e5' },
  { id: 'ciberseguridad', name: 'Ciberseguridad', color: '#dc2626' },
  { id: 'moderacion', name: 'Moderación', color: '#0d9488' },
]

export const DIRECTIVO_AREA = 'direccion'
export const TEACHER_AREA = 'formacion'

// Fila de cesi_org_chart → persona del organigrama.
function personOf(row) {
  return {
    id: row.id,
    name: (row.name || '').trim() || 'Sin nombre',
    role: row.role,
    area: row.area || null,
    directionRole: row.area === DIRECTIVO_AREA ? row.direction_role || null : null,
    timeZone: row.time_zone || 'Europe/Madrid',
    memberSince: row.member_since || null,
    monthMinutes: row.month_minutes ?? null,
    linkedTeamId: row.linked_team_id || null,
  }
}

// Puesto que se ve en la tarjeta de una persona.
export function positionOf(person) {
  if (person.role === 'ceo') return 'CEO'
  if (person.area === DIRECTIVO_AREA) return DIRECTION_ROLE_LABEL[person.directionRole] || 'Directivo'
  if (person.area === TEACHER_AREA) return 'Profesor'
  return ORG_AREAS.find((a) => a.id === person.area)?.name || 'Sin área'
}

// ¿Coincide con la búsqueda (por nombre, sin acentos ni mayúsculas)?
export function matchesName(person, query) {
  const q = normalizeName(query || '')
  return !q || normalizeName(person.name).includes(q)
}

/**
 * Todo el organigrama: { ceo, board: [{ id, label, people }] (los 4 puestos en orden),
 * boardOther (de Directivo sin puesto), areas: [{ ...ORG_AREAS, people }], teachers, noArea,
 * people (todas, por id) }. query: solo las personas que coinciden (los puestos y las áreas
 * siguen saliendo, vacíos).
 */
export function buildOrgChart(rows, query = '') {
  const all = (rows || []).map(personOf)
  const shown = all.filter((p) => matchesName(p, query))
  const team = shown.filter((p) => p.role === 'equipo')
  const directivos = team.filter((p) => p.area === DIRECTIVO_AREA)
  return {
    ceo: all.find((p) => p.role === 'ceo') || null,
    board: DIRECTION_ROLES.map((r) => ({ id: r.id, label: r.label, people: directivos.filter((p) => p.directionRole === r.id) })),
    boardOther: directivos.filter((p) => !p.directionRole),
    areas: ORG_AREAS.map((a) => ({ ...a, people: team.filter((p) => p.area === a.id) })),
    teachers: team.filter((p) => p.area === TEACHER_AREA),
    noArea: team.filter((p) => !p.area || (p.area !== DIRECTIVO_AREA && p.area !== TEACHER_AREA && !ORG_AREAS.some((a) => a.id === p.area))),
    people: new Map(all.map((p) => [p.id, p])),
  }
}

// Nombres de quien tiene ese puesto de Directivo (vacío si nadie).
function holders(rows, directionRole) {
  return rows.filter((p) => p.role === 'equipo' && p.area === DIRECTIVO_AREA && p.directionRole === directionRole).map((p) => p.name)
}

/**
 * «Responde a» de una persona: el nombre de su jefe y su puesto («Ana López (Director/a)»), o el
 * puesto con «sin asignar». La ceo no responde a nadie (null).
 */
export function bossText(person, people) {
  if (!person || person.role === 'ceo') return null
  const all = [...people.values()]
  const named = (role) => {
    const names = holders(all, role)
    return names.length ? `${names.join(', ')} (${DIRECTION_ROLE_LABEL[role]})` : `${DIRECTION_ROLE_LABEL[role]} (sin asignar)`
  }
  if (person.area === DIRECTIVO_AREA) {
    const ceo = all.find((p) => p.role === 'ceo')
    return ceo ? `${ceo.name} (CEO)` : 'CEO'
  }
  if (person.area === TEACHER_AREA) return named('coordinador')
  if (!person.area) return 'Sin área todavía'
  return named('director')
}

// «Lleva 3 meses», «Lleva 1 año y 2 meses», «Lleva 5 días» (desde que es de equipo).
export function sinceText(iso, now = new Date()) {
  const from = iso ? new Date(iso) : null
  if (!from || Number.isNaN(from.getTime()) || from > now) return null
  let months = (now.getFullYear() - from.getFullYear()) * 12 + now.getMonth() - from.getMonth()
  if (now.getDate() < from.getDate()) months--
  if (months < 1) {
    const days = Math.max(1, Math.floor((now - from) / 86400000))
    return `Lleva ${days} ${days === 1 ? 'día' : 'días'}`
  }
  const years = Math.floor(months / 12)
  const rest = months % 12
  const y = years ? `${years} ${years === 1 ? 'año' : 'años'}` : ''
  const m = rest ? `${rest} ${rest === 1 ? 'mes' : 'meses'}` : ''
  return `Lleva ${[y, m].filter(Boolean).join(' y ')}`
}

export const listOrgChart = async (client) => {
  const { data, error } = await client.rpc('cesi_org_chart')
  if (error) throw error
  return data || []
}

export function orgChartErrorText(err) {
  if (err?.code === 'PGRST202' || err?.code === '42883') return 'Falta ejecutar en Supabase el SQL de la parte 28 (supabase/parte28_organigrama.sql).'
  return err?.message || 'No se pudo cargar el organigrama.'
}
