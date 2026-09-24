import { normalizeWeek } from './weeklySchedule'
import { writeJSON } from './store'

const STORAGE_KEY = 'cesi_working_hours_v1'

export { WEEKDAY_LABELS } from './weeklySchedule'

export function defaultWorkingHours() {
  return [0, 1, 2, 3, 4, 5, 6].map((day) => ({
    day,
    enabled: day >= 1 && day <= 5,
    slots: [{ start: '09:00', end: '18:00' }],
  }))
}

export function getWorkingHours() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return defaultWorkingHours()
    return normalizeWeek(JSON.parse(raw), defaultWorkingHours())
  } catch {
    return defaultWorkingHours()
  }
}

export function saveWorkingHours(workingHours) {
  writeJSON(STORAGE_KEY, workingHours)
}

export { STORAGE_KEY }
