import { addDaysKey, mondayOf } from './sharedCalendar'

// Tablero de cada área (ver supabase/parte17_tableros_de_area.sql): una sola herramienta con los
// campos y estados de cada una. Son datos del equipo en Supabase (no de mi sincronización).
//
// Elemento (cesi_board_items): { id, area, title, description, owner_id, owner_name,
//   due_date: 'AAAA-MM-DD' | null, due_time: 'HH:mm' | null, priority, status, fields: { campo: texto },
//   created_by_name, created_at, updated_at, done_at, comments_count, can_edit, can_comment }
//
// Para añadir el tablero de otra área: su bloque aquí (nombres y textos) y su fila en
// board_configs (parte 17, con los mismos ids de estados, prioridades y campos).

const opts = (list) => list.map(([id, label]) => ({ id, label }))

const SEVERITY = { label: 'Gravedad', options: opts([['leve', 'Leve'], ['media', 'Media'], ['grave', 'Grave']]) }

export const BOARDS = {
  moderacion: {
    area: 'moderacion',
    title: 'Registro de moderación',
    newLabel: 'Nuevo registro',
    sensitive: true,
    statuses: opts([['abierto', 'Abierto'], ['en_revision', 'En revisión'], ['resuelto', 'Resuelto']]),
    done: ['resuelto'],
    priority: SEVERITY,
    date: { label: 'Fecha' },
    descriptionLabel: 'Descripción',
    fields: [
      { id: 'type', label: 'Tipo', options: opts([['aviso', 'Aviso'], ['sancion', 'Sanción'], ['incidencia', 'Incidencia'], ['expulsion', 'Expulsión']]) },
      { id: 'discordUser', label: 'Usuario de Discord afectado' },
      { id: 'channel', label: 'Canal (opcional)' },
      { id: 'reason', label: 'Motivo', multiline: true },
    ],
  },
  media: {
    area: 'media',
    title: 'Publicaciones',
    newLabel: 'Nueva publicación',
    statuses: opts([['idea', 'Idea'], ['preparacion', 'En preparación'], ['programada', 'Programada'], ['publicada', 'Publicada']]),
    done: ['publicada'],
    priority: null,
    date: { label: 'Fecha de publicación', withTime: true },
    descriptionLabel: 'Texto o idea',
    calendar: true,
    fields: [
      {
        id: 'network',
        label: 'Red social',
        options: opts([['instagram', 'Instagram'], ['tiktok', 'TikTok'], ['youtube', 'YouTube'], ['x', 'X'], ['discord', 'Discord'], ['otra', 'Otra']]),
      },
      { id: 'link', label: 'Enlace de la publicación', link: true },
    ],
  },
  tecnico: {
    area: 'tecnico',
    title: 'Incidencias y peticiones',
    newLabel: 'Nueva incidencia o petición',
    statuses: opts([['nueva', 'Nueva'], ['en_curso', 'En curso'], ['en_pruebas', 'En pruebas'], ['resuelta', 'Resuelta']]),
    done: ['resuelta'],
    priority: { label: 'Prioridad', options: opts([['baja', 'Baja'], ['media', 'Media'], ['alta', 'Alta'], ['urgente', 'Urgente']]) },
    date: { label: 'Fecha límite' },
    descriptionLabel: 'Descripción',
    fields: [
      { id: 'type', label: 'Tipo', options: opts([['error', 'Error'], ['peticion', 'Petición'], ['mejora', 'Mejora']]) },
      { id: 'system', label: 'Sistema', options: opts([['web', 'Web'], ['app', 'App'], ['bot', 'Bot de Discord'], ['otro', 'Otro']]) },
      { id: 'requestedBy', label: 'Quién lo pidió' },
    ],
  },
  ciberseguridad: {
    area: 'ciberseguridad',
    title: 'Seguridad',
    newLabel: 'Nuevo registro',
    sensitive: true,
    passwordWarning: true,
    statuses: opts([['abierto', 'Abierto'], ['en_analisis', 'En análisis'], ['resuelto', 'Resuelto']]),
    done: ['resuelto'],
    priority: SEVERITY,
    date: { label: 'Fecha' },
    descriptionLabel: 'Descripción',
    fields: [
      { id: 'type', label: 'Tipo', options: opts([['incidente', 'Incidente'], ['revision', 'Revisión'], ['alerta', 'Alerta']]) },
      { id: 'system', label: 'Sistema afectado' },
    ],
  },
  legal: {
    area: 'legal',
    title: 'Documentos',
    newLabel: 'Nuevo documento',
    statuses: opts([['borrador', 'Borrador'], ['en_vigor', 'En vigor'], ['a_revisar', 'A revisar']]),
    done: ['en_vigor'],
    priority: null,
    // La fecha es la de revisión: en naranja si faltan menos de 30 días, en rojo si ya pasó.
    date: { label: 'Fecha de revisión', review: true },
    descriptionLabel: 'Descripción',
    fields: [
      { id: 'type', label: 'Tipo', options: opts([['norma', 'Norma'], ['contrato', 'Contrato'], ['privacidad', 'Privacidad'], ['otro', 'Otro']]) },
      { id: 'link', label: 'Enlace al documento (Drive, etc.)', link: true },
    ],
  },
}

