import { SPAIN_ZONE, findCountry } from './timezones'

const STORAGE_KEY = 'cesi_contacts_v1'

// Los contactos antiguos sin país pasan a España (península) y quedan marcados como
// "País sin revisar" hasta que se guarden desde el formulario.
export function migrateContacts(list) {
  let changed = false
  const out = list.map((c) => {
    if (c.country && c.timeZone) return c
    changed = true
    return { ...c, country: 'ES', timeZone: SPAIN_ZONE, countryUnreviewed: true }
  })
  return { contacts: out, changed }
}

function readAll() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw)
    if (!Array.isArray(parsed)) return []
    const { contacts, changed } = migrateContacts(parsed)
    if (changed) writeAll(contacts)
    return contacts
  } catch {
    return []
  }
}

// El país (y su zona horaria) es obligatorio. Devuelve un mensaje de error o null.
export function validateContactCountry({ country, timeZone }) {
  const found = country ? findCountry(country) : null
  if (!found) return 'El país es obligatorio.'
  if (!timeZone || !found.zones.some((z) => z.id === timeZone)) {
    return `Elige la ciudad o zona horaria de ${found.name}.`
  }
  return null
}

function writeAll(contacts) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(contacts))
}

function makeId() {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID()
  return `ctc_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`
}

export function getAllContacts() {
  return readAll().sort((a, b) => (a.name || '').localeCompare(b.name || '', 'es', { sensitivity: 'base' }))
}

export function createContact(data) {
  const problem = validateContactCountry(data)
  if (problem) throw new Error(problem)
  const contacts = readAll()
  const now = new Date().toISOString()
  const contact = {
    id: makeId(),
    name: '',
    email: '',
    phone: '',
    organization: '',
    role: '',
    notes: '',
    country: '',
    timeZone: '',
    ...data,
    createdAt: now,
    updatedAt: now,
  }
  contacts.push(contact)
  writeAll(contacts)
  return contact
}

export function updateContact(id, patch) {
  const contacts = readAll()
  const idx = contacts.findIndex((c) => c.id === id)
  if (idx === -1) throw new Error('Contacto no encontrado.')
  const next = { ...contacts[idx], ...patch, id: contacts[idx].id, updatedAt: new Date().toISOString() }
  const problem = validateContactCountry(next)
  if (problem) throw new Error(problem)
  contacts[idx] = next
  writeAll(contacts)
  return contacts[idx]
}

export function deleteContact(id) {
  writeAll(readAll().filter((c) => c.id !== id))
}

export function contactInitials(name) {
  const words = (name || '').trim().split(/\s+/).filter(Boolean)
  if (words.length === 0) return '?'
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase()
  return (words[0][0] + words[words.length - 1][0]).toUpperCase()
}

function normalize(text) {
  return (text || '')
    .toString()
    .toLocaleLowerCase('es')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
}

export function contactMatches(contact, query) {
  const q = normalize(query)
  if (!q) return true
  return [contact.name, contact.email, contact.organization, contact.role].some((field) => normalize(field).includes(q))
}

// Resuelve los participantes de un evento: contactos (por id) e invitados sueltos.
// Eventos antiguos sin participantIds: se empareja cada nombre de `participants` con un
// contacto por nombre o email (sin distinguir mayúsculas); los que no coinciden son invitados.
export function participantsOf(event, contacts) {
  const byId = new Map(contacts.map((c) => [c.id, c]))

  if (Array.isArray(event.participantIds)) {
    return {
      contacts: event.participantIds.map((id) => byId.get(id)).filter(Boolean),
      guests: Array.isArray(event.guests) ? event.guests : [],
    }
  }

  const matched = []
  const guests = []
  for (const raw of event.participants || []) {
    const key = normalize(raw)
    const contact = contacts.find((c) => normalize(c.name) === key || (c.email && normalize(c.email) === key))
    if (contact) {
      if (!matched.includes(contact)) matched.push(contact)
    } else {
      guests.push(raw)
    }
  }
  return { contacts: matched, guests }
}

// Con participantIds se usa el id; el emparejamiento por nombre/email queda solo para eventos antiguos.
export function eventIncludesContact(event, contact, contacts) {
  if (Array.isArray(event.participantIds)) return event.participantIds.includes(contact.id)
  return participantsOf(event, contacts).contacts.some((c) => c.id === contact.id)
}

export function isEmail(text) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test((text || '').trim())
}

// Datos iniciales de un contacto creado a partir de un texto libre (nombre o email).
export function contactDataFromText(text) {
  const value = (text || '').trim()
  if (isEmail(value)) return { name: value.split('@')[0], email: value }
  return { name: value }
}

// Campos de participantes que se guardan en el evento. `participants` es una copia con los
// nombres de todos para compatibilidad (p. ej. DayEventsModal usa participants.length).
export function participantFields(selectedContacts, guests) {
  return {
    participantIds: selectedContacts.map((c) => c.id),
    guests: [...guests],
    participants: [...selectedContacts.map((c) => c.name), ...guests],
  }
}

export { STORAGE_KEY }
