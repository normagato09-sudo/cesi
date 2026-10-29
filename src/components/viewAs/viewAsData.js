// «Ver como» (solo la ceo, temporal): qué se puede elegir y con qué datos se enseña cada papel.
// Todo se lee una vez al abrir el selector; las pantallas de vista previa no reciben el cliente de
// Supabase, así que no pueden escribir nada.
import { listProfiles } from '../../lib/profiles'
import { AREAS, effectivePermissions, listAreaPermissions, listAreas, listProfilePermissions } from '../../lib/permissions'
import { listPortalsByAccount, toggleHour, emptyHours, weekFromHours } from '../../lib/studentPortal'

// Alumno inventado para cuando no hay ninguno con cuenta unida.
export function exampleStudent() {
  let hours = emptyHours()
  for (const day of [1, 2, 3, 4, 5]) for (const h of [17, 18, 19]) hours = toggleHour(hours, day, h, true)
  for (const h of [10, 11, 12]) hours = toggleHour(hours, 6, h, true)
  return {
    example: true,
    label: 'Lucía Martínez',
    account: { display_name: 'Lucía Martínez', email: 'lucia@ejemplo.com', auth_provider: 'email' },
    profile: {
      id: 'ejemplo',
      full_name: 'Lucía Martínez',
      discord: 'lucia_m',
      country: 'MX',
      time_zone: 'America/Mexico_City',
      birthday: '03-14',
      availability: weekFromHours(hours),
      completed_at: '2026-01-01T00:00:00Z',
    },
  }
}

// { students: [{ id, label, detail, account, profile }], members: [{ id, label, detail, area, levels }],
//   areas: [{ id, name, levels }], permsError: bool }
export async function loadViewAsOptions(client) {
  const [profiles, portals, areas, areaRows, overrides] = await Promise.allSettled([
    listProfiles(client),
    listPortalsByAccount(client),
    listAreas(client),
    listAreaPermissions(client),
    listProfilePermissions(client),
  ])
  if (profiles.status !== 'fulfilled') throw profiles.reason
  const list = profiles.value
  const portalMap = portals.status === 'fulfilled' ? portals.value : new Map()
  const permsOk = areas.status === 'fulfilled' && areaRows.status === 'fulfilled' && overrides.status === 'fulfilled'
  const areaList = permsOk && areas.value.length > 0 ? areas.value : AREAS
  const rows = permsOk ? areaRows.value : []
  const own = permsOk ? overrides.value : []
  const levelsOf = (area, profileId = null) => {
    const perms = effectivePermissions(area, rows, own.filter((o) => o.profile_id === profileId))
    return Object.fromEntries(Object.entries(perms).map(([screen, p]) => [screen, p.level]))
  }
  const areaName = (id) => areaList.find((a) => a.id === id)?.name || ''

  const students = list
    .filter((p) => p.role === 'alumno' && p.linked_student_id)
    .map((p) => {
      const profile = portalMap.get(p.id) || null
      return {
        id: p.id,
        label: profile?.full_name || p.display_name || p.email,
        detail: profile?.completed_at ? p.email : `${p.email} · sin completar el perfil`,
        account: p,
        profile,
      }
    })

  const members = list
    .filter((p) => p.role === 'equipo')
    .map((p) => ({
      id: p.id,
      label: p.display_name || p.email,
      detail: p.area ? areaName(p.area) : 'Sin área',
      email: p.email,
      name: p.display_name || '',
      area: p.area || null,
      levels: levelsOf(p.area || null, p.id),
    }))

  return {
    students,
    members,
    areas: areaList.map((a) => ({ id: a.id, name: a.name, levels: levelsOf(a.id) })),
    permsError: !permsOk,
  }
}
