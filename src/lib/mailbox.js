// Buzón (parte 35): sugerencias y quejas de alumnos, profesores y equipo; la ceo los ve todos,
// cambia su estado y responde; cada uno ve solo los suyos. Los reportes de mensajes (parte 37)
// también llegan aquí.
// Mensaje (cesi_mailbox_list): { id, kind: 'sugerencia'|'queja'|'reporte', body, course_id,
//   course_name, reported, status: 'nueva'|'vista'|'resuelta', reply, replied_at, created_at,
//   author_name, author_role, mine }

export const BODY_MAX = 1000
export const REPLY_MAX = 2000
export const KINDS = [
  { id: 'sugerencia', label: 'Sugerencia' },
  { id: 'queja', label: 'Queja' },
]
export const KIND_LABEL = { sugerencia: 'Sugerencia', queja: 'Queja', reporte: 'Reporte de un mensaje' }
export const STATUSES = [
  { id: 'nueva', label: 'Nueva' },
  { id: 'vista', label: 'Vista' },
  { id: 'resuelta', label: 'Resuelta' },
]
export const STATUS_LABEL = Object.fromEntries(STATUSES.map((s) => [s.id, s.label]))

export function validateMailbox({ kind, body }) {
  if (!KIND_LABEL[kind] || kind === 'reporte') return 'Elige «Sugerencia» o «Queja».'
  const text = (body || '').trim()
  if (!text) return 'Escribe el texto.'
  if (text.length > BODY_MAX) return `El texto puede tener como mucho ${BODY_MAX} caracteres.`
  return null
}

// Filtros de la ceo: estado ('' todos) y tipo ('' todos).
export function filterMailbox(list, { status = '', kind = '' } = {}) {
  return list.filter((m) => (!status || m.status === status) && (!kind || m.kind === kind))
}

// Cuántos hay en cada estado (para las pestañas de la ceo).
export function statusCounts(list) {
  const out = { '': list.length, nueva: 0, vista: 0, resuelta: 0 }
  for (const m of list) out[m.status] = (out[m.status] || 0) + 1
  return out
}

export function mailDate(iso) {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  return new Intl.DateTimeFormat('es-ES', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }).format(d).replace('.', '')
}

async function rpc(client, name, args = {}) {
  const { data, error } = await client.rpc(name, args)
  if (error) throw error
  return data
}
export const listMailbox = (client) => rpc(client, 'cesi_mailbox_list').then((rows) => rows || [])
export const sendMailbox = (client, { kind, body, course }) => rpc(client, 'cesi_mailbox_send', { p_kind: kind, p_body: (body || '').trim(), p_course: course || '' })
export const answerMailbox = (client, id, { status = null, reply = null }) => rpc(client, 'cesi_mailbox_answer', { p_id: id, p_status: status, p_reply: reply })

export function mailboxErrorText(err) {
  if (err?.code === 'PGRST202' || err?.code === '42883') return 'El buzón aún no está disponible. Inténtalo más tarde.'
  return err?.message || 'No se pudo enviar.'
}
