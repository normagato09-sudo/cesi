const STORAGE_KEY = 'cesi_contacts_v1'

function readAll() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
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
  contacts[idx] = { ...contacts[idx], ...patch, id: contacts[idx].id, updatedAt: new Date().toISOString() }
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
    .replace(/[̀-ͯ]/g, '')
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
