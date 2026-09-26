import { createCollection } from './store'
import { GROUP_COLORS } from './groups'

// Proyectos de las reuniones. Proyecto: { id, name, color, status: 'active' | 'archived',
// createdAt, updatedAt }. Cada reunión tiene como mucho un proyecto (`projectId`); las propuestas
// también lo guardan para que la reunión confirmada lo conserve.

export const STORAGE_KEY = 'cesi_projects_v1'

export const projectsStore = createCollection(STORAGE_KEY, { prefix: 'prj', defaults: { status: 'active' } })

export const PROJECT_COLORS = GROUP_COLORS

// En el filtro del calendario: reuniones sin proyecto.
export const NO_PROJECT = '__none__'
export const NO_PROJECT_LABEL = 'Sin proyecto'

const MAX_NAME_LENGTH = 60

function nameKey(name) {
  return (name || '')
    .trim()
    .toLocaleLowerCase('es')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
}

export function getAllProjects() {
  return projectsStore.getAll().sort((a, b) => a.name.localeCompare(b.name, 'es', { sensitivity: 'base' }))
}

export function activeProjects(projects) {
  return projects.filter((p) => p.status !== 'archived')
}

export function normalizeProjectName(name) {
  return (name || '').replace(/\s+/g, ' ').trim().slice(0, MAX_NAME_LENGTH)
}

// Mensaje de error del nombre o null si es válido. `exceptId`: el proyecto que se está renombrando.
export function validateProjectName(name, projects, exceptId = null) {
  const clean = normalizeProjectName(name)
  if (!clean) return 'Escribe el nombre del proyecto.'
  if (projects.some((p) => p.id !== exceptId && nameKey(p.name) === nameKey(clean))) return `Ya tienes un proyecto «${clean}».`
  return null
}

export function nextProjectColor(projects) {
  return PROJECT_COLORS.find((c) => !projects.some((p) => p.color === c)) || PROJECT_COLORS[projects.length % PROJECT_COLORS.length]
}

// Proyecto (existente) de una reunión o null.
export function projectOf(event, projects) {
  if (!event?.projectId) return null
  return projects.find((p) => p.id === event.projectId) || null
}

// Opciones del selector de una reunión: los activos y, si la reunión ya tenía uno archivado, ese también.
export function projectOptions(projects, currentId = null) {
  return projects.filter((p) => p.status !== 'archived' || p.id === currentId)
}

// Número de reuniones (series) de cada proyecto: { projectId: n }.
export function meetingCountByProject(rawEvents) {
  const counts = {}
  for (const ev of rawEvents) {
    if (ev.projectId && !ev.isUnavailable) counts[ev.projectId] = (counts[ev.projectId] || 0) + 1
  }
  return counts
}

// Al borrar un proyecto sus reuniones y propuestas se conservan, sin proyecto (también los días
// de una serie que tenían ese proyecto solo ese día). Devuelve los cambios de las reuniones
// ([{ id, patch }]) y los ids de las propuestas que hay que cambiar.
export function unlinkProject(projectId, rawEvents, proposals = []) {
  const eventPatches = []
  for (const ev of rawEvents) {
    const patch = {}
    if (ev.projectId === projectId) patch.projectId = null
    const days = Object.entries(ev.exceptions || {}).filter(([, ex]) => ex?.projectId === projectId)
    if (days.length > 0) {
      patch.exceptions = { ...ev.exceptions }
      for (const [key, ex] of days) patch.exceptions[key] = { ...ex, projectId: null }
    }
    if (Object.keys(patch).length > 0) eventPatches.push({ id: ev.id, patch })
  }
  return {
    eventPatches,
    proposalIds: proposals.filter((p) => p.projectId === projectId).map((p) => p.id),
  }
}
