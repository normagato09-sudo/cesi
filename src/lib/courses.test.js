import { beforeEach, describe, expect, it } from 'vitest'
import {
  DEFAULT_CLASS_MINUTES,
  coursesOfStudent,
  coursesStore,
  deleteCourse,
  getAllCourses,
  normalizeCourse,
  openForStudents,
  scheduleRows,
  seatsOf,
  studentsInCourse,
  studentsWithoutCourse,
  teacherOptions,
  teacherStatus,
  upcomingClasses,
  validateCourse,
  validateCourseName,
} from './courses'
import { createStudent, getAllStudents } from './students'
import { buildBackup } from './backup'
import { emptyWeek } from './weeklySchedule'

// Horario semanal con franjas: { 1: [['16:00', '20:00']] } (1 = lunes).
function emptyWeekWith(days) {
  return emptyWeek().map((e) => (days[e.day] ? { ...e, enabled: true, slots: days[e.day].map(([start, end]) => ({ start, end })) } : e))
}

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

describe('datos del curso (profesor, duración y horario)', () => {
  it('un curso guardado antes (solo nombre) se lee con valores por defecto sin cambiar lo guardado', () => {
    const old = coursesStore.create({ name: 'Locución' })
    expect(getAllCourses()[0]).toMatchObject({
      id: old.id,
      name: 'Locución',
      description: '',
      teacherId: null,
      classMinutes: DEFAULT_CLASS_MINUTES,
      classesPerWeek: 1,
      schedule: null,
    })
    expect(coursesStore.getAll()[0]).toEqual(old)
  })

  it('la copia de seguridad guarda los cursos tal cual, sin los valores por defecto', () => {
    const old = coursesStore.create({ name: 'Locución' })
    expect(buildBackup().courses).toEqual([old])
  })

  it('normaliza los valores que no sirven', () => {
    const c = normalizeCourse({ name: 'X', classMinutes: 'abc', classesPerWeek: 9, schedule: { timeZone: 'Europe/Madrid', slots: [{ day: 9, start: '10:00' }] } })
    expect(c).toMatchObject({ classMinutes: 60, classesPerWeek: 1, schedule: null })
  })
})

describe('validación del horario', () => {
  const course = (schedule, extra = {}) => ({ name: 'Guion', classMinutes: 60, classesPerWeek: 2, schedule, ...extra })
  const madrid = (slots) => ({ timeZone: 'Europe/Madrid', slots })

  it('sin horario, o con una franja por clase, vale', () => {
    expect(validateCourse(course(null), [])).toBeNull()
    expect(validateCourse(course(madrid([{ day: 1, start: '18:00' }, { day: 3, start: '18:00' }])), [])).toBeNull()
  })

  it('tiene que tener tantas franjas como clases por semana, con día y hora', () => {
    expect(validateCourse(course(madrid([{ day: 1, start: '18:00' }])), [])).toBe('El horario tiene 1 clase y el curso, 2 por semana.')
    expect(validateCourse(course(madrid([{ day: 1, start: '' }, { day: 3, start: '18:00' }])), [])).toBe('Pon el día y la hora de cada clase.')
    expect(validateCourse(course({ slots: [{ day: 1, start: '18:00' }, { day: 3, start: '18:00' }] }), [])).toBe('Falta la zona horaria del horario.')
  })

  it('cada clase acaba como muy tarde a las 23:59 de su día', () => {
    const late = (start, classMinutes) => validateCourse(course(madrid([{ day: 5, start }]), { classesPerWeek: 1, classMinutes }), [])
    expect(late('22:59', 60)).toBeNull()
    expect(late('23:00', 60)).toBe('La clase del viernes a las 23:00 acabaría después de las 23:59 (en este curso cada clase dura 1 h).')
    expect(late('22:30', 90)).toMatch(/después de las 23:59/)
  })

  it('dos clases del mismo día no se solapan', () => {
    expect(validateCourse(course(madrid([{ day: 2, start: '18:00' }, { day: 2, start: '18:30' }])), [])).toBe(
      'Las clases del martes a las 18:00 y a las 18:30 se solapan.',
    )
    expect(validateCourse(course(madrid([{ day: 2, start: '18:00' }, { day: 2, start: '19:00' }])), [])).toBeNull()
  })

  it('valida duración y clases por semana', () => {
    expect(validateCourse(course(null, { classMinutes: 10 }), [])).toMatch(/duración/)
    expect(validateCourse(course(null, { classesPerWeek: 8 }), [])).toBe('Las clases por semana tienen que ser entre 1 y 7.')
  })
})

