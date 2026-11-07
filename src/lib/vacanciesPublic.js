// Página pública /vacantes (vacantes.html, parte 40): las vacantes abiertas y el formulario para
// postularse sin cuenta. Solo usa dos funciones de Supabase con la clave pública (anon):
// cesi_open_vacancies (leer las abiertas) y cesi_public_apply (enviar). No puede leer candidaturas.
import { callPublicRpc } from './publicRpc'
import { openVacanciesFromRows } from './vacancyBoard'
import { publicApplyArgs } from './vacancyApplications'

// Errores de la función que se enseñan tal cual (el resto, uno general).
const SERVER_TEXTS = [
  'Esta vacante ya no está abierta.',
  'El correo no es válido.',
  'Escribe tu nombre.',
  'Cuéntanos por qué te interesa.',
  'Tienes que aceptar el uso de tus datos.',
]
const GENERAL = {
  unavailable: 'Esta página no está disponible ahora mismo.',
  network: 'No hay conexión. Comprueba tu internet y vuelve a intentarlo.',
  server: 'No se pudo enviar. Vuelve a intentarlo en un rato.',
}
const makeError = (code) => new Error(GENERAL[code] || code)

export function loadPublicVacancies(config) {
  return callPublicRpc('cesi_open_vacancies', {}, config, { codes: [], makeError }).then(openVacanciesFromRows)
}

// Devuelve { status: 'ok' | 'duplicate' | 'limit' }.
export function sendPublicApplication(config, vacancyId, form) {
  return callPublicRpc('cesi_public_apply', publicApplyArgs(vacancyId, form), config, { codes: SERVER_TEXTS, makeError })
}
