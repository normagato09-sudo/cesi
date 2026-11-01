import { hhmmOf, keyOf } from './sharedCalendar'

// Mensajes del equipo (ver supabase/parte21_mensajes_del_equipo.sql): privadas entre dos personas,
// una por área y «Todo el equipo». Son tablas nuevas en Supabase (no de mi sincronización) y
// llegan en tiempo real. Nunca se leen en «Ver como»: los mensajes son privados.
//
// Conversación (cesi_chat_list): { id, kind: 'private' | 'area' | 'team', area, title, other_id,
//   other_read_at, last_body, last_deleted, last_at, last_author_id, last_author_name, unread, my_read_at }
// Mensaje (cesi_chat_messages): { id, conversation_id, author_id, author_name, body, created_at,
//   edited_at, deleted, mine }

export const MAX_MESSAGE = 4000

// Texto en trozos: [{ text }, { url, text }] (los enlaces, clicables). Sin el punto o la coma final.
export function linkify(text) {
  const out = []
  const re = /\b((?:https?:\/\/|www\.)[^\s<]+)/gi
  let last = 0
  for (const m of (text || '').matchAll(re)) {
    let link = m[1]
    const trailing = link.match(/[.,;:!?)\]»"']+$/)
    if (trailing) link = link.slice(0, -trailing[0].length)
    if (m.index > last) out.push({ text: text.slice(last, m.index) })
    out.push({ url: link.toLowerCase().startsWith('www.') ? `https://${link}` : link, text: link })
    last = m.index + link.length
  }
  if (last < (text || '').length) out.push({ text: text.slice(last) })
  return out
}

// La última línea de la lista: «Tú: hola», «Ana: hola» (en las de grupo) o «Mensaje eliminado».
export function previewText(conv, meId) {
  if (!conv.last_at) return 'Sin mensajes todavía'
  const body = conv.last_deleted ? 'Mensaje eliminado' : (conv.last_body || '').replace(/\s+/g, ' ')
  if (conv.last_author_id === meId) return `Tú: ${body}`
  if (conv.kind !== 'private' && conv.last_author_name) return `${conv.last_author_name.split(' ')[0]}: ${body}`
  return body
}

// Hora en la lista: «14:05» hoy, «ayer», o «3/11» (en mi zona).
export function listTime(iso, zone, now = new Date()) {
  if (!iso) return ''
  const d = new Date(iso)
  const day = keyOf(d, zone)
  const today = keyOf(now, zone)
  if (day === today) return hhmmOf(d, zone)
  if (day === keyOf(new Date(now.getTime() - 86400000), zone)) return 'ayer'
  const [, m, dd] = day.split('-')
  return `${Number(dd)}/${Number(m)}`
}

// Día de un grupo de mensajes: «Hoy», «Ayer» o «lunes, 3 de noviembre».
export function dayHeading(key, zone, now = new Date()) {
  const today = keyOf(now, zone)
  if (key === today) return 'Hoy'
  if (key === keyOf(new Date(now.getTime() - 86400000), zone)) return 'Ayer'
  const [y, m, d] = key.split('-').map(Number)
  return new Date(Date.UTC(y, m - 1, d, 12)).toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'UTC' })
}

// Mensajes agrupados por día (en mi zona): [{ day, messages }].
export function groupByDay(messages, zone) {
  const out = []
  for (const m of messages) {
    const day = keyOf(new Date(m.created_at), zone)
    if (!out.length || out[out.length - 1].day !== day) out.push({ day, messages: [] })
    out[out.length - 1].messages.push(m)
  }
  return out
}

// ¿«Visto»? En las privadas, mi último mensaje si la otra persona ha leído después.
export function seenMessageId(messages, conv) {
  if (conv?.kind !== 'private' || !conv.other_read_at) return null
  const mine = messages.filter((m) => m.mine && !m.deleted)
  const last = mine[mine.length - 1]
  return last && new Date(conv.other_read_at) >= new Date(last.created_at) ? last.id : null
}

export function totalUnread(conversations) {
  return conversations.reduce((n, c) => n + (c.unread || 0), 0)
}

// «Tienes 3 mensajes sin leer» / «Tienes 1 mensaje sin leer».
export function unreadText(n) {
  return `Tienes ${n} ${n === 1 ? 'mensaje' : 'mensajes'} sin leer`
}

function normalize(text) {
  return (text || '')
    .toString()
    .toLocaleLowerCase('es')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .trim()
}

// Buscador de personas (por nombre o área).
export function searchPeople(people, query) {
  const q = normalize(query)
  if (!q) return people
  return people.filter((p) => normalize(p.name).includes(q) || normalize(p.area_name).includes(q))
}

// ---------------------------------------------------------------------------
// Supabase
// ---------------------------------------------------------------------------

async function rpc(client, fn, args) {
  const { data, error } = await client.rpc(fn, args)
  if (error) throw new Error(chatErrorText(error))
  return data
}

export const listConversations = (client) => rpc(client, 'cesi_chat_list', {})
export const listMessages = (client, conversationId, before = null) => rpc(client, 'cesi_chat_messages', { p_conversation: conversationId, p_before: before, p_limit: 100 })
export const listChatPeople = (client) => rpc(client, 'cesi_chat_people', {})
export const unreadCount = (client) => rpc(client, 'cesi_chat_unread', {})
export const openPrivate = (client, otherId) => rpc(client, 'cesi_chat_open_private', { p_other: otherId })
export const sendMessage = (client, conversationId, body) => rpc(client, 'cesi_chat_send', { p_conversation: conversationId, p_body: body })
export const editMessage = (client, id, body) => rpc(client, 'cesi_chat_edit', { p_id: id, p_body: body })
export const deleteMessage = (client, id) => rpc(client, 'cesi_chat_delete', { p_id: id })
export const markRead = (client, conversationId) => rpc(client, 'cesi_chat_read', { p_conversation: conversationId })

/**
 * En tiempo real: llama a onChange({ table, row }) con cada mensaje nuevo, editado o borrado y con
 * cada «leído» (solo los que puedo ver). Devuelve una función para dejar de escuchar.
 */
export function subscribeChat(client, onChange, name = 'chat') {
  if (!client?.channel) return () => {}
  const channel = client
    .channel(`cesi-${name}-${Math.random().toString(36).slice(2, 8)}`)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'chat_messages' }, (p) => onChange({ table: 'chat_messages', row: p.new || p.old }))
    .on('postgres_changes', { event: '*', schema: 'public', table: 'chat_reads' }, (p) => onChange({ table: 'chat_reads', row: p.new || p.old }))
  channel.subscribe()
  return () => client.removeChannel(channel)
}

export function chatErrorText(err) {
  if (err?.code === 'PGRST202' || err?.code === '42883') return 'Falta ejecutar en Supabase el SQL de la parte 21 (mensajes del equipo).'
  return err?.message || 'No se pudo completar. Comprueba la conexión.'
}
