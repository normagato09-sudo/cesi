// Aula de cada curso (parte 41, supabase/parte41_aula.sql): avisos y materiales del profesor, con
// archivos en el bucket privado «cesi-aula» (carpeta del curso). Todo pasa por funciones de
// Supabase que comprueban quién entra; los archivos se abren con enlaces temporales.

export const ROOM_BUCKET = 'cesi-aula'
export const FILE_MAX_BYTES = 20 * 1024 * 1024
export const TITLE_MAX = 160
export const BODY_MAX = 5000

// Tipos permitidos (los mismos que el bucket): extensión → tipo.
export const FILE_TYPES = {
  pdf: 'application/pdf',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
  gif: 'image/gif',
  webp: 'image/webp',
  pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
}
export const FILE_ACCEPT = Object.keys(FILE_TYPES)
  .map((e) => `.${e}`)
  .join(',')

const extOf = (name) => (/\.([a-z0-9]+)$/i.exec(name || '')?.[1] || '').toLowerCase()

// El tipo de un archivo (por su extensión; null si no está permitido).
export function fileTypeOf(file) {
  return FILE_TYPES[extOf(file?.name)] || null
}

// Error del archivo (o null): tipo permitido y como mucho 20 MB.
export function fileError(file) {
  if (!file) return null
  if (!fileTypeOf(file)) return 'Ese tipo de archivo no se puede subir. Usa PDF, imagen, PowerPoint (pptx), Word (docx) o Excel (xlsx).'
  if (file.size > FILE_MAX_BYTES) return 'El archivo puede tener como mucho 20 MB.'
  if (file.size === 0) return 'El archivo está vacío.'
  return null
}

// Nombre seguro para la ruta (sin acentos, espacios ni símbolos raros), con su extensión.
export function safeFileName(name) {
  const ext = extOf(name)
  const base = (name || 'archivo')
    .replace(/\.[^.]*$/, '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-zA-Z0-9_-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60)
  return `${base || 'archivo'}${ext ? `.${ext}` : ''}`
}

const randomId = () => (globalThis.crypto?.randomUUID ? globalThis.crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2)}`)

// Ruta del archivo en el bucket: <curso>/<kind>/<id>/<nombre> (kind: posts | tasks) o
// <curso>/subs/<cuenta>/<id>/<nombre> (entregas, parte 42).
export function roomFilePath(courseId, kind, fileName, ownerId = null) {
  const id = randomId()
  return kind === 'subs' ? `${courseId}/subs/${ownerId}/${id}/${safeFileName(fileName)}` : `${courseId}/${kind}/${id}/${safeFileName(fileName)}`
}

// Sube un archivo y devuelve lo que se guarda: { path, name, type, size }.
export async function uploadRoomFile(client, courseId, kind, file, ownerId = null) {
  const problem = fileError(file)
  if (problem) throw new Error(problem)
  const path = roomFilePath(courseId, kind, file.name, ownerId)
  const type = fileTypeOf(file)
  const { error } = await client.storage.from(ROOM_BUCKET).upload(path, file, { contentType: type, upsert: false })
  if (error) throw new Error(storageErrorText(error))
  return { path, name: (file.name || '').slice(0, 200), type, size: file.size }
}

export async function removeRoomFile(client, path) {
  if (!path) return
  await client.storage.from(ROOM_BUCKET).remove([path])
}

// Enlace temporal (10 minutos) para abrir o descargar un archivo.
export async function roomFileUrl(client, path, name = '') {
  const { data, error } = await client.storage.from(ROOM_BUCKET).createSignedUrl(path, 600, name ? { download: name } : undefined)
  if (error) throw new Error(storageErrorText(error))
  return data.signedUrl
}

// Abre un archivo del aula con un enlace temporal (en otra pestaña).
export async function openRoomFile(client, path, onError) {
  const win = window.open('', '_blank')
  try {
    const url = await roomFileUrl(client, path)
    if (win) win.location.href = url
    else window.location.href = url
  } catch (err) {
    if (win) win.close()
    onError?.(err.message || 'No se pudo abrir el archivo.')
  }
}

function storageErrorText(error) {
  const m = error?.message || ''
  if (/bucket not found/i.test(m)) return 'Falta ejecutar en Supabase el SQL de la parte 41 (el aula).'
  if (/exceeded|too large|maximum allowed size/i.test(m)) return 'El archivo puede tener como mucho 20 MB.'
  if (/mime|type.*not supported/i.test(m)) return 'Ese tipo de archivo no se puede subir.'
  if (/row-level security|unauthorized|403/i.test(m)) return 'No tienes permiso para este archivo.'
  return m || 'No se pudo subir el archivo.'
}

// «1,2 MB», «340 KB».
export function sizeText(bytes) {
  if (!bytes) return ''
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1).replace('.', ',')} MB`
}

