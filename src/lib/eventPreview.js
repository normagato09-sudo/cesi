import { format } from 'date-fns'
import { es } from 'date-fns/locale'
import { participantsOf } from './contacts'
import { STATUS_LABELS } from './sharedCalendar'
import { allDayRangeText, eventTitle } from './unavailableKinds'

// Contenido de la tarjeta rápida del calendario (EventPreview.jsx) para cualquier cosa del
// calendario: mis eventos y reuniones, las reuniones compartidas y las clases. Solo con lo que ya
// trae cada una (lo mismo que se ve al abrirla).

export const DESCRIPTION_MAX = 140

// «Lucas», «Lucas y Ana», «Lucas, Ana y 5 más».
export function namesLine(names, max = 2) {
  const list = names.map((n) => (n || '').trim()).filter(Boolean)
  if (list.length === 0) return ''
  if (list.length === 1) return list[0]
  if (list.length <= max) return `${list.slice(0, -1).join(', ')} y ${list.at(-1)}`
  const rest = list.length - max
  return `${list.slice(0, max).join(', ')} y ${rest} más`
}

// «Lun 9 nov · 16:00–17:00» (las horas ya vienen en la zona de quien mira).
export function whenText(event) {
  if (event.allDay) {
    const text = allDayRangeText(event)
    return text.charAt(0).toUpperCase() + text.slice(1)
  }
  const day = format(event.start, 'EEE d MMM', { locale: es }).replace('.', '')
  return `${day.charAt(0).toUpperCase()}${day.slice(1)} · ${format(event.start, 'HH:mm')}–${format(event.end, 'HH:mm')}`
}

// El principio de un texto, sin cortar a mitad de palabra si se puede.
export function shortText(text, max = DESCRIPTION_MAX) {
  const clean = String(text || '').replace(/\s+/g, ' ').trim()
  if (clean.length <= max) return clean
  const cut = clean.slice(0, max)
  const space = cut.lastIndexOf(' ')
  return `${(space > max * 0.6 ? cut.slice(0, space) : cut).trim()}…`
}

const CLASS_ANSWER = { yes: 'Irás', no: 'No podrás ir' }

/**
 * { title, when, people, answers: [{ name, status, label }], mine (mi respuesta), link, location,
 * description, lines (líneas extra: profesor de la clase…) } de un elemento del calendario.
 * contacts: mis contactos (para mis eventos). meId: mi cuenta (para «Tú» en las respuestas).
 */
export function previewContent(event, { contacts = [], meId = null } = {}) {
  const out = { title: eventTitle(event) || 'Sin título', when: whenText(event), people: '', answers: [], mine: '', link: '', location: '', description: '', lines: [] }
  const meeting = event.sharedMeeting || (event.item?.kind === 'meeting' ? event.item.meeting : null)
  const cls = event.item?.kind === 'class' ? event.item.cls : null

  if (meeting) {
    const people = meeting.participants || []
    out.people = namesLine(people.filter((p) => p.id !== meId).map((p) => p.name))
    out.answers = people.map((p) => ({ name: p.id === meId ? 'Tú' : p.name, status: p.status, label: STATUS_LABELS[p.status] || p.status }))
    out.mine = STATUS_LABELS[meeting.my_status] || ''
    out.link = meeting.link || ''
    out.description = shortText(meeting.description)
    if (meeting.organizer_name && meeting.organizer_id !== meId) out.lines.push(`Organiza: ${meeting.organizer_name}`)
    return out
  }
  if (cls) {
    if (cls.teacher_name) out.lines.push(`Profesor: ${cls.teacher_name}`)
    if (cls.kind === 'alumno' && CLASS_ANSWER[cls.my_status]) out.mine = CLASS_ANSWER[cls.my_status]
    out.description = shortText(cls.note)
    return out
  }
  if (!event.isUnavailable) {
    const { contacts: people, guests } = participantsOf(event, contacts)
    out.people = namesLine([...people.map((c) => c.name), ...guests])
  }
  out.link = event.meetLink || ''
  out.location = event.location || ''
  out.description = shortText(event.description)
  return out
}

// ¿Es un enlace que se puede abrir? (solo http/https)
export function safeLink(url) {
  try {
    const u = new URL(url)
    return u.protocol === 'https:' || u.protocol === 'http:' ? u.href : ''
  } catch {
    return ''
  }
}
