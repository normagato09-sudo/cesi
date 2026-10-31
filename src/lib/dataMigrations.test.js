import { beforeEach, describe, expect, it } from 'vitest'
import { DEFAULT_DEPARTMENTS, DEPARTMENTS_2026, areasPlan, resetDepartments, unplacedMembers, unplacedVacancies } from './departments'
import { runPendingMigrations } from './dataMigrations'
import { MIGRATIONS, STORAGE_KEY as MIGRATIONS_KEY, isMigrationDone } from './migrations'
import { getAllContacts } from './contacts'
import { getAllVacancies } from './vacancies'
import { getTeamAreas } from './team'
import { parseBackup, restoreBackup } from './backup'
import { SETTINGS } from './sync/collections'

const member = (id, area) => ({ id, name: id, country: 'ES', timeZone: 'Europe/Madrid', teamProfile: { status: 'active', role: 'x', area, links: [] } })
const vacancy = (id, area) => ({ id, title: id, area, description: '', openedAt: '2026-09-01', status: 'open', hiredContactIds: [], erasedCandidates: [] })

// Lista guardada que no era exactamente la de ejemplo (por eso no se migró antes).
const OLD_LIST = ['Dirección', 'Profesorado', 'Doblaje', 'Radio', 'Redes', 'Coordinación', 'Producción']

beforeEach(() => localStorage.clear())

describe('migración de los departamentos', () => {
  it('deja la lista nueva y reasigna los antiguos en miembros y vacantes', () => {
    const contacts = [member('ana', 'Dirección'), member('luis', 'profesorado'), member('eva', 'Redes'), member('leo', 'Coordinación'), member('mar', 'Doblaje'), member('sol', 'Radio'), { id: 'x', name: 'x' }]
    const vacancies = [vacancy('v1', 'Redes'), vacancy('v2', 'Tecnico'), vacancy('v3', '')]
    const plan = resetDepartments(contacts, vacancies)
    expect(plan.list).toEqual([...DEPARTMENTS_2026, 'Doblaje'])
    expect(plan.contactPatches.map((p) => [p.id, p.patch.teamProfile.area])).toEqual([
      ['ana', 'Directivo'],
      ['luis', 'Profesores'],
      ['eva', 'Marketing'],
      ['leo', 'Directivo'],
    ])
    // "Tecnico" se escribe como en la lista.
    expect(plan.vacancyPatches).toEqual([
      { id: 'v1', patch: { area: 'Marketing' } },
      { id: 'v2', patch: { area: 'Técnico' } },
    ])
  })

  it('se ejecuta una sola vez, con una marca que sincroniza', () => {
    localStorage.setItem('cesi_team_areas_v1', JSON.stringify(OLD_LIST))
    localStorage.setItem('cesi_contacts_v1', JSON.stringify([member('ana', 'Dirección'), member('mar', 'Doblaje')]))
    localStorage.setItem('cesi_vacancies_v1', JSON.stringify([vacancy('v1', 'Profesorado')]))

    expect(runPendingMigrations()).toEqual([MIGRATIONS.departments2026, MIGRATIONS.formerToArchive2026, MIGRATIONS.areas2026])
    // Después de las dos: las áreas (Doblaje → Media, Profesores → Profesor).
    expect(getTeamAreas()).toEqual(DEFAULT_DEPARTMENTS)
    expect(getAllContacts().map((c) => c.teamProfile.area)).toEqual(['Directivo', 'Media'])
    expect(getAllVacancies()[0].area).toBe('Profesor')
    expect(isMigrationDone(MIGRATIONS.departments2026)).toBe(true)
    expect(isMigrationDone(MIGRATIONS.areas2026)).toBe(true)
    expect(SETTINGS.some((s) => s.key === MIGRATIONS_KEY)).toBe(true)

    // No se vuelven a ejecutar.
    expect(runPendingMigrations()).toEqual([])
  })

  it('una copia de seguridad antigua se importa ya migrada', () => {
    const old = {
      app: 'cesi',
      version: 11,
      events: [],
      contacts: [member('ana', 'Coordinación')],
      vacancies: [vacancy('v1', 'Redes')],
      teamAreas: OLD_LIST,
    }
    restoreBackup(parseBackup(JSON.stringify(old)))
    expect(getTeamAreas()).toEqual(DEFAULT_DEPARTMENTS)
    expect(getAllContacts()[0].teamProfile.area).toBe('Directivo')
    expect(getAllVacancies()[0].area).toBe('Media')
  })
})

describe('migración a las áreas', () => {
  it('pasa cada departamento a su área y guarda el nombre antiguo', () => {
    const contacts = [
      member('ana', 'Profesores'),
      member('luis', 'Reclutamiento'),
      member('eva', 'Eventos'),
      member('leo', 'Tienda'),
      member('sol', 'Verificación'),
      member('pep', 'Socios'),
      member('mar', 'Media'),
      member('fin', ''),
      { id: 'x', name: 'x' },
    ]
    const vacancies = [vacancy('v1', 'Radio'), vacancy('v2', 'Tienda'), vacancy('v3', 'Legal')]
    const plan = areasPlan(contacts, vacancies)
    expect(plan.list).toEqual(DEFAULT_DEPARTMENTS)
    expect(plan.contactPatches.map((p) => [p.id, p.patch.teamProfile.area, p.patch.teamProfile.legacyArea])).toEqual([
      ['ana', 'Profesor', 'Profesores'],
      ['luis', 'RRHH', 'Reclutamiento'],
      ['eva', 'Media', 'Eventos'],
      ['leo', '', 'Tienda'],
      ['sol', 'Moderación', 'Verificación'],
      ['pep', 'Alianzas', 'Socios'],
    ])
    expect(plan.vacancyPatches).toEqual([
      { id: 'v1', patch: { area: 'Media', legacyArea: 'Radio' } },
      { id: 'v2', patch: { area: '', legacyArea: 'Tienda' } },
    ])
  })

  it('pasa también los roles de la trayectoria y su posición en el departamento', () => {
    const c = member('ana', 'Radio')
    c.teamProfile.roles = [
      { id: 'r1', role: 'Locutora', area: 'Radio', start: null, end: null },
      { id: 'r2', role: 'Diseñadora', area: 'Media', start: null, end: null },
    ]
    c.teamProfile.order = { Radio: 3, Media: 1 }
    const [{ patch }] = areasPlan([c], []).contactPatches
    expect(patch.teamProfile.roles.map((r) => [r.area, r.legacyArea])).toEqual([
      ['Media', 'Radio'],
      ['Media', undefined],
    ])
    expect(patch.teamProfile.order).toEqual({ Media: 1 })
  })

  it('avisa de quién y qué vacantes han quedado en «Sin área»', () => {
    const plan = areasPlan([member('leo', 'Tienda'), member('ana', 'Legal')], [vacancy('v2', 'Tienda')])
    const leo = { ...member('leo', 'Tienda'), ...plan.contactPatches[0].patch }
    expect(unplacedMembers([leo, member('ana', 'Legal')])).toEqual([{ id: 'leo', name: 'leo', legacyArea: 'Tienda' }])
    expect(unplacedVacancies([{ ...vacancy('v2', 'Tienda'), ...plan.vacancyPatches[0].patch }])).toEqual([{ id: 'v2', title: 'v2', legacyArea: 'Tienda' }])
    // Al colocarlo en un área deja de salir.
    expect(unplacedMembers([{ ...leo, teamProfile: { ...leo.teamProfile, area: 'Media' } }])).toEqual([])
  })
})