// «5 nov 2026».
export function dayText(date) {
  const d = date instanceof Date ? date : new Date(typeof date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(date) ? `${date}T12:00:00` : date)
  if (Number.isNaN(d.getTime())) return ''
  return new Intl.DateTimeFormat('es-ES', { day: 'numeric', month: 'short', year: 'numeric' }).format(d).replace('.', '')
}

// Error del formulario de un aviso o material (o null).
export function validatePost(form) {
  const title = (form.title || '').trim()
  if (!title) return 'Escribe el título.'
  if (title.length > TITLE_MAX) return `El título puede tener como mucho ${TITLE_MAX} caracteres.`
  if ((form.body || '').trim().length > BODY_MAX) return `La descripción puede tener como mucho ${BODY_MAX} caracteres.`
  if (form.kind === 'material' && !form.file && !form.filePath) return 'Un material lleva un archivo.'
  return fileError(form.file)
}

async function rpc(client, name, args = {}) {
  const { data, error } = await client.rpc(name, args)
  if (error) throw error
  return data
}

export const roomInfo = (client, courseId) => rpc(client, 'cesi_room_info', { p_course: courseId }).then((rows) => (rows || [])[0] || null)
export const roomPosts = (client, courseId) => rpc(client, 'cesi_room_posts', { p_course: courseId }).then((rows) => rows || [])
export const markRoomRead = (client, courseId) => rpc(client, 'cesi_room_mark_read', { p_course: courseId })

// Guarda un aviso o material (sube antes el archivo nuevo si lo hay; si cambia, borra el viejo).
export async function saveRoomPost(client, courseId, form, previous = null) {
  let file = form.filePath ? { path: form.filePath, name: form.fileName, type: form.fileType, size: form.fileSize } : null
  if (form.file) file = await uploadRoomFile(client, courseId, 'posts', form.file)
  try {
    await rpc(client, 'cesi_room_post_save', {
      p_id: previous?.id || null,
      p_course: courseId,
      p_kind: form.kind,
      p_title: form.title.trim(),
      p_body: (form.body || '').trim(),
      p_file_path: file?.path || null,
      p_file_name: file?.name || '',
      p_file_type: file?.type || '',
      p_file_size: file?.size || 0,
    })
  } catch (err) {
    if (form.file && file?.path) await removeRoomFile(client, file.path).catch(() => {})
    throw err
  }
  if (previous?.file_path && previous.file_path !== file?.path) await removeRoomFile(client, previous.file_path).catch(() => {})
}

export async function deleteRoomPost(client, post) {
  const path = await rpc(client, 'cesi_room_post_delete', { p_id: post.id })
  if (path) await removeRoomFile(client, path).catch(() => {})
}

export function roomErrorText(err) {
  if (err?.code === 'PGRST202' || err?.code === '42883' || err?.code === '42P01') return 'Falta ejecutar en Supabase el SQL de la parte 41 (el aula).'
  return err?.message || 'No se pudo completar. Comprueba la conexión.'
}
