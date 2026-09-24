export const CATEGORY_OPTIONS = ['Reunión', 'Personal', 'Estudio', 'Cliente', 'Entrevista', 'Otro']

const CATEGORY_COLORS = {
  Reunión: '#2563eb',
  Personal: '#16a34a',
  Estudio: '#f59e0b',
  Cliente: '#db2777',
  Entrevista: '#7c3aed',
  Otro: '#6b7280',
}

const DEFAULT_COLOR = '#2563eb'
export const UNAVAILABLE_COLOR = '#6b7280'

// Opciones provisionales de una propuesta: gris, con borde discontinuo en las vistas.
export const PROVISIONAL_COLOR = '#94a3b8'

export function colorForEvent(event) {
  if (event.provisional && event.proposalId) return PROVISIONAL_COLOR
  if (event.isUnavailable) return UNAVAILABLE_COLOR
  return CATEGORY_COLORS[event.category] || DEFAULT_COLOR
}
