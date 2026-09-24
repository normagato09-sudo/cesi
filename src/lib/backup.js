import { format } from 'date-fns'
import { removeKey, writeJSON } from './store'
import { getAllEvents, STORAGE_KEY as EVENTS_KEY } from './localEvents'
import { getAllContacts, STORAGE_KEY as CONTACTS_KEY } from './contacts'
import { getWorkingHours, STORAGE_KEY as WORKING_HOURS_KEY } from './availability'
import { getPreferences, STORAGE_KEY as PREFERENCES_KEY } from './preferences'
import { getAllRules, STORAGE_KEY as RULES_KEY } from './rules'
import { getAllProposals, STORAGE_KEY as PROPOSALS_KEY } from './proposals'
import { getAllGroups, STORAGE_KEY as GROUPS_KEY } from './groups'
import { AREAS_KEY, getTeamAreas } from './team'
import { getAllWeeklyAvailability, STORAGE_KEY as WEEKLY_AVAILABILITY_KEY } from './weeklyAvailability'
import { getAllProjects, STORAGE_KEY as PROJECTS_KEY } from './projects'
import { getAllVacancies, STORAGE_KEY as VACANCIES_KEY } from './vacancies'

// v1: events, contacts, workingHours. v2 añade preferences. v3 añade rules. v4 añade proposals.
// v5 añade groups (y los groupIds de cada contacto). v6: los contactos llevan la referencia de
// su foto (photo); las fotos no van en la copia. v7 añade teamAreas (departamentos del equipo) y los
// contactos pueden llevar teamProfile (perfil de equipo). v8 añade weeklyAvailability (disponibilidad
// declarada semana a semana). v9 añade projects (las reuniones y propuestas llevan projectId).
// v10 añade vacancies; los candidatos son contactos con candidacy (su CV, como las fotos, va
// solo como referencia). v11: en el perfil de equipo las redes pasan a una sola lista de enlaces y
// los datos del contacto (email, teléfono) se guardan solo en el contacto, y los hitos pasan a la
// trayectoria; las copias anteriores se convierten al leerlas.
// La disponibilidad, la zona horaria y los grupos de los contactos van dentro de contacts; las
// notas de las reuniones (notes / notesByDate), dentro de events.
const BACKUP_VERSION = 11

// Colecciones opcionales: si una copia antigua no las trae, al importarla quedan vacías.
const OPTIONAL_LISTS = [
  { field: 'rules', key: RULES_KEY, label: 'las reglas' },
  { field: 'proposals', key: PROPOSALS_KEY, label: 'las propuestas' },
  { field: 'groups', key: GROUPS_KEY, label: 'los grupos' },
  { field: 'teamAreas', key: AREAS_KEY, label: 'los departamentos' },
  { field: 'weeklyAvailability', key: WEEKLY_AVAILABILITY_KEY, label: 'la disponibilidad semanal' },
  { field: 'projects', key: PROJECTS_KEY, label: 'los proyectos' },
  { field: 'vacancies', key: VACANCIES_KEY, label: 'las vacantes' },
]

export function buildBackup() {
  return {
    app: 'cesi',
    version: BACKUP_VERSION,
    exportedAt: new Date().toISOString(),
    events: getAllEvents(),
    contacts: getAllContacts(),
    workingHours: getWorkingHours(),
    preferences: getPreferences(),
    rules: getAllRules(),
    proposals: getAllProposals(),
    groups: getAllGroups(),
    teamAreas: getTeamAreas(),
    weeklyAvailability: getAllWeeklyAvailability(),
    projects: getAllProjects(),
    vacancies: getAllVacancies(),
  }
}

// Descarga un JSON cesi-copia-AAAA-MM-DD.json con todos los datos de este navegador.
export function downloadBackup() {
  const backup = buildBackup()
  const blob = new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = `cesi-copia-${format(new Date(), 'yyyy-MM-dd')}.json`
  document.body.appendChild(link)
  link.click()
  link.remove()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
  return backup
}

// Valida el contenido de una copia. Devuelve los datos o lanza un Error con un mensaje para el usuario.
export function parseBackup(text) {
  let data
  try {
    data = JSON.parse(text)
  } catch {
    throw new Error('El archivo no es un JSON válido.')
  }
  if (!data || typeof data !== 'object' || data.app !== 'cesi') {
    throw new Error('El archivo no es una copia de seguridad de CESI.')
  }
  if (!Array.isArray(data.events) || !Array.isArray(data.contacts)) {
    throw new Error('La copia está incompleta: faltan las reuniones o los contactos.')
  }
  if (data.workingHours !== undefined && (!Array.isArray(data.workingHours) || data.workingHours.length !== 7)) {
    throw new Error('La copia tiene un horario habitual no válido.')
  }
  if (data.preferences !== undefined && (typeof data.preferences !== 'object' || Array.isArray(data.preferences))) {
    throw new Error('La copia tiene unas preferencias no válidas.')
  }
  for (const { field, label } of OPTIONAL_LISTS) {
    if (data[field] !== undefined && !Array.isArray(data[field])) throw new Error(`La copia tiene ${label} en un formato no válido.`)
  }
  return data
}

export function readBackupFile(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => {
      try {
        resolve(parseBackup(reader.result))
      } catch (err) {
        reject(err)
      }
    }
    reader.onerror = () => reject(new Error('No se pudo leer el archivo.'))
    reader.readAsText(file)
  })
}

// Sustituye todos los datos actuales por los de la copia.
export function restoreBackup(data) {
  writeJSON(EVENTS_KEY, data.events)
  writeJSON(CONTACTS_KEY, data.contacts)
  if (Array.isArray(data.workingHours)) {
    writeJSON(WORKING_HOURS_KEY, data.workingHours)
  } else {
    removeKey(WORKING_HOURS_KEY)
  }
  restoreOptional(PREFERENCES_KEY, data.preferences)
  for (const { field, key } of OPTIONAL_LISTS) restoreOptional(key, data[field])
}

// Las claves que no existían en versiones antiguas de la copia vuelven a su valor por defecto.
function restoreOptional(key, value) {
  if (value === undefined || value === null) removeKey(key)
  else writeJSON(key, value)
}
