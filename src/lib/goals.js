// Objetivos del mes por área (ver supabase/parte14_objetivos_del_mes.sql). De 1 a 3 por área y
// mes; las tareas del equipo se pueden unir a uno. Directivo y la ceo los crean, editan y cierran;
// los demás ven los de su área.
//
// Objetivo (cesi_team_goals): { id, area, area_name, month: 'AAAA-MM-01', title, description,
//   owner_id, owner_name, status, unclosed (de un mes pasado y en curso), closed_at, parts_done,
//   parts_total, tasks_count, created_by_name, can_edit }

export const MAX_GOALS_PER_AREA = 3

export const GOAL_STATUSES = [
  { id: 'en_curso', label: 'En curso' },
  { id: 'conseguido', label: 'Conseguido' },
  { id: 'no_conseguido', label: 'No conseguido' },
]
export const GOAL_STATUS_LABEL = Object.fromEntries(GOAL_STATUSES.map((s) => [s.id, s.label]))

const MONTHS = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre']

// 'AAAA-MM-DD' (o 'AAAA-MM') → primer día de su mes: 'AAAA-MM-01'.
export function monthStart(key) {
  return `${key.slice(0, 7)}-01`
}

// 'AAAA-MM-01' → «noviembre de 2030».
export function monthLabel(month) {
  const [y, m] = month.split('-').map(Number)
  return `${MONTHS[m - 1]} de ${y}`
}

// Mes de una tarea: el de su fecha límite o, sin fecha, el de hoy.
export function taskMonth(dueDate, todayKey) {
  return monthStart(dueDate || todayKey)
}

// «Sin cerrar» si es de un mes pasado y sigue en curso; si no, su estado.
export function goalStatusLabel(goal) {
  return goal.unclosed ? 'Sin cerrar' : GOAL_STATUS_LABEL[goal.status] || goal.status
}

// Progreso de 0 a 100 (partes hechas / total de partes de sus tareas).
export function goalPercent(goal) {
  return goal.parts_total ? Math.round((goal.parts_done / goal.parts_total) * 100) : 0
}

// «3 de 8 partes hechas» o «Sin tareas».
export function goalProgressText(goal) {
  if (!goal.parts_total) return 'Sin tareas'
  return `${goal.parts_done} de ${goal.parts_total} ${goal.parts_total === 1 ? 'parte hecha' : 'partes hechas'}`
}

/**
 * Agrupados por área, en el orden de `areas` ([{ id, name }]); con allAreas, también las áreas
 * sin objetivos. [{ id, name, goals }] (los objetivos sin área van al final, en «Sin área»).
 */
export function goalsByArea(goals, areas, { allAreas = false } = {}) {
  const groups = areas.map((a) => ({ id: a.id, name: a.name, goals: goals.filter((g) => g.area === a.id) }))
  const orphan = goals.filter((g) => !g.area || !areas.some((a) => a.id === g.area))
  if (orphan.length > 0) groups.push({ id: '', name: 'Sin área', goals: orphan })
  return allAreas ? groups : groups.filter((g) => g.goals.length > 0)
}

// Separados: los «Sin cerrar» de meses anteriores y los del mes.
export function splitUnclosed(goals, month) {
  return {
    unclosed: goals.filter((g) => g.month < month),
    current: goals.filter((g) => g.month === month),
  }
}

// ¿Se puede añadir otro objetivo a esa área ese mes?
export function canAddGoal(goals, area, month) {
  return goals.filter((g) => g.area === area && g.month === month).length < MAX_GOALS_PER_AREA
}

export function emptyGoalForm({ area = '', month }) {
  return { title: '', description: '', area, month, owner: '', status: 'en_curso' }
}

export function formFromGoal(g) {
  return { title: g.title, description: g.description || '', area: g.area || '', month: g.month, owner: g.owner_id || '', status: g.status }
}

export function validateGoalForm(form) {
  const errors = {}
  if (!form.title.trim()) errors.title = 'Escribe un título.'
  else if (form.title.trim().length > 200) errors.title = 'El título es demasiado largo.'
  if (!form.area) errors.area = 'Elige el área.'
  if (!/^\d{4}-\d{2}-01$/.test(form.month || '')) errors.month = 'Elige el mes.'
  return errors
}

// ---------------------------------------------------------------------------
// Supabase
// ---------------------------------------------------------------------------

async function rpc(client, fn, args) {
  const { data, error } = await client.rpc(fn, args)
  if (error) throw error
  return data
}

// month: 'AAAA-MM-01'; area: una (o null: todas las que veo); withUnclosed: también los «Sin
// cerrar» de meses anteriores; asId: «Ver como» de la ceo.
export function listGoals(client, month, { area = null, withUnclosed = true, asId = null } = {}) {
  return rpc(client, 'cesi_team_goals', { p_month: month, p_area: area, p_with_unclosed: withUnclosed, p_as: asId })
}

export function saveGoal(client, id, form) {
  return rpc(client, 'cesi_goal_save', {
    p_id: id,
    p_area: form.area,
    p_month: form.month,
    p_title: form.title.trim(),
    p_description: form.description.trim(),
    p_owner: form.owner || null,
    p_status: form.status,
  })
}

export function deleteGoal(client, id) {
  return rpc(client, 'cesi_goal_delete', { p_id: id })
}

export function goalErrorText(err) {
  if (err?.code === 'PGRST202' || err?.code === '42883') return 'Falta ejecutar en Supabase el SQL de la parte 14 (objetivos del mes).'
  return err?.message || 'No se pudo completar. Inténtalo de nuevo.'
}
