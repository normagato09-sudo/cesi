import { readJSON, writeJSON } from './store'
import { normalizeDefaultMinutes, DEFAULT_REMINDER_MINUTES } from './reminders'

const STORAGE_KEY = 'cesi_preferences_v1'

export const BUFFER_OPTIONS = [0, 5, 10, 15, 30]

// reminders: aviso por defecto antes de cada reunión y zona horaria en la que el servidor
// calcula los avisos (la del último dispositivo que cambió los ajustes de recordatorios).
export function defaultPreferences() {
  return { bufferMinutes: 0, reminders: { defaultMinutes: DEFAULT_REMINDER_MINUTES, timeZone: null } }
}

export function getPreferences() {
  const stored = readJSON(STORAGE_KEY, {})
  const prefs = { ...defaultPreferences(), ...(stored && typeof stored === 'object' ? stored : {}) }
  if (!BUFFER_OPTIONS.includes(prefs.bufferMinutes)) prefs.bufferMinutes = 0
  const reminders = prefs.reminders && typeof prefs.reminders === 'object' ? prefs.reminders : {}
  prefs.reminders = {
    defaultMinutes: normalizeDefaultMinutes(reminders.defaultMinutes),
    timeZone: typeof reminders.timeZone === 'string' ? reminders.timeZone : null,
  }
  return prefs
}

export function savePreferences(prefs) {
  writeJSON(STORAGE_KEY, prefs)
}

export { STORAGE_KEY }
