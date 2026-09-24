import { makeId } from '../store'
import { idbDelete, idbGet, idbKeys, idbPut } from './idb'

// Archivos de CESI (fotos de contactos y CV de candidatos).
//
// En los documentos solo se guarda una referencia:
//   { store: 'cloud',  path: '{user_id}/photos/{id}.webp', type, name, size }  → Supabase Storage
//   { store: 'device', id,                                  type, name, size }  → IndexedDB de este dispositivo
// Con la sincronización activa el archivo se guarda primero en IndexedDB (caché) y se sube al
// bucket; si no hay conexión queda pendiente y se sube al volver. Para mostrarlo se descarga una
// vez con una URL firmada y se guarda en la caché, así se ve también sin conexión.

export const BUCKET = 'cesi-photos'
const SIGNED_URL_SECONDS = 60 * 60

const cacheKey = (path) => `cache:${path}`
const pendingUploadKey = (path) => `upload:${path}`
const pendingDeleteKey = (path) => `delete:${path}`
const deviceKey = (id) => `device:${id}`

// { client, userId } cuando hay sesión de Supabase; null sin sincronización.
let remote = null
let flushing = null

export function configureRemoteFiles(next) {
  remote = next
  if (remote) flushPendingFiles()
}

export function hasRemoteFiles() {
  return !!remote
}

function online() {
  return typeof navigator === 'undefined' || navigator.onLine !== false
}

// Identificador estable de una referencia (para hooks y comparaciones).
export function fileKey(ref) {
  if (!ref) return null
  return ref.store === 'cloud' ? `cloud:${ref.path}` : ref.store === 'device' ? `device:${ref.id}` : null
}

export function sameFile(a, b) {
  return fileKey(a) === fileKey(b)
}

/**
 * Guarda un archivo y devuelve su referencia. folder: 'photos' | 'cvs'.
 */
export async function saveFile(blob, { folder, ext, name = '' }) {
  const id = makeId('file')
  const meta = { type: blob.type, name, size: blob.size }
  if (remote) {
    const path = `${remote.userId}/${folder}/${id}.${ext}`
    await idbPut(cacheKey(path), blob)
    await idbPut(pendingUploadKey(path), { path, type: blob.type })
    flushPendingFiles()
    return { store: 'cloud', path, ...meta }
  }
  await idbPut(deviceKey(id), blob)
  return { store: 'device', id, ...meta }
}

// Contenido del archivo (Blob) o null si no está disponible (p. ej. sin conexión y sin caché).
export async function getFileBlob(ref) {
  if (!ref) return null
  if (ref.store === 'device') return (await idbGet(deviceKey(ref.id))) || null
  if (ref.store !== 'cloud') return null
  const cached = await idbGet(cacheKey(ref.path))
  if (cached) return cached
  if (!remote || !online()) return null
  const { data, error } = await remote.client.storage.from(BUCKET).createSignedUrl(ref.path, SIGNED_URL_SECONDS)
  if (error || !data?.signedUrl) return null
  const response = await fetch(data.signedUrl)
  if (!response.ok) return null
  const blob = await response.blob()
  await idbPut(cacheKey(ref.path), blob)
  return blob
}

// Borra el archivo (en la nube, cuando haya conexión) y su copia local.
export async function deleteFile(ref) {
  if (!ref) return
  if (ref.store === 'device') {
    await idbDelete(deviceKey(ref.id))
    return
  }
  if (ref.store !== 'cloud') return
  await idbDelete(cacheKey(ref.path))
  const wasPending = await idbGet(pendingUploadKey(ref.path))
  await idbDelete(pendingUploadKey(ref.path))
  if (!wasPending) {
    await idbPut(pendingDeleteKey(ref.path), { path: ref.path })
    flushPendingFiles()
  }
}

// Sube los archivos pendientes y hace los borrados pendientes. Se llama al configurar la
// sesión, al guardar un archivo y al volver la conexión.
export function flushPendingFiles() {
  if (!remote || !online()) return Promise.resolve()
  if (!flushing) {
    flushing = (async () => {
      try {
        const bucket = remote.client.storage.from(BUCKET)
        for (const key of await idbKeys('upload:')) {
          const { path, type } = await idbGet(key)
          const blob = await idbGet(cacheKey(path))
          if (!blob) {
            await idbDelete(key)
            continue
          }
          const { error } = await bucket.upload(path, blob, { contentType: type, upsert: true })
          if (error) break
          await idbDelete(key)
        }
        const deletes = await idbKeys('delete:')
        if (deletes.length > 0) {
          const paths = await Promise.all(deletes.map(async (k) => (await idbGet(k)).path))
          const { error } = await bucket.remove(paths)
          if (!error) await Promise.all(deletes.map((k) => idbDelete(k)))
        }
      } catch {
        // Se reintentará al volver la conexión.
      } finally {
        flushing = null
      }
    })()
  }
  return flushing
}

// ¿Quedan archivos por subir? (para avisar al cerrar sesión)
export async function pendingFileCount() {
  return (await idbKeys('upload:')).length
}

// Pasa a la nube un archivo que estaba solo en este dispositivo (al activar la sincronización).
export async function promoteDeviceFile(ref, folder) {
  if (!remote || ref?.store !== 'device') return ref
  const blob = await idbGet(deviceKey(ref.id))
  if (!blob) return ref
  const ext = folder === 'cvs' ? 'pdf' : ref.type === 'image/jpeg' ? 'jpg' : 'webp'
  const next = await saveFile(blob, { folder, ext, name: ref.name })
  await idbDelete(deviceKey(ref.id))
  return next
}

if (typeof window !== 'undefined') {
  window.addEventListener('online', () => flushPendingFiles())
}
