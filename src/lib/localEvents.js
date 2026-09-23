const STORAGE_KEY = 'cesi_events_v1'

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

function writeAll(events) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(events))
}

function makeId() {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID()
  return `evt_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`
}

export function getAllEvents() {
  return readAll()
}

export function createEvent(data) {
  const events = readAll()
  const now = new Date().toISOString()
  const event = {
    id: makeId(),
    title: '',
    description: '',
    participants: [],
    meetLink: '',
    category: 'Reunión',
    tags: [],
    isUnavailable: false,
    allDay: false,
    recurrence: null,
    ...data,
    createdAt: now,
    updatedAt: now,
  }
  events.push(event)
  writeAll(events)
  return event
}

export function updateEvent(id, patch) {
  const events = readAll()
  const idx = events.findIndex((e) => e.id === id)
  if (idx === -1) throw new Error('Evento no encontrado.')
  events[idx] = { ...events[idx], ...patch, id: events[idx].id, updatedAt: new Date().toISOString() }
  writeAll(events)
  return events[idx]
}

export function deleteEvent(id) {
  writeAll(readAll().filter((e) => e.id !== id))
}

export { STORAGE_KEY }
