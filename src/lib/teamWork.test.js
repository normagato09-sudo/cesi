import { describe, expect, it } from 'vitest'
import {
  asSeenByMe,
  assigneesLabel,
  emptyTaskForm,
  formFromTask,
  missingText,
  myOpenTasks,
  progressText,
  entriesByDay,
  entryMinutes,
  filterTasks,
  formatMinutes,
  groupTasks,
  isBoss,
  isOverdue,
  openEntry,
  summarizeByPerson,
  validateTaskForm,
} from './teamWork'

const task = (id, extra = {}) => ({
  id,
  title: id,
  area: 'media',
  assignees: [],
  my_status: null,
  created_by: 'dir',
  due_date: null,
  priority: 'media',
  status: 'pendiente',
  ...extra,
})

describe('quién ve y gestiona todo', () => {
  it('la ceo y Directivo', () => {
    expect(isBoss({ role: 'ceo', area: null })).toBe(true)
    expect(isBoss({ role: 'equipo', area: 'direccion' })).toBe(true)
    expect(isBoss({ role: 'equipo', area: 'media' })).toBe(false)
  })
})

describe('tareas', () => {
  it('atrasada: con fecha límite pasada y sin hacer', () => {
    expect(isOverdue(task('a', { due_date: '2030-11-03' }), '2030-11-04')).toBe(true)
    expect(isOverdue(task('a', { due_date: '2030-11-04' }), '2030-11-04')).toBe(false)
    expect(isOverdue(task('a', { due_date: '2030-11-03', status: 'hecha' }), '2030-11-04')).toBe(false)
    expect(isOverdue(task('a'), '2030-11-04')).toBe(false)
  })

  it('filtros: mías, de mi área y todas', () => {
    const tasks = [task('asignada', { my_status: 'pendiente' }), task('creada', { created_by: 'yo', area: 'legal' }), task('area'), task('otra', { area: 'legal' })]
    const me = { id: 'yo', area: 'media' }
    expect(filterTasks(tasks, 'mine', me).map((t) => t.id)).toEqual(['asignada', 'creada'])
    expect(filterTasks(tasks, 'area', me).map((t) => t.id)).toEqual(['asignada', 'area'])
    expect(filterTasks(tasks, 'all', me)).toHaveLength(4)
    expect(filterTasks(tasks, 'area', { id: 'yo', area: null })).toEqual([])
  })

  it('agrupadas por estado, con las atrasadas primero', () => {
    const groups = groupTasks(
      [
        task('sin fecha'),
        task('luego', { due_date: '2030-12-01' }),
        task('atrasada', { due_date: '2030-11-01' }),
        task('alta', { due_date: '2030-12-01', priority: 'alta' }),
        task('hecha', { status: 'hecha' }),
      ],
      '2030-11-04',
    )
    expect(groups.map((g) => g.id)).toEqual(['pendiente', 'en_curso', 'hecha'])
    expect(groups[0].tasks.map((t) => t.id)).toEqual(['atrasada', 'alta', 'luego', 'sin fecha'])
    expect(groups[2].tasks.map((t) => t.id)).toEqual(['hecha'])
  })

  it('formulario: los que no son Directivo, en su área y para sí mismos', () => {
    expect(emptyTaskForm({ id: 'yo', area: 'media', boss: false })).toMatchObject({ area: 'media', mode: 'people', assignees: ['yo'] })
    expect(emptyTaskForm({ id: 'yo', area: 'direccion', boss: true })).toMatchObject({ assignees: [] })
    expect(validateTaskForm({ ...emptyTaskForm({ id: 'yo', area: '', boss: true }), title: ' ' })).toMatchObject({
      title: expect.any(String),
      area: expect.any(String),
    })
    expect(validateTaskForm({ ...emptyTaskForm({ id: 'yo', area: 'media', boss: true }), title: 'A', mode: 'area' })).toMatchObject({
      assignArea: expect.any(String),
    })
  })

  it('formulario de una tarea con varias personas o un área entera', () => {
    const people = [
      { id: 'ana', name: 'Ana', status: 'hecha', gone: false },
      { id: null, name: 'Eva (cuenta eliminada)', status: 'pendiente', gone: true },
      { id: 'luis', name: 'Luis', status: 'pendiente', gone: false },
    ]
    expect(formFromTask(task('a', { assignees: people }))).toMatchObject({ mode: 'people', assignees: ['ana', 'luis'], assignArea: '' })
    expect(formFromTask(task('a', { assignees: people, assigned_area: 'media' }))).toMatchObject({ mode: 'area', assignArea: 'media' })
  })

  it('a quién está asignada, el progreso y quién falta', () => {
    const p = (name) => ({ id: name, name, status: 'pendiente', gone: false })
    expect(assigneesLabel(task('a', { assignees: [] }))).toBe('Sin asignar')
    expect(assigneesLabel(task('a', { assignees: [p('Ana')] }))).toBe('Ana')
    expect(assigneesLabel(task('a', { assignees: [p('Ana'), p('Luis'), p('Eva')] }))).toBe('Ana, Luis y Eva')
    expect(assigneesLabel(task('a', { assignees: [p('Ana'), p('Luis'), p('Eva'), p('Iker')] }))).toBe('Ana, Luis y 2 más')
    expect(assigneesLabel(task('a', { assignees: [p('Ana')], assigned_area_name: 'Marketing' }))).toBe('Toda el área Marketing')
    expect(progressText(task('a', { done_count: 2, total_count: 5 }))).toBe('2 de 5 hechas')
    expect(progressText(task('a', { done_count: 0, total_count: 1 }))).toBe('')
    expect(missingText(task('a', { total_count: 3, missing_names: 'Ana, Luis' }))).toBe('Falta: Ana, Luis')
    expect(missingText(task('a', { total_count: 3, missing_names: '' }))).toBe('')
  })

  it('como la veo yo: con el estado de mi parte', () => {
    expect(asSeenByMe(task('a', { status: 'en_curso', my_status: 'hecha' }))).toMatchObject({ status: 'hecha', task_status: 'en_curso' })
    expect(asSeenByMe(task('a', { status: 'en_curso', my_status: null }))).toMatchObject({ status: 'en_curso', task_status: 'en_curso' })
  })

  it('mis tareas sin terminar, por fecha límite', () => {
    const rows = [
      task('sin fecha', { my_status: 'pendiente' }),
      task('hecha', { my_status: 'hecha', due_date: '2030-11-01' }),
      task('de otro', { due_date: '2030-11-01' }),
      task('pronto', { my_status: 'en_curso', due_date: '2030-11-02' }),
    ]
    expect(myOpenTasks(rows).map((t) => t.id)).toEqual(['pronto', 'sin fecha'])
  })
})

