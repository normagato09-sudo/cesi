// Utilidades de almacenamiento en localStorage para los datos de CESI.

export function readJSON(key, fallback) {
  try {
    const raw = localStorage.getItem(key)
    return raw ? JSON.parse(raw) : fallback
  } catch {
    return fallback
  }
}

export function writeJSON(key, value) {
  localStorage.setItem(key, JSON.stringify(value))
}

export function makeId(prefix = 'id') {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID()
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`
}

// Colección de documentos { id, ...datos, createdAt, updatedAt } guardada bajo una clave.
export function createCollection(key, { defaults = {}, prefix = 'id' } = {}) {
  const readAll = () => {
    const list = readJSON(key, [])
    return Array.isArray(list) ? list : []
  }

  return {
    key,
    getAll: readAll,
    create(data) {
      const list = readAll()
      const now = new Date().toISOString()
      const doc = { id: makeId(prefix), ...defaults, ...data, createdAt: now, updatedAt: now }
      list.push(doc)
      writeJSON(key, list)
      return doc
    },
    update(id, patch) {
      const list = readAll()
      const idx = list.findIndex((d) => d.id === id)
      if (idx === -1) throw new Error('Elemento no encontrado.')
      list[idx] = { ...list[idx], ...patch, id, updatedAt: new Date().toISOString() }
      writeJSON(key, list)
      return list[idx]
    },
    remove(id) {
      writeJSON(key, readAll().filter((d) => d.id !== id))
    },
    replaceAll(list) {
      writeJSON(key, list)
    },
  }
}
