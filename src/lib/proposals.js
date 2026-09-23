import { createCollection } from './store'
import { SPAIN_ZONE, formatInZone, localTimeZone, sameClock, wallTime } from './timezones'

// Propuestas: varias opciones de horario para una misma reunión. Cada opción es una reunión
// provisional del calendario ({ provisional: true, proposalId }), que ocupa su hueco hasta que
// se confirma una o se cancela la propuesta.
//
// Propuesta: { id, title, durationMinutes, category, tags, participantIds, guests, createdAt, updatedAt }

export const STORAGE_KEY = 'cesi_proposals_v1'

export const proposalsStore = createCollection(STORAGE_KEY, { prefix: 'prop' })

export const MIN_OPTIONS = 2
export const MAX_OPTIONS = 5

export function getAllProposals() {
  return proposalsStore.getAll()
}

export function isProvisional(event) {
  return !!event?.provisional && !!event.proposalId
}

// Opciones (reuniones provisionales) de una propuesta, ordenadas por fecha.
export function optionsOf(proposal, rawEvents) {
  return rawEvents
    .filter((ev) => ev.proposalId === proposal.id && ev.provisional)
    .map((ev) => ({ ...ev, start: new Date(ev.start), end: new Date(ev.end) }))
    .sort((a, b) => a.start - b.start)
}

// Caducada: todas sus opciones ya han pasado (o ya no le queda ninguna).
export function isExpired(options, now = new Date()) {
  return options.every((o) => o.end <= now)
}

// ---------------------------------------------------------------------------
// Mensaje para enviar
// ---------------------------------------------------------------------------

// "1 hora", "30 minutos", "1 hora y 30 minutos", "2 horas"
export function formatDurationLong(minutes) {
  const h = Math.floor(minutes / 60)
  const m = minutes % 60
  const hours = h === 1 ? '1 hora' : `${h} horas`
  if (h === 0) return `${m} minutos`
  if (m === 0) return hours
  return `${hours} y ${m} minutos`
}

function timeText(date, timeZone) {
  const w = wallTime(date, timeZone)
  const hhmm = `${String(w.hour).padStart(2, '0')}:${String(w.minute).padStart(2, '0')}`
  // "a la 01:30" pero "a las 10:00"
  return `${w.hour === 1 ? 'a la' : 'a las'} ${hhmm}`
}

// "martes 30 de septiembre a las 10:00", en la zona indicada.
function optionText(start, timeZone) {
  const weekday = formatInZone(start, timeZone, { weekday: 'long' })
  const month = formatInZone(start, timeZone, { month: 'long' })
  return `${weekday} ${wallTime(start, timeZone).day} de ${month} ${timeText(start, timeZone)}`
}

function joinOptions(parts) {
  if (parts.length <= 1) return parts[0] || ''
  return `${parts.slice(0, -1).join(', ')} o ${parts[parts.length - 1]}`
}

// Destinatario principal: el primer contacto de la propuesta (o el primer invitado suelto).
export function proposalRecipient(proposal, contacts) {
  const contact = (proposal.participantIds || []).map((id) => contacts.find((c) => c.id === id)).find(Boolean)
  if (contact) return { name: contact.name, contact }
  if (proposal.guests?.length) return { name: proposal.guests[0], contact: null }
  return { name: '', contact: null }
}

/**
 * "Hola Ana, te propongo estas opciones para Revisión del proyecto (1 hora): martes 30 de
 * septiembre a las 10:00, miércoles 1 de octubre a las 16:30 o jueves 2 de octubre a las 11:00.
 * ¿Cuál te viene mejor?"
 * Si el contacto tiene otra zona horaria, las horas van en su hora local con la de España
 * entre paréntesis.
 */
export function buildProposalMessage(proposal, options, contacts, { myZone = localTimeZone() } = {}) {
  const { name, contact } = proposalRecipient(proposal, contacts)
  const firstName = name.includes('@') ? '' : name.split(' ')[0]
  const greeting = firstName ? `Hola ${firstName},` : 'Hola,'
  const theirZone = contact?.timeZone || null
  const referenceZone = myZone || SPAIN_ZONE

  const parts = options.map((o) => {
    const start = new Date(o.start)
    if (theirZone && !sameClock(start, theirZone, referenceZone)) {
      const spain = timeText(start, referenceZone).replace(/^a las? /, '')
      return `${optionText(start, theirZone)} (${spain} en España)`
    }
    return optionText(start, referenceZone)
  })

  const duration = formatDurationLong(proposal.durationMinutes)
  return `${greeting} te propongo estas opciones para ${proposal.title} (${duration}): ${joinOptions(parts)}. ¿Cuál te viene mejor?`
}

// Todo lo que necesita el bloque de compartir: texto, asunto, teléfono y email del destinatario.
export function proposalShareData(proposal, options, contacts) {
  const { name, contact } = proposalRecipient(proposal, contacts)
  return {
    text: buildProposalMessage(proposal, options, contacts),
    subject: `Opciones para ${proposal.title}`,
    phone: contact?.phone || '',
    email: contact?.email || (name.includes('@') ? name : ''),
  }
}

// ---------------------------------------------------------------------------
// Enlaces para enviar
// ---------------------------------------------------------------------------

// Enlace de WhatsApp con el texto; con el teléfono del contacto si lo tiene (solo dígitos,
// con prefijo internacional; si empieza por 00 se quita).
export function whatsappUrl(text, phone) {
  let digits = (phone || '').replace(/\D/g, '')
  if (digits.startsWith('00')) digits = digits.slice(2)
  const base = digits ? `https://wa.me/${digits}` : 'https://wa.me/'
  return `${base}?text=${encodeURIComponent(text)}`
}

export function mailtoUrl(text, email, subject) {
  const params = `subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(text)}`
  return `mailto:${email ? encodeURIComponent(email).replace('%40', '@') : ''}?${params}`
}
