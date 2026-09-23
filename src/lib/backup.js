import { format } from 'date-fns'
import { getAllEvents, STORAGE_KEY as EVENTS_KEY } from './localEvents'
import { getAllContacts, STORAGE_KEY as CONTACTS_KEY } from './contacts'
import { getWorkingHours, STORAGE_KEY as WORKING_HOURS_KEY } from './availability'

const BACKUP_VERSION = 1

export function buildBackup() {
  return {
    app: 'cesi',
    version: BACKUP_VERSION,
    exportedAt: new Date().toISOString(),
    events: getAllEvents(),
    contacts: getAllContacts(),
    workingHours: getWorkingHours(),
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
  localStorage.setItem(EVENTS_KEY, JSON.stringify(data.events))
  localStorage.setItem(CONTACTS_KEY, JSON.stringify(data.contacts))
  if (Array.isArray(data.workingHours)) {
    localStorage.setItem(WORKING_HOURS_KEY, JSON.stringify(data.workingHours))
  } else {
    localStorage.removeItem(WORKING_HOURS_KEY)
  }
}