export const BOARD_AREAS = Object.keys(BOARDS)
export const REVIEW_SOON_DAYS = 30

export function boardOf(area) {
  return BOARDS[area] || null
}

export function statusLabel(cfg, id) {
  return cfg.statuses.find((s) => s.id === id)?.label || id
}

export function optionLabel(options, id) {
  return options?.find((o) => o.id === id)?.label || id || ''
}

export function isDone(cfg, item) {
  return cfg.done.includes(item.status)
}

// ¿Atrasado? Con fecha anterior a hoy y sin terminar (en Legal: la revisión ya pasó, esté como esté).
export function isLate(cfg, item, todayKey) {
  if (!item.due_date || item.due_date >= todayKey) return false
  return cfg.date.review ? true : !isDone(cfg, item)
}

// Legal: 'late' (la revisión ya pasó), 'soon' (en menos de 30 días) o null.
export function reviewState(cfg, item, todayKey) {
  if (!cfg.date.review || !item.due_date) return null
  if (item.due_date < todayKey) return 'late'
  if (item.due_date < addDaysKey(todayKey, REVIEW_SOON_DAYS)) return 'soon'
  return null
}

// Una columna por estado: [{ id, label, items }]
export function boardColumns(cfg, items) {
  return cfg.statuses.map((s) => ({ ...s, items: items.filter((i) => i.status === s.id) }))
}

function normalize(text) {
  return (text || '')
    .toString()
    .toLocaleLowerCase('es')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .trim()
}

/**
 * Lista con filtros: { query, status, owner ('none': sin responsable), fields: { campo: opción } }.
 * El buscador mira el título, la descripción y los campos de texto.
 */
export function filterItems(items, { query = '', status = '', owner = '', fields = {} } = {}) {
  const q = normalize(query)
  return items.filter((i) => {
    if (status && i.status !== status) return false
    if (owner === 'none' && i.owner_id) return false
    if (owner && owner !== 'none' && i.owner_id !== owner) return false
    for (const [key, value] of Object.entries(fields)) if (value && (i.fields || {})[key] !== value) return false
    if (q && ![i.title, i.description, ...Object.values(i.fields || {})].some((t) => normalize(t).includes(q))) return false
    return true
  })
}

/**
 * «Mi tablero» en el Inicio: lo mío sin terminar (atrasado, de esta semana y el resto) y, en Legal,
 * las revisiones de los próximos 30 días o ya pasadas (de todos). Cada fila { item, late, week }.
 */
export function myBoardItems(cfg, items, meId, todayKey) {
  const sunday = addDaysKey(mondayOf(todayKey), 6)
  const row = (item) => ({ item, late: isLate(cfg, item, todayKey), week: !!item.due_date && item.due_date >= todayKey && item.due_date <= sunday })
  const byDate = (a, b) => (a.due_date || '9999-99-99').localeCompare(b.due_date || '9999-99-99') || a.title.localeCompare(b.title, 'es')
  const mine = items.filter((i) => i.owner_id === meId && !isDone(cfg, i)).sort(byDate).map(row)
  const reviews = cfg.date.review
    ? items
        .filter((i) => reviewState(cfg, i, todayKey) && !mine.some((m) => m.item.id === i.id))
        .sort(byDate)
        .map(row)
    : []
  return { mine, reviews }
}

