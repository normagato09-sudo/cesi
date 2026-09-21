export const CATEGORY_OPTIONS = ['Reunión', 'Personal', 'Estudio', 'Cliente', 'Otro']

const CATEGORY_COLORS = {
  Reunión: '#2563eb',
  Personal: '#16a34a',
  Estudio: '#f59e0b',
  Cliente: '#db2777',
  Otro: '#6b7280',
}

const DEFAULT_COLOR = '#2563eb'
export const UNAVAILABLE_COLOR = '#6b7280'

export function colorForEvent(event) {
  if (event.isUnavailable) return UNAVAILABLE_COLOR
  return CATEGORY_COLORS[event.category] || DEFAULT_COLOR
}
