import { callPublicRpc } from './publicRpc'

// Página pública /confirmar/<token>: la persona confirma si va a una reunión. No usa el cliente
// de Supabase ni toca tablas: solo llama por HTTP a cesi_meeting_invite_get y
// cesi_meeting_invite_respond (supabase/schema.sql), que validan el token, la reunión y la respuesta.

export const RESPONSES = ['yes', 'no', 'maybe']
export const COMMENT_MAX = 300

const TOKEN_RE = /^\/confirmar\/([A-Za-z0-9_-]{32,100})\/?$/

export function tokenFromPath(pathname) {
  return TOKEN_RE.exec(pathname || '')?.[1] || null
}

// Mensaje de error o null.
export function validateResponse(response, comment) {
  if (!RESPONSES.includes(response)) return 'Elige «Voy», «No puedo» o «Quizás».'
  if ((comment || '').trim().length > COMMENT_MAX) return `El comentario es demasiado largo (máximo ${COMMENT_MAX} caracteres).`
  return null
}

const ERROR_TEXT = {
  invalid_link: 'Este enlace ya no es válido.',
  meeting_started: 'La reunión ya ha empezado: ya no se puede cambiar la respuesta.',
  invalid_response: 'Elige «Voy», «No puedo» o «Quizás».',
  comment_too_long: `El comentario es demasiado largo (máximo ${COMMENT_MAX} caracteres).`,
}

export class MeetingResponseError extends Error {
  constructor(code) {
    super(ERROR_TEXT[code] || 'No se pudo guardar. Inténtalo de nuevo.')
    this.code = code
  }
}

function rpc(name, args, config) {
  return callPublicRpc(name, args, config, { codes: Object.keys(ERROR_TEXT), makeError: (code) => new MeetingResponseError(code) })
}

// { title, allDay, timeZone, name, startsAt, endsAt, response, comment, needsReconfirm, canRespond },
// o null si el enlace no existe, está desactivado, la reunión ha terminado o ya no está invitada.
export function loadInvite(token, config) {
  return rpc('cesi_meeting_invite_get', { p_token: token }, config)
}

export function sendResponse(token, response, comment, config) {
  return rpc('cesi_meeting_invite_respond', { p_token: token, p_response: response, p_comment: (comment || '').trim() }, config)
}
