import { addDays, format, parseISO } from 'date-fns'
import { es } from 'date-fns/locale'
import { dateKey, expandEvent } from './recurrence'
import { createCollection } from './store'
import { sessionKeyOf } from './meetingSession'

// Tareas que salen de las reuniones (o sueltas). Tarea:
// {
//   id, title,
//   assignee: 'me' | id de contacto (responsable),
//   dueDate: 'AAAA-MM-DD' | null (fecha límite),
//   status: 'pending' | 'done', doneAt: ISO | null,
//   source: null (tarea suelta) o { eventId (la reunión o la serie), sessionKey: 'AAAA-MM-DD' (día
//     de la sesión, en una serie) | null, title, start (copia para mostrarla aunque se borre) },
//   decisionId: id de la decisión del acta de la que sale, o null,
//   createdAt, updatedAt
// }

export const STORAGE_KEY = 'cesi_tasks_v1'

export const tasksStore = createCollection(STORAGE_KEY, { prefix: 'task', defaults: { status: 'pending' } })

export const ME = 'me'
export const MAX_TITLE_LENGTH = 200

export const STATUS_FILTERS = [
  { id: 'pending', label: 'Pendientes' },
  { id: 'done', label: 'Hechas' },
  { id: 'all', label: 'Todas' },
]

export const DUE_FILTERS = [
  { id: 'all', label: 'Cualquier fecha' },
  { id: 'overdue', label: 'Vencidas' },
  { id: 'today', label: 'Para hoy' },
  { id: 'week', label: 'Próximos 7 días' },
  { id: 'none', label: 'Sin fecha' },
]

export const DEFAULT_FILTER = { assignee: 'all', status: 'pending', due: 'all' }

export function getAllTasks() {
  return tasksStore.getAll()
}

export function normalizeTaskTitle(title) {
  return (title || '').replace(/\s+/g, ' ').trim().slice(0, MAX_TITLE_LENGTH)
}

// Mensaje de error o null si la tarea se puede guardar.
export function validateTask({ title, dueDate }) {
  if (!normalizeTaskTitle(title)) return 'Escribe qué hay que hacer.'
  if (dueDate && !/^\d{4}-\d{2}-\d{2}$/.test(dueDate)) return 'La fecha límite no es válida.'
  return null
}

// Datos limpios de una tarea nueva o editada (sin id).
export function taskData({ title, assignee = ME, dueDate = null, status = 'pending', source = null, decisionId = null }, previous = null) {
  const done = status === 'done'
  return {
    title: normalizeTaskTitle(title),
    assignee: assignee || ME,
    dueDate: dueDate || null,
    status: done ? 'done' : 'pending',
    doneAt: done ? previous?.doneAt || new Date().toISOString() : null,
    source,
    decisionId: decisionId || null,
  }
}

// De qué reunión (y sesión, si se repite) sale una tarea creada desde su acta.
export function sourceOf(occurrence) {
  return {
    eventId: occurrence.seriesId || occurrence.id,
    sessionKey: occurrence.recurrence ? sessionKeyOf(occurrence) : null,
    title: occurrence.title || '',
    start: new Date(occurrence.start).toISOString(),
  }
}

// ¿La tarea sale de esa sesión concreta?
export function isFromSession(task, occurrence) {
  const s = task.source
  if (!s) return false
  const source = sourceOf(occurrence)
  return s.eventId === source.eventId && (s.sessionKey || null) === source.sessionKey
}

export function tasksOfSession(tasks, occurrence) {
  return sortTasks(tasks.filter((t) => isFromSession(t, occurrence)))
}

// Tarea creada a partir de esa decisión (si no se ha borrado).
export function taskOfDecision(tasks, decisionId) {
  return tasks.find((t) => t.decisionId && t.decisionId === decisionId) || null
}

export function formatDue(dueDate) {
  return format(parseISO(dueDate), 'd MMM yyyy', { locale: es })
}

// Texto del enlace a la reunión de la que sale: "Seguimiento · 8 sep".
export function sourceLabel(source) {
  const when = source.start ? ` · ${format(new Date(source.start), 'd MMM', { locale: es })}` : ''
  return `${source.title || 'Reunión'}${when}`
}

export function isOverdue(task, today) {
  return task.status !== 'done' && !!task.dueDate && task.dueDate < today
}

// Pendientes primero; luego por fecha límite (las que no tienen, al final) y por antigüedad.
export function sortTasks(tasks) {
  return [...tasks].sort((a, b) => {
    if ((a.status === 'done') !== (b.status === 'done')) return a.status === 'done' ? 1 : -1
    if ((a.dueDate || '') !== (b.dueDate || '')) {
      if (!a.dueDate) return 1
      if (!b.dueDate) return -1
      return a.dueDate < b.dueDate ? -1 : 1
    }
    return (a.createdAt || '').localeCompare(b.createdAt || '')
  })
}

