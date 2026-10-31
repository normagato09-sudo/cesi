import { addDays, addMonths, addWeeks, format, subDays, subMonths, subWeeks } from 'date-fns'
import { es } from 'date-fns/locale'
import { COMPACT_WEEK_DAYS } from './dateHelpers'

// Navegación del calendario (el mismo para la ceo, el equipo y los alumnos): título de la
// cabecera, anterior / siguiente y la vista (Mes, Semana, Día) que cada uno eligió la última vez
// en este dispositivo.

export const VIEW_KEY = 'cesi_calendar_view_v1'
const VIEWS = ['month', 'week', 'day']

export function readView(fallback = 'month') {
  try {
    const v = localStorage.getItem(VIEW_KEY)
    return VIEWS.includes(v) ? v : fallback
  } catch {
    return fallback
  }
}

export function writeView(view) {
  try {
    if (VIEWS.includes(view)) localStorage.setItem(VIEW_KEY, view)
  } catch {
    // Sin localStorage, la vista no se recuerda.
  }
}

function formatCompactRange(start, end) {
  if (start.getFullYear() !== end.getFullYear()) {
    return `${format(start, 'd MMM yyyy', { locale: es })} – ${format(end, 'd MMM yyyy', { locale: es })}`
  }
  if (start.getMonth() !== end.getMonth()) {
    return `${format(start, 'd MMM', { locale: es })} – ${format(end, 'd MMM yyyy', { locale: es })}`
  }
  return `${format(start, 'd')}–${format(end, 'd MMM yyyy', { locale: es })}`
}

export function headerLabel(currentDate, view, compactWeek) {
  if (view === 'week' && compactWeek) return formatCompactRange(currentDate, addDays(currentDate, COMPACT_WEEK_DAYS - 1))
  if (view === 'day') return format(currentDate, "EEEE, d 'de' MMMM 'de' yyyy", { locale: es })
  if (view === 'week') return format(currentDate, "'Semana del' d 'de' MMMM yyyy", { locale: es })
  return format(currentDate, 'MMMM yyyy', { locale: es })
}

// Fecha al pulsar anterior (dir -1) o siguiente (dir 1).
export function stepDate(date, view, compactWeek, dir) {
  if (view === 'month') return dir > 0 ? addMonths(date, 1) : subMonths(date, 1)
  if (view === 'week' && compactWeek) return dir > 0 ? addDays(date, COMPACT_WEEK_DAYS) : subDays(date, COMPACT_WEEK_DAYS)
  if (view === 'week') return dir > 0 ? addWeeks(date, 1) : subWeeks(date, 1)
  return dir > 0 ? addDays(date, 1) : subDays(date, 1)
}
