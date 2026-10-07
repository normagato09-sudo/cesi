import { describe, expect, it } from 'vitest'
import {
  dueTasks,
  greeting,
  hasAgenda,
  meetingsTodayAndTomorrow,
  openVacancies,
  participantsLine,
  upcomingInterviews,
  vacancyProgressText,
} from './home'

const d = (day, hh, mm = 0) => new Date(2026, 9, day, hh, mm)
const now = d(4, 9, 30)

const meeting = (id, day, hh, fields = {}) => ({
  id,
  title: id,
  start: d(day, hh).toISOString(),
  end: d(day, hh + 1).toISOString(),
  recurrence: null,
  ...fields,
})

describe('saludo', () => {
  it('cambia con la hora del día', () => {
    expect(greeting(d(4, 8))).toBe('Buenos días')
    expect(greeting(d(4, 16))).toBe('Buenas tardes')
    expect(greeting(d(4, 22))).toBe('Buenas noches')
    expect(greeting(d(4, 2))).toBe('Buenas noches')
  })
})

describe('reuniones de hoy y de mañana', () => {
  const weekly = meeting('Seguimiento', 1, 12, {
    recurrence: { freq: 'daily', until: d(30, 0).toISOString() },
    agendaByDate: { '2026-10-05': [{ id: 'a1', text: 'Presupuesto', done: false }] },
  })
  const rawEvents = [
    meeting('Tarde', 4, 17),
    meeting('Temprano', 4, 8, { agenda: [{ id: 'a', text: 'Punto', done: false }] }),
    meeting('Mañana', 5, 9),
    meeting('Pasado', 6, 9),
    meeting('Ayer', 3, 9),
    meeting('No disponible', 4, 13, { isUnavailable: true }),
    meeting('Provisional', 4, 15, { provisional: true }),
    weekly,
  ]

  it('ordenadas por hora, sin franjas "No disponible" ni opciones provisionales', () => {
    const { today, tomorrow } = meetingsTodayAndTomorrow(rawEvents, now)
    expect(today.map((e) => e.title)).toEqual(['Temprano', 'Seguimiento', 'Tarde'])
    expect(tomorrow.map((e) => e.title)).toEqual(['Mañana', 'Seguimiento'])
  })

  it('sabe si tienen agenda preparada (también cada sesión de una serie)', () => {
    const { today, tomorrow } = meetingsTodayAndTomorrow(rawEvents, now)
    expect(today.map(hasAgenda)).toEqual([true, false, false])
    expect(tomorrow.map(hasAgenda)).toEqual([false, true])
  })

  it('participantes en una línea', () => {
    const contacts = ['Ana López', 'Luis', 'Marta', 'Pablo'].map((name, i) => ({ id: `c${i}`, name }))
    const ev = { participantIds: ['c0', 'c1'], guests: ['eva@x.com'] }
    expect(participantsLine(ev, contacts)).toBe('Ana, Luis, eva@x.com')
    expect(participantsLine({ participantIds: ['c0', 'c1', 'c2', 'c3'], guests: ['eva@x.com'] }, contacts)).toBe('Ana, Luis, Marta y 2 más')
    expect(participantsLine({ participantIds: [], guests: [] }, contacts)).toBe('')
  })
})

describe('tareas que vencen', () => {
  const task = (title, dueDate, status = 'pending') => ({ id: title, title, dueDate, status, assignee: 'me' })
  const tasks = [
    task('Vencida', '2026-10-01'),
    task('Hoy', '2026-10-04'),
    task('En 3 días', '2026-10-07'),
    task('En 7 días', '2026-10-11'),
    task('En 8 días', '2026-10-12'),
    task('Sin fecha', null),
    task('Hecha y vencida', '2026-10-01', 'done'),
  ]

  it('vencidas, para hoy y para los próximos 7 días; solo las pendientes', () => {
    const due = dueTasks(tasks, '2026-10-04')
    expect(due.overdue.map((t) => t.title)).toEqual(['Vencida'])
    expect(due.today.map((t) => t.title)).toEqual(['Hoy'])
    expect(due.upcoming.map((t) => t.title)).toEqual(['En 3 días', 'En 7 días'])
  })
})

describe('entrevistas y vacantes', () => {
  it('entrevistas de los próximos 14 días que aún no han terminado', () => {
    const rawEvents = [
      meeting('Marcada', 6, 10, { interview: true }),
      meeting('Antigua por categoría', 6, 12, { category: 'Entrevista' }),
      meeting('Antigua por etiqueta', 5, 10, { tags: ['entrevista'] }),
      meeting('Desmarcada', 5, 9, { category: 'Entrevista', interview: false }),
      meeting('En curso', 4, 9, { interview: true }),
      meeting('Ya pasó', 3, 10, { interview: true }),
      meeting('Muy lejos', 30, 10, { interview: true }),
      meeting('Otra reunión', 5, 11),
      meeting('Provisional', 5, 12, { interview: true, provisional: true }),
    ]
    expect(upcomingInterviews(rawEvents, now).map((e) => e.title)).toEqual(['En curso', 'Antigua por etiqueta', 'Marcada', 'Antigua por categoría'])
  })

  it('vacantes sin cubrir con sus candidatos nuevos y en entrevista', () => {
    const vacancies = [
      { id: 'v1', title: 'Locutor/a', status: 'open' },
      { id: 'v2', title: 'Técnico/a', status: 'in_progress' },
      { id: 'v3', title: 'Cubierta', status: 'filled' },
    ]
    const contacts = [
      { id: 'a', name: 'Ana', candidacies: [{ id: 'c1', vacancyId: 'v1', status: 'new' }, { id: 'c2', vacancyId: 'v2', status: 'interview' }] },
      { id: 'b', name: 'Luis', candidacies: [{ id: 'c3', vacancyId: 'v1', status: 'new' }] },
      { id: 'c', name: 'Eva', candidacies: [{ id: 'c4', vacancyId: 'v1', status: 'discarded' }] },
    ]
    const open = openVacancies(vacancies, contacts)
    expect(open.map((o) => [o.vacancy.id, o.newCount, o.interviewCount])).toEqual([
      ['v1', 2, 0],
      ['v2', 0, 1],
    ])
    expect(vacancyProgressText(open[0])).toBe('2 nuevos')
    expect(vacancyProgressText({ newCount: 1, interviewCount: 1 })).toBe('1 nuevo · 1 en entrevista')
    expect(vacancyProgressText({ newCount: 0, interviewCount: 0 })).toBe('Sin candidatos en curso')
  })
})
