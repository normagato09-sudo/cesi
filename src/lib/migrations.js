import { readJSON, writeJSON } from './store'

// Marcas de las migraciones únicas de datos: { done: { [id]: fecha ISO } }. Se guardan en la
// tabla settings (id 'migrations'), así que sincronizan: una migración hecha en un dispositivo
// no se repite en los demás.
// Las migraciones solo se ejecutan cuando la app ya ha descargado los datos de la nube (o no
// hay sincronización), para no migrar datos locales antiguos y pisar los de la nube.

export const STORAGE_KEY = 'cesi_migrations_v1'

export const MIGRATIONS = {
  departments2026: 'departments-2026',
  categoriesToProjects: 'categories-to-projects',
}

function read() {
  const value = readJSON(STORAGE_KEY, null)
  return value && typeof value === 'object' && value.done && typeof value.done === 'object' ? value : { done: {} }
}

export function isMigrationDone(id) {
  return !!read().done[id]
}

export function markMigrationDone(id, now = new Date()) {
  const value = read()
  writeJSON(STORAGE_KEY, { ...value, done: { ...value.done, [id]: now.toISOString() } })
}
