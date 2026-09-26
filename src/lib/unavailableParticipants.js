import { addDays } from 'date-fns'
import { expandEvents } from './recurrence'
import { STATUS, participantEntries } from './participants'

// Participantes que no pueden según su disponibilidad habitual (el mismo cálculo que el
// indicador del componente Participant). Quien no tiene disponibilidad apuntada no cuenta.
//
// Reunión (o día de una serie) guardada con "Guardar igualmente": acceptedUnavailable =
// [ids de los contactos que no podían]. Esos ya no vuelven a salir en "Pendientes"; si deja de
// poder otra persona, sí.

export const PENDING_DAYS = 60

const firstName = (name) => name.split(' ')[0] || name

// Contactos de la reunión que no pueden en [start, end): [{ contact, name, reason }].
export function cannotAttend(meeting, contacts, start = meeting.start, end = meeting.end, myZone) {
  if (!meeting || meeting.isUnavailable || meeting.allDay || !start || !end) return []
  return participantEntries(meeting, contacts, new Date(start), new Date(end), myZone)
    .filter((e) => e.contact && e.status === STATUS.CANNOT)
    .map((e) => ({ contact: e.contact, name: firstName(e.name), reason: e.reason }))
}

// "No pueden según su disponibilidad: Ana (jueves solo por la mañana), Luis (…)"
export function unavailableMessage(people) {
  const list = people.map((p) => (p.reason ? `${p.name} (${p.reason})` : p.name)).join(', ')
  return `${people.length === 1 ? 'No puede' : 'No pueden'} según su disponibilidad: ${list}`
}

/**
 * Aviso al guardar una reunión (mismo formato que los de reglas y margen), o null si todos
 * pueden: { type: 'participants', message, contactIds }.
 */
export function unavailableWarning(meeting, contacts, myZone) {
  const people = cannotAttend(meeting, contacts, meeting.start, meeting.end, myZone)
  if (people.length === 0) return null
  return { type: 'participants', message: unavailableMessage(people), contactIds: people.map((p) => p.contact.id) }
}

/**
 * "Pendientes": reuniones de los próximos `days` días con participantes que no pueden (sin contar
 * los que ya se aceptaron al guardar). Una entrada por reunión o serie, con su primer día afectado:
 * [{ occurrence, people, message, count }], de la más próxima a la más lejana.
 */
export function meetingsWithUnavailable(rawEvents, contacts, now = new Date(), { days = PENDING_DAYS, myZone } = {}) {
  const meetings = rawEvents.filter((ev) => !ev.isUnavailable && !ev.provisional && (ev.participantIds?.length || ev.participants?.length))
  const bySeries = new Map()
  for (const occurrence of expandEvents(meetings, now, addDays(now, days)).sort((a, b) => a.start - b.start)) {
    if (occurrence.start < now) continue
    const accepted = new Set(occurrence.acceptedUnavailable || [])
    const people = cannotAttend(occurrence, contacts, occurrence.start, occurrence.end, myZone).filter((p) => !accepted.has(p.contact.id))
    if (people.length === 0) continue
    const found = bySeries.get(occurrence.seriesId)
    if (found) found.count++
    else bySeries.set(occurrence.seriesId, { occurrence, people, message: unavailableMessage(people), count: 1 })
  }
  return [...bySeries.values()]
}
