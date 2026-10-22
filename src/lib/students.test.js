import { beforeEach, describe, expect, it } from 'vitest'
import {
  availabilityRows,
  createStudent,
  filterStudents,
  getAllStudents,
  hasStudentAvailability,
  studentCountries,
  studentMatches,
  updateStudent,
  validateStudent,
  whatsappUrl,
} from './students'
import { emptyWeek } from './weeklySchedule'

beforeEach(() => localStorage.clear())

// Horario con franjas en algunos días: { 1: [['20:00', '23:00']] } (1 = lunes).
function week(days) {
  return emptyWeek().map((e) => (days[e.day] ? { ...e, enabled: true, slots: days[e.day].map(([start, end]) => ({ start, end })) } : e))
}

const base = { name: 'Lucía Pérez', country: 'MX', timeZone: 'America/Mexico_City', enrolledAt: '2026-10-01' }

describe('validación', () => {
  it('exige nombre, país con zona y fecha de alta', () => {
    expect(validateStudent(base)).toBeNull()
    expect(validateStudent({ ...base, name: '  ' })).toBe('El nombre es obligatorio.')
    expect(validateStudent({ ...base, country: '', timeZone: '' })).toBe('El país es obligatorio.')
    expect(validateStudent({ ...base, timeZone: 'Europe/Madrid' })).toMatch(/zona horaria de México/)
    expect(validateStudent({ ...base, enrolledAt: '' })).toBe('La fecha de alta es obligatoria.')
    expect(validateStudent({ ...base, email: 'no-es-email' })).toBe('El email no tiene un formato válido.')
  })

  it('valida las franjas de la disponibilidad', () => {
    expect(validateStudent({ ...base, availability: week({ 1: [['10:00', '12:00']] }) })).toBeNull()
    expect(validateStudent({ ...base, availability: week({ 1: [['12:00', '10:00']] }) })).toMatch(/^Disponibilidad: Lunes/)
  })

  it('no guarda un alumno sin país y sí uno válido, ordenados por nombre', () => {
    expect(() => createStudent({ ...base, country: '' })).toThrow('El país es obligatorio.')
    createStudent({ ...base, name: 'Zoe' })
    const ana = createStudent({ ...base, name: 'Ana', courseIds: ['c1'], newsletter: true })
    expect(getAllStudents().map((s) => s.name)).toEqual(['Ana', 'Zoe'])
    expect(ana).toMatchObject({ courseIds: ['c1'], newsletter: true, notes: '', availability: null })
    expect(() => updateStudent(ana.id, { name: '' })).toThrow('El nombre es obligatorio.')
    expect(updateStudent(ana.id, { newsletter: false }).newsletter).toBe(false)
  })
})

describe('buscador y filtros', () => {
  const students = [
    { id: 'a', name: 'Ana Ruiz', email: 'ana@mail.com', phone: '+52 55 1234 5678', country: 'MX', courseIds: ['loc'], newsletter: true },
    { id: 'b', name: 'Bruno Díaz', email: '', phone: '', country: 'AR', courseIds: ['loc', 'guion'], newsletter: false },
    { id: 'c', name: 'Carla Gómez', email: 'carla@mail.com', phone: '', country: 'ES', courseIds: [] },
  ]
  const ids = (list) => list.map((s) => s.id)

  it('busca por nombre (sin acentos), email y teléfono (también sin espacios)', () => {
    expect(studentMatches(students[1], 'diaz')).toBe(true)
    expect(studentMatches(students[2], 'carla@')).toBe(true)
    expect(studentMatches(students[0], '12345678')).toBe(true)
    expect(studentMatches(students[0], 'Bruno')).toBe(false)
  })

  it('combina curso, país y newsletter', () => {
    expect(ids(filterStudents(students, {}))).toEqual(['a', 'b', 'c'])
    expect(ids(filterStudents(students, { courseId: 'loc' }))).toEqual(['a', 'b'])
    expect(ids(filterStudents(students, { courseId: 'loc', country: 'AR' }))).toEqual(['b'])
    expect(ids(filterStudents(students, { newsletter: 'yes' }))).toEqual(['a'])
    expect(ids(filterStudents(students, { newsletter: 'no' }))).toEqual(['b', 'c'])
    expect(ids(filterStudents(students, { query: 'mail', newsletter: 'no' }))).toEqual(['c'])
  })

  it('lista los países de los alumnos sin repetir, por nombre', () => {
    expect(studentCountries([...students, { id: 'd', country: 'MX' }])).toEqual(['AR', 'ES', 'MX'])
  })

  it('arma el enlace de WhatsApp con el prefijo del país', () => {
    expect(whatsappUrl('+52 55 1234 5678')).toBe('https://wa.me/525512345678')
    expect(whatsappUrl('0034 600 11 22 33')).toBe('https://wa.me/34600112233')
    expect(whatsappUrl('123')).toBeNull()
    expect(whatsappUrl('')).toBeNull()
  })
})

describe('disponibilidad en su hora y en la mía', () => {
  const mexico = { ...base, availability: week({ 1: [['20:00', '23:00']], 3: [['15:00', '18:00']] }) }

  it('convierte a hora de España, también cuando cambia de día', () => {
    // Semana del 19 de octubre de 2026: España aún en horario de verano (+8 h respecto a México).
    const rows = availabilityRows(mexico, new Date('2026-10-22T12:00:00Z'))
    expect(rows.map(({ own, mine, otherDay }) => ({ own, mine, otherDay }))).toEqual([
      { own: 'Lun 20:00–23:00', mine: 'Mar 04:00–07:00', otherDay: true },
      { own: 'Mié 15:00–18:00', mine: 'Mié 23:00 – Jue 02:00', otherDay: false },
    ])
  })

  it('respeta el cambio de hora de España', () => {
    // Desde el 25 de octubre España va en horario de invierno (+7 h respecto a México).
    const rows = availabilityRows(mexico, new Date('2026-11-04T12:00:00Z'))
    expect(rows[0]).toMatchObject({ own: 'Lun 20:00–23:00', mine: 'Mar 03:00–06:00' })
  })

  it('puede caer el día anterior en mi hora', () => {
    const tokyo = { ...base, country: 'JP', timeZone: 'Asia/Tokyo', availability: week({ 1: [['06:00', '08:00']] }) }
    expect(availabilityRows(tokyo, new Date('2026-10-22T12:00:00Z'))[0]).toMatchObject({ own: 'Lun 06:00–08:00', mine: 'Dom 23:00 – Lun 01:00', otherDay: true })
  })

  it('en España su hora y la mía coinciden', () => {
    const madrid = { ...base, country: 'ES', timeZone: 'Europe/Madrid', availability: week({ 5: [['09:00', '23:59']] }) }
    expect(availabilityRows(madrid, new Date('2026-10-22T12:00:00Z'))).toEqual([
      { key: '5-09:00', own: 'Vie 09:00–23:59', mine: 'Vie 09:00–23:59', otherDay: false },
    ])
  })

  it('sin franjas no hay disponibilidad', () => {
    expect(hasStudentAvailability(base)).toBe(false)
    expect(hasStudentAvailability({ ...base, availability: emptyWeek() })).toBe(false)
    expect(availabilityRows(base)).toEqual([])
    expect(hasStudentAvailability(mexico)).toBe(true)
  })
})
