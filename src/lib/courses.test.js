import { beforeEach, describe, expect, it } from 'vitest'
import { coursesOfStudent, coursesStore, deleteCourse, getAllCourses, studentsInCourse, studentsWithoutCourse, validateCourseName } from './courses'
import { createStudent, getAllStudents } from './students'

beforeEach(() => localStorage.clear())

const student = { country: 'ES', timeZone: 'Europe/Madrid', enrolledAt: '2026-10-01' }

describe('cursos', () => {
  it('son documentos con id y nombre, ordenados por nombre', () => {
    coursesStore.create({ name: 'Locución' })
    const guion = coursesStore.create({ name: 'Guion' })
    expect(guion).toMatchObject({ id: expect.any(String), name: 'Guion' })
    expect(getAllCourses().map((c) => c.name)).toEqual(['Guion', 'Locución'])
  })

  it('valida el nombre sin repetir (sin distinguir mayúsculas ni acentos)', () => {
    const courses = [{ id: 'loc', name: 'Locución' }]
    expect(validateCourseName('  ', courses)).toBe('Escribe el nombre del curso.')
    expect(validateCourseName('locucion', courses)).toBe('Ya tienes un curso «locucion».')
    expect(validateCourseName('Locución', courses, 'loc')).toBeNull()
    expect(validateCourseName('Guion', courses)).toBeNull()
  })

  it('los inscritos se calculan desde los courseIds de los alumnos', () => {
    const students = [
      { id: 'a', courseIds: ['loc', 'guion'] },
      { id: 'b', courseIds: ['loc'] },
      { id: 'c' },
    ]
    const courses = [
      { id: 'guion', name: 'Guion' },
      { id: 'loc', name: 'Locución' },
    ]
    expect(studentsInCourse('loc', students).map((s) => s.id)).toEqual(['a', 'b'])
    expect(coursesOfStudent(students[0], courses).map((c) => c.id)).toEqual(['guion', 'loc'])
    expect(coursesOfStudent({ courseIds: ['borrado'] }, courses)).toEqual([])
    expect(studentsWithoutCourse('loc', students)).toEqual([
      { id: 'a', courseIds: ['guion'] },
      { id: 'b', courseIds: [] },
    ])
  })

  it('al borrar un curso se quita de sus alumnos, que se conservan', () => {
    const loc = coursesStore.create({ name: 'Locución' })
    const guion = coursesStore.create({ name: 'Guion' })
    createStudent({ ...student, name: 'Ana', courseIds: [loc.id, guion.id] })
    createStudent({ ...student, name: 'Bruno', courseIds: [loc.id] })
    createStudent({ ...student, name: 'Carla', courseIds: [guion.id] })
    deleteCourse(loc.id)
    expect(getAllCourses().map((c) => c.id)).toEqual([guion.id])
    expect(getAllStudents().map((s) => [s.name, s.courseIds])).toEqual([
      ['Ana', [guion.id]],
      ['Bruno', []],
      ['Carla', [guion.id]],
    ])
  })
})
