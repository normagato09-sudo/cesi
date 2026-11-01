// Avisos del equipo (ver supabase/parte18_avisos_del_equipo.sql). Publican la ceo y Directivo;
// cada persona de equipo ve los que le tocan (todo el equipo o su área) y pulsa «Leído».
//
// Aviso (cesi_notices): { id, title, body, area (null: todo el equipo), area_name, important,
//   show_until: 'AAAA-MM-DD' | null, created_by, created_by_name, created_at, updated_at,
//   for_me, read_at (null: sin leer), expired, can_edit, recipients, read_count, missing_names }
// recipients, read_count y missing_names solo llegan a quien publica.

export const MAX_TITLE = 200
export const MAX_BODY = 4000

// Para mí y sin leer, de los que aún se muestran (los de arriba del Inicio). Los importantes primero.
export function unreadForMe(notices) {
  return notices
    .filter((n) => n.for_me && !n.read_at && !n.expired)
    .sort((a, b) => Number(b.important) - Number(a.important) || (b.created_at || '').localeCompare(a.created_at || ''))
}

// Con gente pendiente (para «Avisos sin leer por el equipo»), de los que aún se muestran.
export function pendingByTeam(notices) {
  return notices.filter((n) => !n.expired && n.recipients > 0 && n.read_count < n.recipients)
}

// «8 de 10 · faltan Gabriel y Evan» (o «Lo han leído todos (10)»).
export function readSummary(n) {
  if (!n.recipients) return 'Todavía no hay nadie a quien le toque.'
  if (n.read_count >= n.recipients) return `Lo han leído todos (${n.recipients})`
  const names = (n.missing_names || '').split(', ').filter(Boolean)
  const list = names.length <= 1 ? names[0] || '' : `${names.slice(0, -1).join(', ')} y ${names[names.length - 1]}`
  return `${n.read_count} de ${n.recipients} · ${names.length === 1 ? 'falta' : 'faltan'} ${list}`
}

// «Todo el equipo» o «Área Media».
export function audienceLabel(n) {
  return n.area ? `Área ${n.area_name || n.area}` : 'Todo el equipo'
}

export function emptyNoticeForm() {
  return { title: '', body: '', area: '', important: false, showUntil: '' }
}

export function formFromNotice(n) {
  return { title: n.title, body: n.body || '', area: n.area || '', important: !!n.important, showUntil: n.show_until || '' }
}

export function validateNoticeForm(form) {
  const errors = {}
  if (!form.title.trim()) errors.title = 'Escribe un título.'
  else if (form.title.trim().length > MAX_TITLE) errors.title = 'El título es demasiado largo.'
  if (form.body.length > MAX_BODY) errors.body = `Como mucho ${MAX_BODY} caracteres.`
  if (form.showUntil && !/^\d{4}-\d{2}-\d{2}$/.test(form.showUntil)) errors.showUntil = 'Fecha no válida.'
  return errors
}

// 'AAAA-MM-DD' → «4/11/2030».
export function dayLabel(key) {
  if (!key) return ''
  const [y, m, d] = key.split('-')
  return `${Number(d)}/${Number(m)}/${y}`
}

// ---------------------------------------------------------------------------
// Supabase
// ---------------------------------------------------------------------------

async function rpc(client, fn, args) {
  const { data, error } = await client.rpc(fn, args)
  if (error) throw new Error(noticeErrorText(error))
  return data
}

export function listNotices(client, asId = null) {
  return rpc(client, 'cesi_notices', { p_as: asId })
}

export function saveNotice(client, id, form) {
  return rpc(client, 'cesi_notice_save', {
    p_id: id,
    p_title: form.title.trim(),
    p_body: form.body.trim(),
    p_area: form.area || null,
    p_important: !!form.important,
    p_show_until: form.showUntil || null,
  })
}

export function deleteNotice(client, id) {
  return rpc(client, 'cesi_notice_delete', { p_id: id })
}

export function markNoticeRead(client, id, read = true) {
  return rpc(client, 'cesi_notice_read', { p_id: id, p_read: read })
}

export function noticeErrorText(err) {
  if (err?.code === 'PGRST202' || err?.code === '42883') return 'Falta ejecutar en Supabase el SQL de la parte 18 (avisos del equipo).'
  return err?.message || 'No se pudo completar. Comprueba la conexión.'
}
