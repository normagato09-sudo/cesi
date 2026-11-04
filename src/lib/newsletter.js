// Newsletter (parte 34): la ceo publica; alumnos y equipo leen las publicadas.
// Publicación (cesi_newsletter_list): { id, title, body (con marcas, ver richText.js), status:
//   'draft'|'published', created_at, updated_at, published_at, is_read, read_count (solo la ceo) }

async function rpc(client, name, args = {}) {
  const { data, error } = await client.rpc(name, args)
  if (error) throw error
  return data
}

export const listNewsletter = (client) => rpc(client, 'cesi_newsletter_list').then((rows) => rows || [])
export const saveNewsletter = (client, { id = null, title, body }, publish) =>
  rpc(client, 'cesi_newsletter_save', { p_id: id, p_title: title, p_body: body, p_publish: !!publish })
export const deleteNewsletter = (client, id) => rpc(client, 'cesi_newsletter_delete', { p_id: id })
export const markNewsletterRead = (client, id) => rpc(client, 'cesi_newsletter_read', { p_id: id })
export const newsletterUnread = (client) => rpc(client, 'cesi_newsletter_unread').then((rows) => (rows || [])[0] || { unread: 0, latest_title: null })

export const TITLE_MAX = 200

export function validateNewsletter({ title }) {
  const t = (title || '').trim()
  if (!t) return 'Escribe el título.'
  if (t.length > TITLE_MAX) return `El título puede tener como mucho ${TITLE_MAX} caracteres.`
  return null
}

// «Leída por 12 personas», «Sin publicar».
export function readsText(post) {
  if (post.status !== 'published') return 'Sin publicar'
  const n = post.read_count || 0
  return n === 0 ? 'Nadie la ha leído todavía' : `Leída por ${n} ${n === 1 ? 'persona' : 'personas'}`
}

export function postDate(post) {
  const d = new Date(post.published_at || post.updated_at || post.created_at)
  if (Number.isNaN(d.getTime())) return ''
  return new Intl.DateTimeFormat('es-ES', { day: 'numeric', month: 'short', year: 'numeric' }).format(d).replace('.', '')
}

export function newsletterErrorText(err) {
  if (err?.code === 'PGRST202' || err?.code === '42883') return 'La newsletter aún no está disponible. Inténtalo más tarde.'
  return err?.message || 'No se pudo guardar.'
}
