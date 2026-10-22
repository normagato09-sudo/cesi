import { createCollection } from './store'
import { studentsStore } from './students'

// Cursos de los alumnos. Curso: { id, name, createdAt, updatedAt }.
// Es un documento propio (con id) para poder crecer sin migrar: los campos que se añadan después
// (descripción, profesor, duración de la clase...) serán opcionales y un curso sin ellos se lee
// con su valor vacío. Las clases y el pase de lista irán en sus propias colecciones, con courseId.
//
// La inscripción se guarda solo en el alumno (students.courseIds); los inscritos de un curso se
// calculan con studentsInCourse.

export const STORAGE_KEY = 'cesi_courses_v1'

export const coursesStore = createCollection(STORAGE_KEY, { prefix: 'crs' })

const MAX_NAME_LENGTH = 60

function nameKey(name) {
  return (name || '')
    .trim()
    .toLocaleLowerCase('es')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
}

export function getAllCourses() {
  return coursesStore.getAll().sort((a, b) => (a.name || '').localeCompare(b.name || '', 'es', { sensitivity: 'base' }))
}

export function normalizeCourseName(name) {
  return (name || '').replace(/\s+/g, ' ').trim().slice(0, MAX_NAME_LENGTH)
}

// Mensaje de error del nombre o null si es válido. `exceptId`: el curso que se está renombrando.
export function validateCourseName(name, courses, exceptId = null) {
  const clean = normalizeCourseName(name)
  if (!clean) return 'Escribe el nombre del curso.'
  if (courses.some((c) => c.id !== exceptId && nameKey(c.name) === nameKey(clean))) return `Ya tienes un curso «${clean}».`
  return null
}

// Cursos (existentes) de un alumno, en el orden de la lista de cursos.
export function coursesOfStudent(student, courses) {
  const ids = student?.courseIds || []
  return courses.filter((c) => ids.includes(c.id))
}

// Alumnos inscritos en el curso (calculado a partir de los courseIds de cada alumno).
export function studentsInCourse(courseId, students) {
  return students.filter((s) => (s.courseIds || []).includes(courseId))
}

// Cambios para quitar el curso borrado de sus alumnos: [{ id, courseIds }].
export function studentsWithoutCourse(courseId, students) {
  return studentsInCourse(courseId, students).map((s) => ({ id: s.id, courseIds: s.courseIds.filter((id) => id !== courseId) }))
}

// Borra el curso y lo quita de los alumnos que estaban inscritos (los alumnos se conservan).
export function deleteCourse(courseId) {
  for (const { id, courseIds } of studentsWithoutCourse(courseId, studentsStore.getAll())) studentsStore.update(id, { courseIds })
  coursesStore.remove(courseId)
}
