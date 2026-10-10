import { getPreferences, savePreferences } from './preferences'

// Dónde se hace una reunión (sin APIs): mis salas fijas de Zoom, Google Meet y Teams (enlaces que
// guardo una vez, en preferences.videoRooms, que sincroniza) y Jitsi Meet, que no necesita cuenta:
// cada reunión tiene su propio enlace https://meet.jit.si/CESI-<aleatorio>. O presencial / por
// teléfono, sin enlace.
// En el enlace de reservas elijo qué opciones se ofrecen (booking_links.video_options) y quien
// reserva elige una (booking_requests.meeting_place); al aceptar, su reunión lleva el enlace que toca.

export const PLACES = [
  { id: 'zoom', label: 'Zoom', short: 'Zoom' },
  { id: 'meet', label: 'Google Meet', short: 'Meet' },
  { id: 'teams', label: 'Microsoft Teams', short: 'Teams' },
  { id: 'jitsi', label: 'Jitsi Meet', short: 'Jitsi' },
  { id: 'in_person', label: 'Presencial / por teléfono', short: 'Presencial' },
]

const PLACE_IDS = PLACES.map((p) => p.id)

// Plataformas con sala fija (necesitan mi enlace).
export const ROOM_PLATFORMS = ['zoom', 'meet', 'teams']

export const DEFAULT_VIDEO_OPTIONS = ['jitsi', 'in_person']

// Dominios de cada plataforma (para avisar si el enlace no parece de ella).
const ROOM_HOSTS = {
  zoom: /(^|\.)zoom\.(us|com)$/,
  meet: /^meet\.google\.com$/,
  teams: /(^|\.)teams\.(microsoft|live)\.com$/,
}

export const ROOM_PLACEHOLDERS = {
  zoom: 'https://us02web.zoom.us/j/1234567890',
  meet: 'https://meet.google.com/abc-defg-hij',
  teams: 'https://teams.microsoft.com/l/meetup-join/...',
}

export function placeOf(id) {
  return PLACES.find((p) => p.id === id) || null
}

export function placeLabel(id) {
  return placeOf(id)?.label || ''
}

// Opciones válidas, sin repetir y en el orden de PLACES.
export function cleanOptions(options) {
  const list = Array.isArray(options) ? options : []
  return PLACE_IDS.filter((id) => list.includes(id))
}

export function getVideoRooms() {
  const rooms = getPreferences().videoRooms
  return {
    zoom: typeof rooms?.zoom === 'string' ? rooms.zoom : '',
    meet: typeof rooms?.meet === 'string' ? rooms.meet : '',
    teams: typeof rooms?.teams === 'string' ? rooms.teams : '',
  }
}

export function saveVideoRooms(rooms) {
  const clean = Object.fromEntries(ROOM_PLATFORMS.map((p) => [p, (rooms[p] || '').trim()]))
  savePreferences({ ...getPreferences(), videoRooms: clean })
}

// Mensaje de error del enlace de una sala (vacío vale: es opcional) o null.
export function validateRoomUrl(platform, url) {
  const text = (url || '').trim()
  if (!text) return null
  let parsed
  try {
    parsed = new URL(text)
  } catch {
    return `El enlace de ${placeLabel(platform)} no es una dirección válida (empieza por https://).`
  }
  if (parsed.protocol !== 'https:') return `El enlace de ${placeLabel(platform)} tiene que empezar por https://.`
  if (!ROOM_HOSTS[platform].test(parsed.hostname)) return `Ese enlace no parece de ${placeLabel(platform)}.`
  return null
}

/**
 * Comprueba las salas y las opciones activas del enlace de reservas: al menos una opción, y las de
 * Zoom, Meet o Teams solo si tienen su enlace. Mensaje de error o null.
 */
export function validateVideoSettings(rooms, options) {
  for (const p of ROOM_PLATFORMS) {
    const problem = validateRoomUrl(p, rooms[p])
    if (problem) return problem
  }
  const list = cleanOptions(options)
  if (list.length === 0) return 'Elige al menos una opción de dónde hacer la reunión.'
  const missing = list.find((id) => ROOM_PLATFORMS.includes(id) && !(rooms[id] || '').trim())
  if (missing) return `Para ofrecer ${placeLabel(missing)}, añade el enlace de tu sala (o desactívalo).`
  return null
}

const ALPHABET = 'abcdefghijkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789'

// Enlace único de Jitsi Meet: https://meet.jit.si/CESI-<12 caracteres aleatorios>.
export function jitsiLink(randomValues = (n) => crypto.getRandomValues(new Uint8Array(n))) {
  const bytes = randomValues(12)
  const id = Array.from(bytes, (b) => ALPHABET[b % ALPHABET.length]).join('')
  return `https://meet.jit.si/CESI-${id}`
}

// Enlace de la reunión según dónde se hace: mi sala fija, uno nuevo de Jitsi o '' (presencial, o
// sin sala guardada).
export function meetingLinkFor(place, rooms = getVideoRooms(), makeJitsi = jitsiLink) {
  if (place === 'jitsi') return makeJitsi()
  if (ROOM_PLATFORMS.includes(place)) return (rooms[place] || '').trim()
  return ''
}

// Opciones de "Generar enlace" al crear una reunión a mano: mis salas guardadas y Jitsi.
export function linkChoices(rooms = getVideoRooms()) {
  return PLACES.filter((p) => (ROOM_PLATFORMS.includes(p.id) && (rooms[p.id] || '').trim()) || p.id === 'jitsi')
}
