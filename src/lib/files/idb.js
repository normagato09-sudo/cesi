// Almacén clave → valor en IndexedDB para archivos (fotos y CV). localStorage no sirve para
// binarios y tiene poco espacio. Si IndexedDB no está disponible, las funciones no hacen nada.

const DB_NAME = 'cesi-files'
const STORE = 'files'

let dbPromise = null

function openDb() {
  if (typeof indexedDB === 'undefined') return Promise.resolve(null)
  if (!dbPromise) {
    dbPromise = new Promise((resolve) => {
      const request = indexedDB.open(DB_NAME, 1)
      request.onupgradeneeded = () => request.result.createObjectStore(STORE)
      request.onsuccess = () => resolve(request.result)
      request.onerror = () => resolve(null)
    })
  }
  return dbPromise
}

function run(mode, fn) {
  return openDb().then(
    (db) =>
      new Promise((resolve, reject) => {
        if (!db) {
          resolve(undefined)
          return
        }
        const tx = db.transaction(STORE, mode)
        const request = fn(tx.objectStore(STORE))
        tx.oncomplete = () => resolve(request?.result)
        tx.onerror = () => reject(tx.error)
        tx.onabort = () => reject(tx.error)
      }),
  )
}

export function idbGet(key) {
  return run('readonly', (store) => store.get(key))
}

export function idbPut(key, value) {
  return run('readwrite', (store) => store.put(value, key))
}

export function idbDelete(key) {
  return run('readwrite', (store) => store.delete(key))
}

// Claves que empiezan por `prefix`.
export async function idbKeys(prefix) {
  const keys = (await run('readonly', (store) => store.getAllKeys())) || []
  return keys.filter((k) => typeof k === 'string' && k.startsWith(prefix))
}
