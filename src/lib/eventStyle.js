// Color de las reuniones en el calendario y en las listas. Sin categorías, todas van en azul;
// la categoría que guardan las reuniones antiguas ya no cambia el color.
export const MEETING_COLOR = '#2563eb'
export const UNAVAILABLE_COLOR = '#6b7280'

// Opciones provisionales de una propuesta: gris, con borde discontinuo en las vistas.
export const PROVISIONAL_COLOR = '#94a3b8'

// Reuniones del calendario compartido (no son mis eventos: vienen de shared_meetings).
export const SHARED_COLOR = '#7c3aed'
export const SHARED_LABEL = 'Compartida'

export function colorForEvent(event) {
  if (event.shared) return SHARED_COLOR
  if (event.provisional && event.proposalId) return PROVISIONAL_COLOR
  if (event.isUnavailable) return UNAVAILABLE_COLOR
  return MEETING_COLOR
}