describe('fichaje', () => {
  const entry = (id, inAt, outAt, extra = {}) => ({ id, profile_id: 'p1', name: 'Ana', clock_in: inAt, clock_out: outAt, ...extra })

  it('minutos y formato', () => {
    expect(entryMinutes(entry('a', '2030-11-04T08:00:00Z', '2030-11-04T15:30:00Z'))).toBe(450)
    expect(entryMinutes(entry('a', '2030-11-04T08:00:00Z', null))).toBe(0)
    expect(formatMinutes(450)).toBe('7 h 30 min')
    expect(formatMinutes(120)).toBe('2 h')
    expect(formatMinutes(15)).toBe('15 min')
  })

  it('entrada abierta: sin salida y de las últimas 16 horas', () => {
    const now = new Date('2030-11-04T20:00:00Z')
    expect(openEntry([entry('a', '2030-11-04T08:00:00Z', null)], now)?.id).toBe('a')
    expect(openEntry([entry('a', '2030-11-03T08:00:00Z', null)], now)).toBeNull()
    expect(openEntry([entry('a', '2030-11-04T08:00:00Z', '2030-11-04T09:00:00Z')], now)).toBeNull()
  })

  it('resumen semanal por persona', () => {
    const rows = summarizeByPerson([
      entry('a', '2030-11-04T08:00:00Z', '2030-11-04T10:00:00Z'),
      entry('b', '2030-11-05T08:00:00Z', null),
      entry('c', '2030-11-05T08:00:00Z', '2030-11-05T09:00:00Z', { profile_id: 'p2', name: 'Bea' }),
    ])
    expect(rows).toEqual([
      { profileId: 'p1', name: 'Ana', minutes: 120, count: 2, open: 1 },
      { profileId: 'p2', name: 'Bea', minutes: 60, count: 1, open: 0 },
    ])
  })

  it('por día de la entrada, en la zona', () => {
    // 23:30 UTC del lunes es martes en Madrid.
    const byDay = entriesByDay([entry('a', '2030-11-04T23:30:00Z', null), entry('b', '2030-11-04T10:00:00Z', null)], 'Europe/Madrid')
    expect([...byDay.keys()]).toEqual(['2030-11-05', '2030-11-04'])
  })
})
