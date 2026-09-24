import { beforeEach, describe, expect, it } from 'vitest'
import { DEFAULT_DEPARTMENTS, resetDepartments } from './departments'
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
    expect(plan.list).toEqual([...DEFAULT_DEPARTMENTS, 'Doblaje'])
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

    expect(runPendingMigrations()).toContain(MIGRATIONS.departments2026)
    expect(getTeamAreas()).toEqual([...DEFAULT_DEPARTMENTS, 'Doblaje'])
    expect(getAllContacts().map((c) => c.teamProfile.area)).toEqual(['Directivo', 'Doblaje'])
    expect(getAllVacancies()[0].area).toBe('Profesores')
    expect(isMigrationDone(MIGRATIONS.departments2026)).toBe(true)
    expect(SETTINGS.some((s) => s.key === MIGRATIONS_KEY)).toBe(true)

    // Si luego vuelvo a añadir un departamento, no se vuelve a migrar.
    localStorage.setItem('cesi_team_areas_v1', JSON.stringify([...DEFAULT_DEPARTMENTS, 'Doblaje', 'Producción']))
    expect(runPendingMigrations()).not.toContain(MIGRATIONS.departments2026)
    expect(getTeamAreas().at(-1)).toBe('Producción')
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
    expect(getAllVacancies()[0].area).toBe('Marketing')
  })
})
