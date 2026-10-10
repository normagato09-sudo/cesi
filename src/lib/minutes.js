import { format, isSameDay } from 'date-fns'
import { es } from 'date-fns/locale'
import { participantsOf } from './contacts'
import { noteBlocks } from './noteLists'
import { ME } from './tasks'

// «Enviar acta»: el acta de una sesión (agenda, notas, decisiones y tareas) en PDF, con un mensaje
// de plantilla (sin IA) para acompañarlo. El PDF lo dibuja minutesPdf.js; aquí solo los datos.

export const ORGANIZER_FALLBACK = 'Organizador'

const firstName = (name) => (name || '').trim().split(/\s+/)[0] || ''

// "Ana", "Ana y Luis", "Ana, Luis y Eva"
export function joinNames(names) {
  const list = names.filter(Boolean)
  if (list.length <= 1) return list[0] || ''
  return `${list.slice(0, -1).join(', ')} y ${list[list.length - 1]}`
}

// Asistentes: yo primero, «(convoca)» (salvo en las reuniones de «Yo no asisto»), y los
// participantes: contactos e invitados.
export function minutesAttendees(event, contacts, organizerName = '') {
  const { contacts: people, guests } = participantsOf(event, contacts)
  const list = [...people.map((c) => c.name), ...guests].filter((n) => (n || '').trim())
  if (event.notAttending) return list
  return [`${(organizerName || '').trim() || ORGANIZER_FALLBACK} (convoca)`, ...list]
}

// "martes, 14 de octubre de 2026 · 10:00 – 11:00"
export function minutesWhen(event) {
  const start = new Date(event.start)
  const end = new Date(event.end)
  const day = format(start, "EEEE, d 'de' MMMM 'de' yyyy", { locale: es })
  const time = isSameDay(start, end)
    ? `${format(start, 'HH:mm')} – ${format(end, 'HH:mm')}`
    : `${format(start, 'HH:mm')} – ${format(end, "d 'de' MMMM HH:mm", { locale: es })}`
  return `${day.charAt(0).toUpperCase()}${day.slice(1)} · ${time}`
}

// Responsable de una tarea en el acta: yo (con mi nombre) o el contacto.
function assigneeName(task, contacts, organizerName) {
  if (!task.assignee || task.assignee === ME) return (organizerName || '').trim() || 'Yo'
  return contacts.find((c) => c.id === task.assignee)?.name || 'Sin responsable'
}

/**
 * Todo lo que va en el PDF de una sesión. `session`: { agenda, notes, decisions } (sessionOf);
 * `tasks`: las tareas de esa sesión.
 */
export function minutesData({ event, session, contacts = [], tasks = [], organizerName = '' }) {
  return {
    title: (event.title || '').trim() || 'Reunión',
    when: minutesWhen(event),
    attendees: minutesAttendees(event, contacts, organizerName),
    agenda: session.agenda.filter((it) => it.text.trim()).map((it) => ({ text: it.text.trim(), done: !!it.done })),
    notes: noteBlocks(session.notes),
    decisions: session.decisions.map((d) => d.text.trim()).filter(Boolean),
    tasks: tasks.map((t) => ({
      title: t.title,
      assignee: assigneeName(t, contacts, organizerName),
      due: t.dueDate ? format(new Date(`${t.dueDate}T12:00:00`), 'dd/MM/yyyy') : 'Sin fecha',
      done: t.status === 'done',
    })),
  }
}

/**
 * Mensaje que acompaña al PDF (se puede editar antes de copiarlo):
 * "Hola, Ana y Luis. Os envío el acta de la reunión «Kickoff» del 14 de octubre. ¿Podéis
 * revisarla y decirme si está todo correcto? Gracias." (en singular si es una sola persona).
 */
export function minutesMessage(event, contacts = []) {
  const { contacts: people, guests } = participantsOf(event, contacts)
  const names = [...people.map((c) => firstName(c.name)), ...guests.map(firstName)].filter(Boolean)
  const title = (event.title || '').trim() || 'Reunión'
  const date = format(new Date(event.start), "d 'de' MMMM", { locale: es })
  const hello = names.length ? `Hola, ${joinNames(names)}.` : 'Hola.'
  if (names.length === 1) {
    return `${hello} Te envío el acta de la reunión «${title}» del ${date}. ¿Puedes revisarla y decirme si está todo correcto? Gracias.`
  }
  return `${hello} Os envío el acta de la reunión «${title}» del ${date}. ¿Podéis revisarla y decirme si está todo correcto? Gracias.`
}

// "Acta - Kickoff - 2026-10-14.pdf" (sin caracteres que no valen en un nombre de archivo).
export function minutesFileName(event) {
  const title = ((event.title || '').trim() || 'Reunión').replace(/[\\/:*?"<>|]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 80)
  return `Acta - ${title} - ${format(new Date(event.start), 'yyyy-MM-dd')}.pdf`
}

// "Acta enviada el 14 de octubre de 2026 a las 12:05"
export function minutesSentText(iso) {
  if (!iso) return ''
  return `Acta enviada el ${format(new Date(iso), "d 'de' MMMM 'de' yyyy 'a las' HH:mm", { locale: es })}`
}
