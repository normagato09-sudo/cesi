const STORAGE_KEY = 'cesi_working_hours_v1'

// Índices como Date#getDay(): 0 = domingo ... 6 = sábado.
export const WEEKDAY_LABELS = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado']

export function defaultWorkingHours() {
  return [0, 1, 2, 3, 4, 5, 6].map((day) => ({
    day,
    enabled: day >= 1 && day <= 5,
    start: '09:00',
    end: '18:00',
  }))
}

export function getWorkingHours() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return defaultWorkingHours()
    const parsed = JSON.parse(raw)
    if (!Array.isArray(parsed) || parsed.length !== 7) return defaultWorkingHours()
    return parsed
  } catch {
    return defaultWorkingHours()
  }
}

export function saveWorkingHours(workingHours) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(workingHours))
}

// Devuelve { start: 'HH:mm', end: 'HH:mm' } | null si ese día de la semana no es habitual.
export function workingHoursForDay(workingHours, dayOfWeek) {
  const entry = workingHours.find((w) => w.day === dayOfWeek)
  return entry && entry.enabled ? { start: entry.start, end: entry.end } : null
}

export { STORAGE_KEY }