// ¿Parece una contraseña o una clave? Solo para avisar al guardar (se puede seguir).
export function looksLikePassword(text) {
  const t = text || ''
  if (/\b(contrase[ñn]a|password|passwd|pwd|clave|pass|token|api[_ -]?key|secret)\s*[:=]\s*\S+/i.test(t)) return true
  return t.split(/\s+/).some((w) => w.length >= 10 && /[a-z]/.test(w) && /[A-Z]/.test(w) && /\d/.test(w) && /[^A-Za-z0-9]/.test(w) && !/^https?:\/\//i.test(w))
}

// Semanas del mes (lunes a domingo) para el calendario: [['AAAA-MM-DD' × 7], …].
export function monthWeeks(monthKey) {
  const month = monthKey.slice(0, 7)
  const weeks = []
  let day = mondayOf(`${month}-01`)
  do {
    const week = []
    for (let i = 0; i < 7; i++) week.push(addDaysKey(day, i))
    weeks.push(week)
    day = addDaysKey(day, 7)
  } while (day.slice(0, 7) <= month)
  return weeks
}

// ---------------------------------------------------------------------------
// Formulario
// ---------------------------------------------------------------------------

export function emptyItemForm(cfg, meId = '') {
  return {
    title: '',
    description: '',
    owner: meId || '',
    dueDate: '',
    dueTime: '',
    priority: '',
    status: cfg.statuses[0].id,
    fields: Object.fromEntries(cfg.fields.map((f) => [f.id, ''])),
  }
}

export function formFromItem(cfg, item) {
  return {
    title: item.title,
    description: item.description || '',
    owner: item.owner_id || '',
    dueDate: item.due_date || '',
    dueTime: item.due_time || '',
    priority: item.priority || '',
    status: item.status,
    fields: Object.fromEntries(cfg.fields.map((f) => [f.id, (item.fields || {})[f.id] || ''])),
  }
}

export function validateItemForm(cfg, form) {
  const errors = {}
  if (!form.title.trim()) errors.title = 'Escribe un título.'
  else if (form.title.trim().length > 200) errors.title = 'El título es demasiado largo.'
  if (form.description.length > 4000) errors.description = 'Como mucho 4000 caracteres.'
  if (form.dueDate && !/^\d{4}-\d{2}-\d{2}$/.test(form.dueDate)) errors.dueDate = 'Fecha no válida.'
  if (form.dueTime && !form.dueDate) errors.dueDate = 'Pon también la fecha.'
  for (const f of cfg.fields) {
    const v = form.fields[f.id] || ''
    if (v.length > 1000) errors[`field:${f.id}`] = 'Como mucho 1000 caracteres.'
    if (f.link && v && !/^https?:\/\/\S+$/i.test(v.trim())) errors[`field:${f.id}`] = 'Pon un enlace que empiece por https://'
  }
  return errors
}

// El texto del elemento en el que buscar contraseñas (Ciberseguridad).
export function formText(form) {
  return [form.title, form.description, ...Object.values(form.fields)].join('\n')
}

// ---------------------------------------------------------------------------
// Supabase
// ---------------------------------------------------------------------------

async function rpc(client, fn, args) {
  const { data, error } = await client.rpc(fn, args)
  if (error) throw new Error(boardErrorText(error))
  return data
}

export function listBoardItems(client, area, asId = null) {
  return rpc(client, 'cesi_board_items', { p_area: area, p_as: asId })
}

export function listBoardComments(client, itemId, asId = null) {
  return rpc(client, 'cesi_board_comments', { p_item: itemId, p_as: asId })
}

export function listBoardPeople(client, area) {
  return rpc(client, 'cesi_board_people', { p_area: area })
}

// [{ area, open_count }] (Directivo y la ceo).
export function boardCounts(client, asId = null) {
  return rpc(client, 'cesi_board_counts', { p_as: asId })
}

export function saveBoardItem(client, cfg, id, form) {
  return rpc(client, 'cesi_board_save', {
    p_id: id,
    p_area: cfg.area,
    p_title: form.title.trim(),
    p_description: form.description.trim(),
    p_owner: form.owner || null,
    p_due_date: form.dueDate || null,
    p_due_time: cfg.date.withTime && form.dueTime ? form.dueTime : null,
    p_priority: cfg.priority && form.priority ? form.priority : null,
    p_status: form.status,
    p_fields: Object.fromEntries(cfg.fields.map((f) => [f.id, (form.fields[f.id] || '').trim()])),
  })
}

export function moveBoardItem(client, id, status) {
  return rpc(client, 'cesi_board_move', { p_id: id, p_status: status })
}

export function deleteBoardItem(client, id) {
  return rpc(client, 'cesi_board_delete', { p_id: id })
}

export function addBoardComment(client, itemId, text) {
  return rpc(client, 'cesi_board_comment_add', { p_item: itemId, p_text: text })
}

export function deleteBoardComment(client, id) {
  return rpc(client, 'cesi_board_comment_delete', { p_id: id })
}

export function boardErrorText(err) {
  if (err?.code === 'PGRST202' || err?.code === '42883') return 'Falta ejecutar en Supabase el SQL de la parte 17 (tableros de área).'
  return err?.message || 'No se pudo completar. Comprueba la conexión.'
}
