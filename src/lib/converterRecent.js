import { readJSON, writeJSON } from './store'
import { findZone } from './timezones'

// Últimos países usados en el conversor (accesos rápidos). Es una comodidad de este dispositivo.
const STORAGE_KEY = 'cesi_converter_recent_v1'
const MAX_RECENT = 5

export function getRecentZones() {
  const list = readJSON(STORAGE_KEY, [])
  return Array.isArray(list) ? list.filter((r) => r && findZone(r.timeZone)).slice(0, MAX_RECENT) : []
}

// Guarda el país al principio de la lista (uno por país) y devuelve la lista nueva.
export function rememberZone(value) {
  const list = [value, ...getRecentZones().filter((r) => r.country !== value.country)].slice(0, MAX_RECENT)
  try {
    writeJSON(STORAGE_KEY, list)
  } catch {
    // Sin almacenamiento disponible: los recientes solo duran esta sesión.
  }
  return list
}
