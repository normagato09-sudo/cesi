import { createCollection } from './store'

// Proyectos de las reuniones. Ya no se usan ni se pueden editar desde la app (se quitaron, igual
// que las categorías y las etiquetas); solo se conservan los datos guardados (sincronización con
// Supabase y copias de seguridad). Las reuniones y propuestas conservan su `projectId`.
// Proyecto: { id, name, color, status: 'active' | 'archived', createdAt, updatedAt }.

export const STORAGE_KEY = 'cesi_projects_v1'

export const projectsStore = createCollection(STORAGE_KEY, { prefix: 'prj', defaults: { status: 'active' } })

export function getAllProjects() {
  return projectsStore.getAll()
}
