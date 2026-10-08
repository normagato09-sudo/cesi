import { describe, expect, it } from 'vitest'
import { expandEvents } from './recurrence'
import {
  ME,
  assigneeName,
  assigneesOf,
  filterTasks,
  isOverdue,
  pendingTasksOf,
  pendingForMeeting,
  sourceOccurrence,
  sourceOf,
  taskData,
  taskOfDecision,
  taskSourcePatches,
  tasksOfSession,
  validateTask,
} from './tasks'

const d = (day, hh, mm = 0) => new Date(2026, 8, day, hh, mm)

const weekly = {
  id: 'w',
  title: 'Seguimiento',
  start: d(1, 10).toISOString(),
  end: d(1, 11).toISOString(),
  participantIds: ['ana'],
  recurrence: { freq: 'weekly', until: d(30, 0).toISOString() },
}
const single = { id: 's', title: 'Kickoff', start: d(3, 9).toISOString(), end: d(3, 10).toISOString(), participantIds: ['luis'], recurrence: null }

function occurrenceOn(series, day) {
  return expandEvents([series], d(day, 0), d(day + 1, 0))[0]
}

let n = 0
const task = (fields) => ({ id: `t${++n}`, title: 'Tarea', assignee: ME, dueDate: null, status: 'pending', source: null, createdAt: `2026-09-0${n % 9}`, ...fields })

describe('crear tareas', () => {
  it('valida el título y la fecha', () => {
    expect(validateTask({ title: '  ' })).toBe('Escribe qué hay que hacer.')
    expect(validateTask({ title: 'Enviar', dueDate: '3/10' })).toBe('La fecha límite no es válida.')
    expect(validateTask({ title: 'Enviar', dueDate: '2026-10-03' })).toBeNull()
  })

  it('limpia los datos y anota cuándo se hizo', () => {
    const data = taskData({ title: '  Enviar   presupuesto ', assignee: 'ana', dueDate: '', status: 'done' })
    expect(data).toMatchObject({ title: 'Enviar presupuesto', assignee: 'ana', dueDate: null, status: 'done', source: null, decisionId: null })
    expect(data.doneAt).toBeTruthy()
    expect(taskData({ title: 'x', status: 'done' }, { doneAt: 'antes' }).doneAt).toBe('antes')
    expect(taskData({ title: 'x' }).doneAt).toBeNull()
  })

  it('desde el acta enlaza la reunión y, si se repite, la sesión', () => {
    expect(sourceOf(occurrenceOn(single, 3))).toEqual({ eventId: 's', sessionKey: null, title: 'Kickoff', start: single.start })
    expect(sourceOf(occurrenceOn(weekly, 8))).toMatchObject({ eventId: 'w', sessionKey: '2026-09-08', title: 'Seguimiento' })
  })
})

describe('tareas de una sesión y de una decisión', () => {
  it('cada sesión de una serie tiene las suyas', () => {
    const a = task({ source: sourceOf(occurrenceOn(weekly, 1)) })
    const b = task({ source: sourceOf(occurrenceOn(weekly, 8)) })
    const loose = task({})
    expect(tasksOfSession([a, b, loose], occurrenceOn(weekly, 8))).toEqual([b])
    expect(tasksOfSession([a, b, loose], occurrenceOn(weekly, 15))).toEqual([])
  })

  it('una decisión convertida enlaza con su tarea', () => {
    const t = task({ decisionId: 'dec1' })
    expect(taskOfDecision([t], 'dec1')).toBe(t)
    expect(taskOfDecision([t], 'otra')).toBeNull()
  })
})