describe('profesor (del Equipo)', () => {
  const week = emptyWeekWith({ 1: [['16:00', '20:00']] })
  const contacts = [
    { id: 'p1', name: 'Zoe', teamProfile: { status: 'active', area: 'Profesores', role: 'Profesora' }, availability: week },
    { id: 'p2', name: 'Ana', teamProfile: { status: 'active', area: 'Radio', role: 'Locutora' } },
    { id: 'p3', name: 'Bea', teamProfile: { status: 'former', area: 'Profesores', role: 'Profesora' } },
    { id: 'p4', name: 'Carla', teamProfile: { status: 'active', area: 'Profesores', role: 'Profesora' }, archived: true },
    { id: 'c1', name: 'Daniel' },
  ]

  it('se elige entre los miembros activos del Equipo: primero los de «Profesores»', () => {
    const { teachers, others } = teacherOptions(contacts)
    expect(teachers.map((c) => c.id)).toEqual(['p1'])
    expect(others.map((c) => c.id)).toEqual(['p2'])
  })

  it('avisa si no hay profesor, si se borró o si ya no está en el Equipo', () => {
    expect(teacherStatus({ teacherId: null }, contacts).problem).toBe('none')
    expect(teacherStatus({ teacherId: 'nadie' }, contacts).problem).toBe('missing')
    expect(teacherStatus({ teacherId: 'p3' }, contacts).problem).toBe('inactive')
    expect(teacherStatus({ teacherId: 'p2' }, contacts).problem).toBe('noAvailability')
    expect(teacherStatus({ teacherId: 'p1' }, contacts)).toMatchObject({ teacher: { id: 'p1' }, problem: null })
  })
})

describe('próximas clases y horario en mi hora (no se crean en el calendario)', () => {
  // Lunes y miércoles a las 18:00 en Ciudad de México (UTC-6 todo el año).
  const course = {
    id: 'g',
    name: 'Guion',
    classMinutes: 60,
    classesPerWeek: 2,
    schedule: { timeZone: 'America/Mexico_City', slots: [{ day: 3, start: '18:00' }, { day: 1, start: '18:00' }] },
  }

  it('el horario se ve en su hora y en la mía, con el cambio de hora de España', () => {
    // Antes del 25/10/2026 España está en UTC+2: 18:00 en México son las 02:00 del día siguiente.
    expect(scheduleRows(course, new Date('2026-10-19T08:00:00Z'))).toEqual([
      { key: '1-18:00', own: 'Lun 18:00–19:00', mine: 'Mar 02:00–03:00' },
      { key: '3-18:00', own: 'Mié 18:00–19:00', mine: 'Jue 02:00–03:00' },
    ])
    // Después, UTC+1: las 01:00.
    expect(scheduleRows(course, new Date('2026-10-26T08:00:00Z'))[0]).toEqual({ key: '1-18:00', own: 'Lun 18:00–19:00', mine: 'Mar 01:00–02:00' })
  })

  it('las próximas clases salen del horario, con su clave para el pase de lista', () => {
    const next = upcomingClasses(course, new Date('2026-10-26T08:00:00Z'), 3)
    expect(next.map((c) => c.key)).toEqual(['2026-10-26_18:00', '2026-10-28_18:00', '2026-11-02_18:00'])
    expect(next[0].start.toISOString()).toBe('2026-10-27T00:00:00.000Z')
    expect(next[0].end.toISOString()).toBe('2026-10-27T01:00:00.000Z')
  })

  it('un curso sin horario no tiene clases', () => {
    expect(upcomingClasses({ name: 'X' })).toEqual([])
    expect(scheduleRows({ name: 'X' })).toEqual([])
  })
})

describe('estado y plazas (fase de alumnos)', () => {
  const students = [
    { id: 'a', courseIds: ['c1'] },
    { id: 'b', courseIds: ['c1', 'c2'] },
    { id: 'c', courseIds: [] },
  ]

  it('los cursos de antes, sin estado, son «Borrador» y sin límite de plazas', () => {
    expect(normalizeCourse({ id: 'c1', name: 'A' })).toMatchObject({ status: 'borrador', maxSeats: null, startDate: '', endDate: '' })
    expect(normalizeCourse({ id: 'c1', name: 'A', status: 'raro', maxSeats: '0' })).toMatchObject({ status: 'borrador', maxSeats: null })
    expect(normalizeCourse({ id: 'c1', name: 'A', status: 'en_curso', maxSeats: 20, startDate: '2030-11-01' })).toMatchObject({ status: 'en_curso', maxSeats: 20, startDate: '2030-11-01' })
  })

  it('plazas y si sale en el portal', () => {
    expect(seatsOf({ id: 'c1', maxSeats: 3 }, students)).toEqual({ enrolled: 2, max: 3, free: 1 })
    expect(seatsOf({ id: 'c1' }, students)).toEqual({ enrolled: 2, max: null, free: null })
    expect(openForStudents({ id: 'c1', status: 'inscripcion', maxSeats: 3 }, students)).toBe(true)
    expect(openForStudents({ id: 'c1', status: 'en_curso', maxSeats: 2 }, students)).toBe(false)
    expect(openForStudents({ id: 'c1', status: 'borrador' }, students)).toBe(false)
    expect(openForStudents({ id: 'c3', status: 'terminado' }, students)).toBe(false)
  })

  it('valida estado, plazas y fechas', () => {
    const base = { name: 'Nuevo', classMinutes: 60, classesPerWeek: 1, schedule: null }
    expect(validateCourse({ ...base, status: 'inscripcion', maxSeats: 20 }, [])).toBe(null)
    expect(validateCourse({ ...base, status: 'otro' }, [])).toMatch(/estado/)
    expect(validateCourse({ ...base, maxSeats: 0 }, [])).toMatch(/plazas/)
    expect(validateCourse({ ...base, startDate: '2030-12-01', endDate: '2030-11-01' }, [])).toMatch(/fin/)
  })
})
