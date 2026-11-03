import { migrateContacts } from './contacts'
import { normalizeCourse } from './courses'

// Pantallas de la ceo para el equipo (parte 11): los datos de una pantalla, leídos con
// cesi_screen_data, que comprueba el permiso y quita los datos sensibles con «Ver». Se ven en
// solo lectura con las mismas pantallas de la ceo.

// Sección del menú → pantalla de los permisos.
export const SECTION_SCREENS = {
  contacts: 'contactos',
  // Alianzas (parte 16): los contactos externos con su seguimiento.
  alliances: 'contactos',
  courses: 'cursos',
  students: 'alumnos',
  attendance: 'asistencia',
}

const byName = (a, b) => (a.name || '').localeCompare(b.name || '', 'es', { sensitivity: 'base' })
const list = (value) => (Array.isArray(value) ? value : [])
const byId = (value) => new Map(list(value).map((d) => [d.id, d]))

// Los datos tal como los usan las pantallas (mismo orden y forma que en la app de la ceo).
export function normalizeScreenData(data) {
  return {
    level: data?.level || 'read',
    // Parte 15: solo los cursos de esa persona (área Profesor) y si puede pasar lista en ellos.
    teacher: !!data?.teacher,
    canMark: !!data?.canMark,
    contacts: migrateContacts(list(data?.contacts)).contacts.sort(byName),
    groups: list(data?.groups).sort(byName),
    vacancies: list(data?.vacancies).sort((a, b) => (b.openedAt || '').localeCompare(a.openedAt || '')),
    courses: list(data?.courses).map(normalizeCourse).sort(byName),
    students: list(data?.students).sort(byName),
    attendance: list(data?.attendance),
    extraClasses: list(data?.extraClasses).sort((a, b) => new Date(a.start) - new Date(b.start)),
    // Los documentos tal como llegaron (sin migrar), por tabla e id: para saber cómo estaban al
    // editarlos (parte 20).
    raw: {
      contacts: byId(data?.contacts),
      vacancies: byId(data?.vacancies),
      courses: byId(data?.courses),
      students: byId(data?.students),
    },
  }
}

// asId / asArea: «Ver como» una persona o un área (solo la ceo).
export async function fetchScreenData(client, screen, asId = null, asArea = null) {
  const { data, error } = await client.rpc('cesi_screen_data', { p_screen: screen, p_as: asId, p_area: asArea })
  if (error) throw error
  return normalizeScreenData(data)
}

export function screenErrorText(err) {
  if (err?.code === 'PGRST202' || err?.code === '42883') return 'Falta ejecutar en Supabase el SQL de la parte 11 (supabase/parte11_pantallas_equipo.sql).'
  if (err?.code === '42501') return 'No tienes acceso a esta pantalla.'
  return err?.message || 'No se pudo cargar. Comprueba la conexión.'
}

// Pase de lista sin hacer nada: en solo lectura los controles están desactivados.
const noop = () => {}
export const NO_ATTENDANCE_ACTIONS = {
  mark: noop,
  unmark: noop,
  setTimes: noop,
  setLateMinutes: noop,
  setJustification: noop,
  markAllPresent: noop,
  saveExtraClass: noop,
  deleteExtraClass: noop,
}
