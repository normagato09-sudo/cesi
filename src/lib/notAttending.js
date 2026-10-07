import { participantsOf } from './contacts'
import { contactZone } from './contactAvailability'
import { meetingWhen } from './meetingWhen'
import { formatDurationLong } from './proposals'
import { RECURRENCE_LABELS } from './recurrence'
import { sessionOf } from './meetingSession'
import { localTimeZone } from './timezones'

// Reuniones que organizo para que otras personas se reúnan entre ellas ("Yo no asisto",
// events.data.notAttending = true). Están en mi calendario, atenuadas y con la etiqueta
// "Organizada por mí", pero no son tiempo mío: no cuentan en el Resumen ni en el Inicio, no
// ocupan mis huecos ni chocan con mis reuniones. El acta y las tareas funcionan igual que en
// las demás.

export const NOT_ATTENDING_LABEL = 'Organizada por mí'

export function isNotAttending(ev) {
  return !!ev?.notAttending
}

// ---------------------------------------------------------------------------
// Reuniones de los participantes (para buscar hueco sin mi calendario)
// ---------------------------------------------------------------------------

const normalizeGuest = (g) => String(g || '').trim().toLowerCase()

/**
 * ¿Participa alguno de `attendees` ({ participantIds, guests }) en la reunión? Solo se conocen las
 * reuniones de mi calendario en las que aparecen (incluidas las que organizo sin asistir).
 */
export function involvesAttendees(ev, attendees, contacts = []) {
  if (ev.isUnavailable) return false
  const ids = new Set(attendees?.participantIds || [])
  const guests = new Set((attendees?.guests || []).map(normalizeGuest))
  if (ids.size === 0 && guests.size === 0) return false
  const { contacts: people, guests: theirGuests } = participantsOf(ev, contacts)
  return people.some((c) => ids.has(c.id)) || theirGuests.some((g) => guests.has(normalizeGuest(g)))
}

// ---------------------------------------------------------------------------
// Mensaje de convocatoria (plantilla, sin IA)
// ---------------------------------------------------------------------------

function firstNameOf(name) {
  const value = String(name || '').trim()
  if (!value || value.includes('@')) return ''
  return value.split(/\s+/)[0]
}

function joinNames(names) {
  if (names.length <= 1) return names[0] || ''
  return `${names.slice(0, -1).join(', ')} y ${names[names.length - 1]}`
}

const isUrl = (text) => /^(https?:\/\/|www\.)/i.test(text)

// "a las 10:00" pero "a la 01:00"
const atTime = (time) => `${time.startsWith('01:') ? 'a la' : 'a las'} ${time}`

/**
 * Texto de la convocatoria de una reunión (u ocurrencia, con start/end como fechas):
 * saludo con los nombres, motivo, fecha, hora, duración, enlace o lugar y agenda.
 */
export function convocationMessage(occurrence, contacts, { myZone = localTimeZone() } = {}) {
  const { contacts: people, guests } = participantsOf(occurrence, contacts)
  const names = [...people.map((c) => firstNameOf(c.name)), ...guests.map(firstNameOf)].filter(Boolean)
  const many = people.length + guests.length > 1
  const title = (occurrence.title || '').trim() || 'la reunión'

  const lines = []
  lines.push(names.length ? `Hola, ${joinNames(names)}:` : many ? 'Hola a todos:' : 'Hola:')
  lines.push('')
  lines.push(
    many
      ? `Os escribo para convocaros a una reunión entre vosotros sobre «${title}».`
      : `Te escribo para convocarte a una reunión sobre «${title}».`,
  )
  const description = (occurrence.description || '').trim()
  if (description) {
    lines.push('')
    lines.push(description)
  }

  const start = new Date(occurrence.start)
  const end = new Date(occurrence.end)
  const { day, time, place } = meetingWhen(start, myZone)
  lines.push('')
  lines.push(`Fecha: ${day}`)
  if (!occurrence.allDay) {
    lines.push(`Hora: ${time} (hora de ${place})`)
    // Quien tenga otra zona horaria, con su hora local.
    const local = []
    for (const c of people) {
      const theirs = meetingWhen(start, contactZone(c))
      if (theirs.time !== time || theirs.day !== day) {
        local.push(`${firstNameOf(c.name) || c.name}, ${atTime(theirs.time)} en ${theirs.place}${theirs.day !== day ? ` (${theirs.day})` : ''}`)
      }
    }
    if (local.length) lines.push(`Hora local: ${local.join('; ')}`)
    lines.push(`Duración: ${formatDurationLong(Math.max(0, Math.round((end - start) / 60000)))}`)
  }
  if (occurrence.recurrence?.freq && RECURRENCE_LABELS[occurrence.recurrence.freq]) {
    lines.push(`Se repite: ${RECURRENCE_LABELS[occurrence.recurrence.freq].toLowerCase()}`)
  }
  const where = (occurrence.meetLink || '').trim()
  if (where) lines.push(`${isUrl(where) ? 'Enlace' : 'Lugar'}: ${where}`)

  const agenda = sessionOf(occurrence).agenda.map((item) => item.text.trim()).filter(Boolean)
  if (agenda.length) {
    lines.push('')
    lines.push('Agenda:')
    agenda.forEach((text, i) => lines.push(`${i + 1}. ${text}`))
  }

  lines.push('')
  lines.push(many ? 'Si tenéis cualquier duda, me decís.' : 'Si tienes cualquier duda, me dices.')
  lines.push('Un saludo.')
  return lines.join('\n')
}

// Texto, asunto, teléfono (solo si hay un único contacto) y emails de todos para compartir.
export function convocationShareData(occurrence, contacts, { myZone } = {}) {
  const { contacts: people, guests } = participantsOf(occurrence, contacts)
  const emails = [...people.map((c) => (c.email || '').trim()), ...guests.filter((g) => g.includes('@')).map((g) => g.trim())].filter(Boolean)
  const { day } = meetingWhen(new Date(occurrence.start), myZone || localTimeZone())
  return {
    text: convocationMessage(occurrence, contacts, { myZone }),
    subject: `Convocatoria: ${(occurrence.title || '').trim() || 'reunión'} (${day})`,
    phone: people.length === 1 && guests.length === 0 ? people[0].phone || '' : '',
    email: [...new Set(emails)].join(','),
  }
}