// filter: { assignee: 'all' | 'me' | id de contacto, status: 'pending' | 'done' | 'all', due: ver DUE_FILTERS }.
export function filterTasks(tasks, filter, today) {
  const weekEnd = dateKey(addDays(parseISO(today), 6))
  return sortTasks(
    tasks.filter((t) => {
      if (filter.assignee !== 'all' && t.assignee !== filter.assignee) return false
      if (filter.status === 'pending' && t.status === 'done') return false
      if (filter.status === 'done' && t.status !== 'done') return false
      switch (filter.due) {
        case 'overdue':
          return isOverdue(t, today)
        case 'today':
          return t.dueDate === today
        case 'week':
          return !!t.dueDate && t.dueDate >= today && t.dueDate <= weekEnd
        case 'none':
          return !t.dueDate
        default:
          return true
      }
    }),
  )
}

// Personas con alguna tarea, para el filtro (además de "Yo"): [{ id, name }] por nombre.
export function assigneesOf(tasks, contacts) {
  const ids = new Set(tasks.map((t) => t.assignee).filter((id) => id && id !== ME))
  return [...ids]
    .map((id) => ({ id, name: contacts.find((c) => c.id === id)?.name || 'Contacto borrado' }))
    .sort((a, b) => a.name.localeCompare(b.name, 'es', { sensitivity: 'base' }))
}

export function assigneeName(task, contacts) {
  if (!task.assignee || task.assignee === ME) return 'Yo'
  return contacts.find((c) => c.id === task.assignee)?.name || 'Contacto borrado'
}

// Participantes (contactos) de la sesión de la que sale una tarea, según cómo está ahora la reunión.
function sourceParticipants(task, rawEvents) {
  const series = rawEvents.find((ev) => ev.id === task.source?.eventId)
  if (!series) return []
  const exception = task.source.sessionKey ? series.exceptions?.[task.source.sessionKey] : null
  return exception?.participantIds || series.participantIds || []
}

/**
 * Tareas pendientes que conviene ver al abrir una reunión con esas personas (sin las que salen de
 * esta misma sesión, que están en su acta):
 * - las de cualquiera de los participantes como responsable;
 * - las mías que salieron de reuniones anteriores con alguno de ellos.
 */
export function pendingForMeeting(tasks, occurrence, rawEvents) {
  const people = new Set(occurrence.participantIds || [])
  if (people.size === 0) return []
  const start = new Date(occurrence.start).getTime()
  return sortTasks(
    tasks.filter((t) => {
      if (t.status === 'done' || isFromSession(t, occurrence)) return false
      if (t.assignee && t.assignee !== ME) return people.has(t.assignee)
      if (!t.source || new Date(t.source.start).getTime() >= start) return false
      return sourceParticipants(t, rawEvents).some((id) => people.has(id))
    }),
  )
}

/**
 * Sesión de la que sale la tarea, tal como está ahora en el calendario, o null si ya no existe
 * (reunión borrada o ese día cancelado).
 */
export function sourceOccurrence(task, rawEvents) {
  const s = task.source
  if (!s) return null
  const series = rawEvents.find((ev) => ev.id === s.eventId)
  if (!series) return null
  if (!series.recurrence || !s.sessionKey) return expandEvent(series, new Date(-8.64e15), new Date(8.64e15))[0] || null
  const day = parseISO(s.sessionKey)
  return expandEvent(series, addDays(day, -400), addDays(day, 400)).find((o) => sessionKeyOf(o) === s.sessionKey) || null
}

/**
 * Las tareas siguen a su sesión cuando cambia la reunión. Devuelve [{ id, patch }] con las que cambian.
 * change:
 * - { kind: 'shift', eventId, dayDelta }: toda la serie pasa a otro día.
 * - { kind: 'split', eventId, key, newEventId, dayDelta, newIsSeries }: "este y los siguientes";
 *   las sesiones desde `key` pasan a la serie (o reunión) nueva.
 * - { kind: 'toSeries', eventId, key }: una reunión única que pasa a repetirse (su primer día).
 * - { kind: 'toSingle', eventId }: una serie que deja de repetirse.
 */
export function taskSourcePatches(tasks, change) {
  const shift = (key, days) => (days ? dateKey(addDays(parseISO(key), days)) : key)
  const out = []
  for (const task of tasks) {
    const s = task.source
    if (!s || s.eventId !== change.eventId) continue
    let source = null
    if (change.kind === 'shift' && s.sessionKey && change.dayDelta) {
      source = { ...s, sessionKey: shift(s.sessionKey, change.dayDelta) }
    } else if (change.kind === 'split' && s.sessionKey && s.sessionKey >= change.key) {
      const key = shift(s.sessionKey, change.dayDelta)
      source = { ...s, eventId: change.newEventId, sessionKey: change.newIsSeries ? key : null }
    } else if (change.kind === 'toSeries' && !s.sessionKey) {
      source = { ...s, sessionKey: change.key }
    } else if (change.kind === 'toSingle' && s.sessionKey) {
      source = { ...s, sessionKey: null }
    }
    if (source) out.push({ id: task.id, patch: { source } })
  }
  return out
}