describe('filtros y vencidas', () => {
  const today = '2026-10-03'
  const overdue = task({ title: 'Vencida', dueDate: '2026-10-01', assignee: 'ana' })
  const todayTask = task({ title: 'Hoy', dueDate: today })
  const nextWeek = task({ title: 'Semana', dueDate: '2026-10-09' })
  const later = task({ title: 'Luego', dueDate: '2026-10-20' })
  const noDate = task({ title: 'Sin fecha' })
  const done = task({ title: 'Hecha', status: 'done', dueDate: '2026-09-01' })
  const all = [later, noDate, done, nextWeek, todayTask, overdue]

  it('marca como vencidas solo las pendientes con la fecha pasada', () => {
    expect(isOverdue(overdue, today)).toBe(true)
    expect(isOverdue(todayTask, today)).toBe(false)
    expect(isOverdue(done, today)).toBe(false)
    expect(isOverdue(noDate, today)).toBe(false)
  })

  it('por defecto, las pendientes por fecha límite y las que no tienen al final', () => {
    expect(filterTasks(all, { assignee: 'all', status: 'pending', due: 'all' }, today).map((t) => t.title)).toEqual([
      'Vencida',
      'Hoy',
      'Semana',
      'Luego',
      'Sin fecha',
    ])
  })

  it('filtra por persona, estado y fecha', () => {
    const titles = (f) => filterTasks(all, { ...{ assignee: 'all', status: 'all', due: 'all' }, ...f }, today).map((t) => t.title)
    expect(titles({ assignee: 'ana' })).toEqual(['Vencida'])
    expect(titles({ assignee: ME, status: 'done' })).toEqual(['Hecha'])
    expect(titles({ due: 'overdue' })).toEqual(['Vencida'])
    expect(titles({ due: 'today' })).toEqual(['Hoy'])
    expect(titles({ due: 'week' })).toEqual(['Hoy', 'Semana'])
    expect(titles({ due: 'none' })).toEqual(['Sin fecha'])
  })

  it('nombres de los responsables', () => {
    const contacts = [{ id: 'ana', name: 'Ana' }]
    expect(assigneeName(task({}), contacts)).toBe('Yo')
    expect(assigneeName(task({ assignee: 'ana' }), contacts)).toBe('Ana')
    expect(assigneeName(task({ assignee: 'x' }), contacts)).toBe('Contacto borrado')
    expect(assigneesOf([task({ assignee: 'ana' }), task({}), task({ assignee: 'ana' })], contacts)).toEqual([{ id: 'ana', name: 'Ana' }])
  })
})

describe('al abrir una reunión: tareas pendientes de esas personas', () => {
  const rawEvents = [weekly, single]
  const thisSession = occurrenceOn(weekly, 15)

  it('las de los participantes y las mías de reuniones anteriores con ellos', () => {
    const anaTask = task({ title: 'De Ana', assignee: 'ana' })
    const mineFromBefore = task({ title: 'Mía de antes', source: sourceOf(occurrenceOn(weekly, 8)) })
    const mineFromOtherPeople = task({ title: 'Con Luis', source: sourceOf(occurrenceOn(single, 3)) })
    const mineFromThisSession = task({ title: 'De hoy', source: sourceOf(thisSession) })
    const luisTask = task({ title: 'De Luis', assignee: 'luis' })
    const anaDone = task({ title: 'Hecha', assignee: 'ana', status: 'done' })
    const mineLater = task({ title: 'Posterior', source: sourceOf(occurrenceOn(weekly, 22)) })
    const loose = task({ title: 'Suelta' })
    const result = pendingForMeeting(
      [anaTask, mineFromBefore, mineFromOtherPeople, mineFromThisSession, luisTask, anaDone, mineLater, loose],
      thisSession,
      rawEvents,
    )
    expect(result.map((t) => t.title).sort()).toEqual(['De Ana', 'Mía de antes'])
  })

  it('usa los participantes que tuvo ese día si cambiaron solo en esa sesión', () => {
    const series = { ...weekly, exceptions: { '2026-09-08': { participantIds: ['luis'] } } }
    const mine = task({ source: sourceOf(occurrenceOn(series, 8)) })
    expect(pendingForMeeting([mine], occurrenceOn(series, 15), [series])).toEqual([])
  })

  it('sin participantes no muestra nada', () => {
    expect(pendingForMeeting([task({ assignee: 'ana' })], occurrenceOn({ ...single, participantIds: [] }, 3), rawEvents)).toEqual([])
  })
})

