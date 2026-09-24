import { beforeEach, describe, expect, it } from 'vitest'
import {
  NO_PROJECT,
  activeProjects,
  getAllProjects,
  meetingCountByProject,
  projectOf,
  projectOptions,
  projectsStore,
  unlinkProject,
  validateProjectName,
} from './projects'
import { filterEvents, filterLabel, isFilterActive } from './calendarFilter'
import { computeWeeklyReport } from './weeklyReport'
import { buildBackup, parseBackup, restoreBackup } from './backup'

const projects = [
  { id: 'doblaje', name: 'Curso de doblaje', color: '#2563eb', status: 'active' },
  { id: 'radio', name: 'Programa de radio', color: '#16a34a', status: 'active' },
  { id: 'viejo', name: 'Gira 2025', color: '#6b7280', status: 'archived' },
]

beforeEach(() => localStorage.clear())

describe('proyectos', () => {
  it('valida el nombre sin distinguir mayúsculas ni tildes', () => {
    expect(validateProjectName('  ', projects)).toMatch(/Escribe/)
    expect(validateProjectName('curso de DOBLAJE', projects)).toMatch(/Ya tienes/)
    expect(validateProjectName('Curso de doblaje', projects, 'doblaje')).toBeNull()
  })

  it('el selector ofrece los activos y el archivado que ya tuviera la reunión', () => {
    expect(activeProjects(projects).map((p) => p.id)).toEqual(['doblaje', 'radio'])
    expect(projectOptions(projects).map((p) => p.id)).toEqual(['doblaje', 'radio'])
    expect(projectOptions(projects, 'viejo').map((p) => p.id)).toEqual(['doblaje', 'radio', 'viejo'])
  })

  it('un proyecto borrado deja la reunión sin proyecto', () => {
    expect(projectOf({ projectId: 'radio' }, projects).name).toBe('Programa de radio')
    expect(projectOf({ projectId: 'borrado' }, projects)).toBeNull()
    expect(projectOf({}, projects)).toBeNull()
  })

  it('al borrar un proyecto se desvinculan sus reuniones y propuestas (no se borran)', () => {
    const events = [
      { id: 'e1', projectId: 'radio' },
      { id: 'e2', projectId: 'doblaje' },
      { id: 'e3', projectId: 'radio', isUnavailable: false },
    ]
    const proposals = [{ id: 'p1', projectId: 'radio' }, { id: 'p2' }]
    expect(unlinkProject('radio', events, proposals)).toEqual({ eventIds: ['e1', 'e3'], proposalIds: ['p1'] })
    expect(meetingCountByProject(events)).toEqual({ radio: 2, doblaje: 1 })
  })

  it('se crean activos por defecto y van en la copia de seguridad', () => {
    projectsStore.create({ name: 'Curso de doblaje', color: '#2563eb' })
    expect(getAllProjects()[0].status).toBe('active')
    const backup = buildBackup()
    expect(backup.projects).toHaveLength(1)
    localStorage.clear()
    restoreBackup(parseBackup(JSON.stringify(backup)))
    expect(getAllProjects()[0].name).toBe('Curso de doblaje')
    restoreBackup(parseBackup(JSON.stringify({ app: 'cesi', version: 8, events: [], contacts: [] })))
    expect(getAllProjects()).toEqual([])
  })
})

describe('filtro combinado del calendario', () => {
  const events = [
    { id: 1, category: 'Cliente', tags: ['Entrevista'], projectId: 'doblaje' },
    { id: 2, category: 'Cliente', tags: [], projectId: 'radio' },
    { id: 3, category: 'Reunión', tags: ['entrevista'], projectId: 'doblaje' },
    { id: 4, category: 'Reunión', tags: ['entrevista'] },
    { id: 5, category: 'No disponible', tags: [], isUnavailable: true },
  ]
  const ids = (filter) => filterEvents(events, { category: null, tag: null, project: null, ...filter }).map((e) => e.id)

  it('filtra por proyecto y por "Sin proyecto"', () => {
    expect(isFilterActive({ category: null, tag: null, project: 'radio' })).toBe(true)
    expect(ids({ project: 'doblaje' })).toEqual([1, 3, 5])
    expect(ids({ project: NO_PROJECT })).toEqual([4, 5])
  })

  it('combina proyecto con categoría y etiqueta', () => {
    expect(ids({ project: 'doblaje', category: 'Cliente' })).toEqual([1, 5])
    expect(ids({ project: 'doblaje', tag: 'ENTREVISTA' })).toEqual([1, 3, 5])
    expect(ids({ project: 'doblaje', category: 'Reunión', tag: 'entrevista' })).toEqual([3, 5])
    expect(ids({ project: NO_PROJECT, tag: 'entrevista' })).toEqual([4, 5])
    expect(ids({ project: 'radio', tag: 'entrevista' })).toEqual([5])
  })

  it('describe el filtro con el nombre del proyecto', () => {
    expect(filterLabel({ category: 'Cliente', tag: 'entrevista', project: 'doblaje' }, projects)).toBe(
      'Cliente · #entrevista · Curso de doblaje',
    )
    expect(filterLabel({ category: null, tag: null, project: NO_PROJECT }, projects)).toBe('Sin proyecto')
  })
})

describe('reparto por proyecto del resumen semanal', () => {
  const H = 3600000
  const at = (day, h) => new Date(2026, 8, day, h).toISOString()
  const meeting = (id, day, from, to, extra = {}) => ({ id, title: id, category: 'Reunión', tags: [], start: at(day, from), end: at(day, to), recurrence: null, ...extra })
  const workingHours = [0, 1, 2, 3, 4, 5, 6].map((day) => ({ day, enabled: day >= 1 && day <= 5, slots: [{ start: '09:00', end: '18:00' }] }))

  it('suma las horas de cada proyecto y agrupa las demás en "Sin proyecto"', () => {
    const events = [
      meeting('a', 21, 9, 11, { projectId: 'doblaje' }),
      meeting('b', 22, 9, 10, { projectId: 'doblaje' }),
      meeting('c', 23, 9, 10, { projectId: 'radio' }),
      meeting('d', 24, 9, 10),
      meeting('e', 24, 11, 12, { projectId: 'borrado' }),
      meeting('f', 25, 9, 10, { projectId: 'radio', provisional: true, proposalId: 'p' }),
      meeting('g', 25, 11, 12, { projectId: 'radio', isUnavailable: true }),
    ]
    const report = computeWeeklyReport(events, { weekStart: new Date(2026, 8, 21), workingHours, projects })
    expect(report.byProject.map((r) => [r.label, r.count, r.ms / H, r.color])).toEqual([
      ['Curso de doblaje', 2, 3, '#2563eb'],
      ['Sin proyecto', 2, 2, null],
      ['Programa de radio', 1, 1, '#16a34a'],
    ])
  })
})
