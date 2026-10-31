import { keyOf } from './sharedCalendar'

// Tareas del equipo y fichaje (ver «Parte 7» en supabase/schema.sql). Aparte de mis tareas
// personales (tasks) y de la sincronización: se leen y se escriben con funciones de Supabase.
// «Directivo» (área direccion) y la ceo ven y gestionan todo.
//
// Tarea (cesi_team_tasks): { id, title, description, area, area_name, assignee_id, assignee_name,
//   created_by, created_by_name, due_date: 'AAAA-MM-DD' | null, priority, status, can_edit, can_status }
// Fichaje (cesi_clock_entries): { id, profile_id, name, clock_in, clock_out, summary, fix_note,
//   fixed_by_name, fixed_at, can_fix }

export const DIRECTIVO_AREA = 'direccion'

export const TASK_STATUSES = [
  { id: 'pendiente', label: 'Pendiente' },
  { id: 'en_curso', label: 'En curso' },
  { id: 'hecha', label: 'Hecha' },
]
export const TASK_PRIORITIES = [
  { id: 'alta', label: 'Alta' },
  { id: 'media', label: 'Media' },
  { id: 'baja', label: 'Baja' },
]
export const STATUS_LABEL = Object.fromEntries(TASK_STATUSES.map((s) => [s.id, s.label]))
export const PRIORITY_LABEL = Object.fromEntries(TASK_PRIORITIES.map((p) => [p.id, p.label]))
const PRIORITY_ORDER = { alta: 0, media: 1, baja: 2 }

// Turno abierto: se puede fichar la salida hasta 16 horas después de la entrada.
export const OPEN_SHIFT_HOURS = 16

export function isBoss({ role, area }) {
  return role === 'ceo' || (role === 'equipo' && area === DIRECTIVO_AREA)
}

// ---------------------------------------------------------------------------
// Tareas
// ---------------------------------------------------------------------------

// ¿Atrasada? Con fecha límite anterior a hoy (en mi zona) y sin hacer.
export function isOverdue(task, todayKey) {
  return !!task.due_date && task.status !== 'hecha' && task.due_date < todayKey
}

/**
 * Filtro de la lista: 'mine' (asignadas a mí o creadas por mí), 'area' (de mi área) o 'all'.
 * me: { id, area }.
 */
export function filterTasks(tasks, filter, me) {
  if (filter === 'mine') return tasks.filter((t) => t.assignee_id === me.id || t.created_by === me.id)
  if (filter === 'area') return tasks.filter((t) => !!me.area && t.area === me.area)
  return tasks
}

// Agrupadas por estado; en cada grupo, las atrasadas primero, luego por fecha límite y prioridad.
export function groupTasks(tasks, todayKey) {
  const sortKey = (t) => [isOverdue(t, todayKey) ? 0 : 1, t.due_date || '9999-99-99', PRIORITY_ORDER[t.priority] ?? 1, t.title]
  const compare = (a, b) => {
    const ka = sortKey(a)
    const kb = sortKey(b)
    for (let i = 0; i < ka.length; i++) {
      if (ka[i] < kb[i]) return -1
      if (ka[i] > kb[i]) return 1
    }
    return 0
  }
  return TASK_STATUSES.map((s) => ({ ...s, tasks: tasks.filter((t) => t.status === s.id).sort(compare) }))
}

export function emptyTaskForm(me) {
  return { title: '', description: '', area: me.area || '', assignee: me.boss ? '' : me.id, dueDate: '', priority: 'media', status: 'pendiente' }
}

export function formFromTask(t) {
  return {
    title: t.title,
    description: t.description || '',
    area: t.area || '',
    assignee: t.assignee_id || '',
    dueDate: t.due_date || '',
    priority: t.priority,
    status: t.status,
  }
}

export function validateTaskForm(form) {
  const errors = {}
  if (!form.title.trim()) errors.title = 'Escribe un título.'
  else if (form.title.trim().length > 200) errors.title = 'El título es demasiado largo.'
  if (!form.area) errors.area = 'Elige el área.'
  if (form.dueDate && !/^\d{4}-\d{2}-\d{2}$/.test(form.dueDate)) errors.dueDate = 'Fecha no válida.'
  return errors
}

// ---------------------------------------------------------------------------
// Fichaje
// ---------------------------------------------------------------------------

export function entryMinutes(entry) {
  if (!entry.clock_out) return 0
  return Math.max(0, Math.round((new Date(entry.clock_out) - new Date(entry.clock_in)) / 60000))
}