describe('enlace a la reunión de la que sale', () => {
  it('encuentra la sesión, también si ese día se movió', () => {
    const series = { ...weekly, exceptions: { '2026-09-08': { start: d(9, 12).toISOString(), end: d(9, 13).toISOString() } } }
    const occ = sourceOccurrence(task({ source: { eventId: 'w', sessionKey: '2026-09-08' } }), [series])
    expect(new Date(occ.start)).toEqual(d(9, 12))
    expect(sourceOccurrence(task({ source: { eventId: 's', sessionKey: null } }), [single]).id).toBe('s')
  })

  it('null si la reunión se borró o ese día se canceló', () => {
    const series = { ...weekly, exceptions: { '2026-09-08': { cancelled: true } } }
    expect(sourceOccurrence(task({ source: { eventId: 'w', sessionKey: '2026-09-08' } }), [series])).toBeNull()
    expect(sourceOccurrence(task({ source: { eventId: 'borrada', sessionKey: null } }), [series])).toBeNull()
    expect(sourceOccurrence(task({}), [series])).toBeNull()
  })
})

describe('las tareas siguen a su sesión cuando cambia la reunión', () => {
  const src = (eventId, sessionKey) => ({ eventId, sessionKey, title: 'x', start: d(1, 10).toISOString() })
  const t1 = task({ source: src('w', '2026-09-01') })
  const t8 = task({ source: src('w', '2026-09-08') })
  const t15 = task({ source: src('w', '2026-09-15') })
  const other = task({ source: src('otra', '2026-09-15') })
  const all = [t1, t8, t15, other]

  it('mover toda la serie de día', () => {
    expect(taskSourcePatches(all, { kind: 'shift', eventId: 'w', dayDelta: 1 })).toEqual([
      { id: t1.id, patch: { source: src('w', '2026-09-02') } },
      { id: t8.id, patch: { source: src('w', '2026-09-09') } },
      { id: t15.id, patch: { source: src('w', '2026-09-16') } },
    ])
    expect(taskSourcePatches(all, { kind: 'shift', eventId: 'w', dayDelta: 0 })).toEqual([])
  })

  it('"este y los siguientes": las sesiones desde ese día pasan a la serie nueva', () => {
    const patches = taskSourcePatches(all, { kind: 'split', eventId: 'w', key: '2026-09-08', newEventId: 'w2', dayDelta: 0, newIsSeries: true })
    expect(patches).toEqual([
      { id: t8.id, patch: { source: src('w2', '2026-09-08') } },
      { id: t15.id, patch: { source: src('w2', '2026-09-15') } },
    ])
    const toOne = taskSourcePatches([t8], { kind: 'split', eventId: 'w', key: '2026-09-08', newEventId: 'n', dayDelta: 0, newIsSeries: false })
    expect(toOne).toEqual([{ id: t8.id, patch: { source: src('n', null) } }])
  })

  it('una reunión que pasa a repetirse o deja de hacerlo', () => {
    const loose = task({ source: src('s', null) })
    expect(taskSourcePatches([loose], { kind: 'toSeries', eventId: 's', key: '2026-09-03' })).toEqual([
      { id: loose.id, patch: { source: src('s', '2026-09-03') } },
    ])
    expect(taskSourcePatches([t8], { kind: 'toSingle', eventId: 'w' })).toEqual([{ id: t8.id, patch: { source: src('w', null) } }])
  })
})

describe('pendingTasksOf', () => {
  it('solo las pendientes de esa persona, primero las que tienen fecha', () => {
    const tasks = [
      { id: '1', title: 'Sin fecha', assignee: 'ana', status: 'pending', createdAt: '2026-01-01' },
      { id: '2', title: 'Hecha', assignee: 'ana', status: 'done', dueDate: '2026-02-01' },
      { id: '3', title: 'Con fecha', assignee: 'ana', status: 'pending', dueDate: '2026-03-01' },
      { id: '4', title: 'De otro', assignee: 'luis', status: 'pending' },
      { id: '5', title: 'Mía', assignee: ME, status: 'pending' },
    ]
    expect(pendingTasksOf(tasks, 'ana').map((t) => t.id)).toEqual(['3', '1'])
  })
})
