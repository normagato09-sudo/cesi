// Reglas de acceso, tal como están en la base de datos (para probarlas y para la app):
//   · Quién puede invitar a quién a una reunión (cesi_can_invite, parte 22).
//   · Quién ve cada contacto (políticas de team_contacts y cesi_screen_data, partes 24 y 27).
// La base de datos es la que manda: esto no sustituye a sus comprobaciones.

// person: { id, role: 'ceo' | 'equipo' | 'alumno' | 'pendiente', teacherCourses?: [], studentCourses?: [] }
const shareCourse = (a = [], b = []) => a.some((id) => b.includes(id))

/**
 * ¿Puede `from` invitar a `to`? La ceo, a cualquiera; el equipo, al equipo y a la ceo; el
 * profesor, además, a los alumnos de sus cursos; el alumno, a sus compañeros de curso y a sus
 * profesores (nunca a la ceo: solo responde si ella le invita).
 */
export function canInvite(from, to) {
  if (!from || !to || from.id === to.id) return false
  if (!['ceo', 'equipo', 'alumno'].includes(to.role)) return false
  if (from.role === 'ceo') return true
  if (from.role === 'equipo') {
    if (to.role === 'equipo' || to.role === 'ceo') return true
    return shareCourse(from.teacherCourses, to.studentCourses)
  }
  if (from.role === 'alumno') {
    if (to.role === 'equipo') return shareCourse(from.studentCourses, to.teacherCourses)
    if (to.role === 'alumno') return shareCourse(from.studentCourses, to.studentCourses)
  }
  return false
}

/**
 * ¿Ve `viewer` ({ id, role, area }) este contacto? contact: { kind: 'personal', ownerId } (los de
 * cada persona de equipo) o { kind: 'ceo', alliance: true|false } (los de la ceo; alliance: con
 * seguimiento de Alianzas o compartido con el área). Los de la ceo solo los ve ella, salvo los de
 * Alianzas, que los comparte toda el área Alianzas.
 */
export function canSeeContact(viewer, contact) {
  if (!viewer || !contact) return false
  if (contact.kind === 'personal') return viewer.role === 'equipo' && contact.ownerId === viewer.id
  if (contact.kind === 'ceo') {
    if (viewer.role === 'ceo') return true
    return !!contact.alliance && viewer.role === 'equipo' && viewer.area === 'alianzas'
  }
  return false
}