// «7 h 30 min»
export function formatMinutes(minutes) {
  const h = Math.floor(minutes / 60)
  const m = minutes % 60
  if (h === 0) return `${m} min`
  return m ? `${h} h ${m} min` : `${h} h`
}

// Entrada abierta (sin salida) de las últimas OPEN_SHIFT_HOURS horas: la que se cierra al fichar la salida.
export function openEntry(entries, now = new Date()) {
  return (
    entries
      .filter((e) => !e.clock_out && now - new Date(e.clock_in) < OPEN_SHIFT_HOURS * 3600000)
      .sort((a, b) => new Date(b.clock_in) - new Date(a.clock_in))[0] || null
  )
}

// Resumen por persona: [{ profileId, name, minutes, count, open }] ordenado por nombre.
export function summarizeByPerson(entries) {
  const out = new Map()
  for (const e of entries) {
    // Los de una cuenta eliminada (sin profile_id) van por su nombre.
    const key = e.profile_id || `gone:${e.name}`
    const row = out.get(key) || { profileId: key, name: e.name, minutes: 0, count: 0, open: 0 }
    row.minutes += entryMinutes(e)
    row.count += 1
    if (!e.clock_out) row.open += 1
    out.set(key, row)
  }
  return [...out.values()].sort((a, b) => a.name.localeCompare(b.name, 'es'))
}

// Fichajes agrupados por día de la entrada (en la zona), del más reciente al más antiguo.
export function entriesByDay(entries, zone) {
  const out = new Map()
  for (const e of [...entries].sort((a, b) => new Date(b.clock_in) - new Date(a.clock_in))) {
    const key = keyOf(new Date(e.clock_in), zone)
    if (!out.has(key)) out.set(key, [])
    out.get(key).push(e)
  }
  return out
}

// ---------------------------------------------------------------------------
// Supabase
// ---------------------------------------------------------------------------

async function rpc(client, fn, args) {
  const { data, error } = await client.rpc(fn, args)
  if (error) throw error
  return data
}

export function listTeamTasks(client, asId = null) {
  return rpc(client, 'cesi_team_tasks', { p_as: asId })
}

export function listTaskPeople(client) {
  return rpc(client, 'cesi_task_people', {})
}

export async function listAreasForTasks(client) {
  const { data, error } = await client.from('areas').select('id, name, sort').order('sort')
  if (error) throw error
  return data || []
}

export function saveTeamTask(client, id, form) {
  return rpc(client, 'cesi_task_save', {
    p_id: id,
    p_title: form.title.trim(),
    p_description: form.description.trim(),
    p_area: form.area,
    p_assignee: form.assignee || null,
    p_due_date: form.dueDate || null,
    p_priority: form.priority,
    p_status: form.status,
  })
}

export function setTeamTaskStatus(client, id, status) {
  return rpc(client, 'cesi_task_set_status', { p_id: id, p_status: status })
}

export function deleteTeamTask(client, id) {
  return rpc(client, 'cesi_task_delete', { p_id: id })
}

export function clockIn(client) {
  return rpc(client, 'cesi_clock_in', {})
}

export function clockOut(client, summary) {
  return rpc(client, 'cesi_clock_out', { p_summary: summary.trim() })
}

export function fixClockEntry(client, id, { clockIn: inAt = null, clockOut: outAt, summary, note }) {
  return rpc(client, 'cesi_clock_fix', {
    p_id: id,
    p_clock_in: inAt ? inAt.toISOString() : null,
    p_clock_out: outAt.toISOString(),
    p_summary: summary.trim(),
    p_note: note.trim(),
  })
}

// Eliminar un fichaje (solo la ceo; ver cesi_clock_delete en la parte 8).
export function deleteClockEntry(client, id) {
  return rpc(client, 'cesi_clock_delete', { p_id: id })
}

export function listClockEntries(client, from, to, { all = false, asId = null } = {}) {
  return rpc(client, 'cesi_clock_entries', { p_from: from.toISOString(), p_to: to.toISOString(), p_all: all, p_as: asId })
}

export function listOldOpenEntries(client, asId = null) {
  return rpc(client, 'cesi_clock_open_old', { p_as: asId })
}

export function errorText(err) {
  if (err?.code === 'PGRST202' || err?.code === '42883') return 'Falta ejecutar en Supabase el SQL de las partes 7 y 8 (tareas y fichaje).'
  return err?.message || 'No se pudo completar. Inténtalo de nuevo.'
}
