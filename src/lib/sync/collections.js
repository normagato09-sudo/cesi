import { readJSON, removeKey, writeJSON } from '../store'
import { STORAGE_KEY as EVENTS_KEY } from '../localEvents'
import { STORAGE_KEY as CONTACTS_KEY } from '../contacts'
import { STORAGE_KEY as GROUPS_KEY } from '../groups'
import { STORAGE_KEY as RULES_KEY } from '../rules'
import { STORAGE_KEY as PROPOSALS_KEY } from '../proposals'
import { STORAGE_KEY as WORKING_HOURS_KEY } from '../availability'
import { STORAGE_KEY as PREFERENCES_KEY } from '../preferences'
import { AREAS_KEY } from '../team'
import { STORAGE_KEY as WEEKLY_AVAILABILITY_KEY } from '../weeklyAvailability'
import { STORAGE_KEY as PROJECTS_KEY } from '../projects'
import { STORAGE_KEY as VACANCIES_KEY } from '../vacancies'

// Qué se sincroniza y dónde vive en cada lado.
// - Listas (kind 'list'): una fila por documento { id, ... } de la lista guardada en `key`.
// - Ajustes (tabla settings): una fila por clave de localStorage con un único documento.
export const LIST_COLLECTIONS = [
  { table: 'events', key: EVENTS_KEY },
  { table: 'contacts', key: CONTACTS_KEY },
  { table: 'groups', key: GROUPS_KEY },
  { table: 'rules', key: RULES_KEY },
  { table: 'proposals', key: PROPOSALS_KEY },
  { table: 'weekly_availability', key: WEEKLY_AVAILABILITY_KEY },
  { table: 'projects', key: PROJECTS_KEY },
  { table: 'vacancies', key: VACANCIES_KEY },
]

export const SETTINGS_TABLE = 'settings'

export const SETTINGS = [
  { id: 'working_hours', key: WORKING_HOURS_KEY },
  { id: 'preferences', key: PREFERENCES_KEY },
  { id: 'team_areas', key: AREAS_KEY },
]

export const TABLES = [...LIST_COLLECTIONS.map((c) => c.table), SETTINGS_TABLE]

export const SYNCED_KEYS = [...LIST_COLLECTIONS.map((c) => c.key), ...SETTINGS.map((s) => s.key)]

// Documentos locales de una tabla: Map id → documento.
export function readLocalTable(table) {
  const docs = new Map()
  if (table === SETTINGS_TABLE) {
    for (const { id, key } of SETTINGS) {
      const value = readJSON(key, null)
      if (value !== null && value !== undefined) docs.set(id, value)
    }
    return docs
  }
  const { key } = LIST_COLLECTIONS.find((c) => c.table === table)
  const list = readJSON(key, [])
  for (const doc of Array.isArray(list) ? list : []) {
    if (doc && doc.id) docs.set(doc.id, doc)
  }
  return docs
}

// Guarda en localStorage los documentos de una tabla sin avisar a la sincronización
// (vienen de la nube). Devuelve las claves de localStorage que han cambiado.
export function writeLocalTable(table, docs) {
  if (table === SETTINGS_TABLE) {
    const keys = []
    for (const { id, key } of SETTINGS) {
      if (docs.has(id)) writeJSON(key, docs.get(id), { silent: true })
      else removeKey(key, { silent: true })
      keys.push(key)
    }
    return keys
  }
  const { key } = LIST_COLLECTIONS.find((c) => c.table === table)
  writeJSON(key, [...docs.values()], { silent: true })
  return [key]
}

export function localHasData() {
  return TABLES.some((table) => readLocalTable(table).size > 0)
}
