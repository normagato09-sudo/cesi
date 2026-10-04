import { readJSON, writeJSON } from './store'

const STORAGE_KEY = 'cesi_preferences_v1'

const BUFFER_OPTIONS = [0, 5, 10, 15, 30]

// Ya no hay preferencias que se usen; se conservan las guardadas (en la sincronización y las
// copias) para no perderlas:
// bufferMinutes: margen entre reuniones (ya no se aplica).
// reminders: aviso por defecto de los recordatorios, que ya no existen ({ defaultMinutes, timeZone }).
export function defaultPreferences() {
  return { bufferMinutes: 0 }
}

export function getPreferences() {
  const stored = readJSON(STORAGE_KEY, {})
  const prefs = { ...defaultPreferences(), ...(stored && typeof stored === 'object' ? stored : {}) }
  if (!BUFFER_OPTIONS.includes(prefs.bufferMinutes)) prefs.bufferMinutes = 0
  return prefs
}

export function savePreferences(prefs) {
  writeJSON(STORAGE_KEY, prefs)
}

export { STORAGE_KEY }
