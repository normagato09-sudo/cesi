import { beforeEach, describe, expect, it } from 'vitest'
import {
  SELF_SERVICE_FIELDS,
  ageLabel,
  ageOn,
  availabilityRows,
  birthdayLabel,
  createStudent,
  filterStudents,
  getAllStudents,
  hasStudentAvailability,
  studentCountries,
  normalizeDiscord,
  selfServicePatch,
  studentMatches,
  updateStudent,
  validateSelfServiceProfile,
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
    const ana = createStudent({ ...base, name: 'Ana', courseIds: ['c1'] })
    expect(getAllStudents().map((s) => s.name)).toEqual(['Ana', 'Zoe'])
    expect(ana).toMatchObject({ courseIds: ['c1'], notes: '', availability: null })
    expect(ana).not.toHaveProperty('newsletter')
    expect(() => updateStudent(ana.id, { name: '' })).toThrow('El nombre es obligatorio.')
  })

  it('un alumno guardado antes conserva su campo newsletter al editarlo', () => {
    const old = createStudent({ ...base, name: 'Luis', newsletter: true })
    expect(updateStudent(old.id, { notes: 'Nota' })).toMatchObject({ notes: 'Nota', newsletter: true })
    expect(getAllStudents().find((s) => s.id === old.id).newsletter).toBe(true)
  })
})

describe('buscador y filtros', () => {
  const students = [
    { id: 'a', name: 'Ana Ruiz', email: 'ana@mail.com', phone: '+52 55 1234 5678', country: 'MX', courseIds: ['loc'] },
    { id: 'b', name: 'Bruno Díaz', email: '', phone: '', country: 'AR', courseIds: ['loc', 'guion'] },
    { id: 'c', name: 'Carla Gómez', email: 'carla@mail.com', phone: '', country: 'ES', courseIds: [] },
  ]
  const ids = (list) => list.map((s) => s.id)

  it('busca por nombre (sin acentos), email y teléfono (también sin espacios)', () => {
    expect(studentMatches(students[1], 'diaz')).toBe(true)
    expect(studentMatches(students[2], 'carla@')).toBe(true)
    expect(studentMatches(students[0], '12345678')).toBe(true)
    expect(studentMatches(students[0], 'Bruno')).toBe(false)
  })

  it('combina curso y país', () => {
    expect(ids(filterStudents(students, {}))).toEqual(['a', 'b', 'c'])
    expect(ids(filterStudents(students, { courseId: 'loc' }))).toEqual(['a', 'b'])
    expect(ids(filterStudents(students, { courseId: 'loc', country: 'AR' }))).toEqual(['b'])
    expect(ids(filterStudents(students, { query: 'mail', courseId: 'loc' }))).toEqual(['a'])
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

describe('Discord', () => {
  it('se guarda sin espacios ni la @ del principio, y es opcional', () => {
    expect(normalizeDiscord('  @ana_ruiz ')).toBe('ana_ruiz')
    expect(normalizeDiscord('')).toBe('')
    expect(validateStudent({ ...base, discord: '' })).toBeNull()
    expect(validateStudent({ ...base, discord: 'x'.repeat(41) })).toBe('El usuario de Discord es demasiado largo.')
  })

  it('se puede buscar por el usuario de Discord', () => {
    expect(studentMatches({ name: 'Ana', discord: 'pixel.ana' }, 'PIXEL')).toBe(true)
  })

  it('los alumnos nuevos empiezan sin Discord ni cumpleaños', () => {
    expect(createStudent(base)).toMatchObject({ discord: '', birthday: '' })
  })
})

describe('cumpleaños y edad', () => {
  const on = (y, m, d) => new Date(y, m - 1, d, 12)

  it('la edad sube el mismo día del cumpleaños, no el anterior', () => {
    expect(ageOn('2008-03-12', on(2026, 3, 11))).toBe(17)
    expect(ageOn('2008-03-12', on(2026, 3, 12))).toBe(18)
    expect(ageOn('2008-03-12', on(2026, 12, 31))).toBe(18)
  })

  it('quien nació el 29 de febrero cumple el 28 de febrero en los años no bisiestos', () => {
    expect(ageOn('2008-02-29', on(2027, 2, 27))).toBe(18)
    expect(ageOn('2008-02-29', on(2027, 2, 28))).toBe(19)
    // En los bisiestos, el 29.
    expect(ageOn('2008-02-29', on(2028, 2, 28))).toBe(19)
    expect(ageOn('2008-02-29', on(2028, 2, 29))).toBe(20)
  })

  it('sin fecha (o con una que no existe) no hay edad', () => {
    expect(ageOn('', on(2026, 1, 1))).toBeNull()
    expect(ageOn('2007-02-29', on(2026, 1, 1))).toBeNull()
    expect(ageOn('2030-01-01', on(2026, 1, 1))).toBeNull()
  })

  it('textos de la ficha', () => {
    expect(ageLabel(1)).toBe('1 año')
    expect(ageLabel(17)).toBe('17 años')
    expect(birthdayLabel('2008-03-12')).toBe('12 de marzo de 2008')
    expect(birthdayLabel('')).toBe('')
  })

  it('es opcional, pero si se pone tiene que existir y no ser futura', () => {
    const today = on(2026, 10, 25)
    expect(validateStudent({ ...base, birthday: '' }, today)).toBeNull()
    expect(validateStudent({ ...base, birthday: '2008-02-29' }, today)).toBeNull()
    expect(validateStudent({ ...base, birthday: '2007-02-29' }, today)).toBe('La fecha de cumpleaños no es válida.')
    expect(validateStudent({ ...base, birthday: '1899-12-31' }, today)).toBe('La fecha de cumpleaños no es válida.')
    expect(validateStudent({ ...base, birthday: '2026-10-26' }, today)).toBe('La fecha de cumpleaños no puede ser futura.')
    expect(validateStudent({ ...base, birthday: '2026-10-25' }, today)).toBeNull()
  })

  it('un alumno guardado antes (sin Discord ni cumpleaños) sigue siendo válido y se edita igual', () => {
    const old = createStudent(base)
    localStorage.setItem('cesi_students_v1', JSON.stringify([{ ...base, id: old.id, courseIds: [] }]))
    expect(updateStudent(old.id, { birthday: '2008-03-12' })).toMatchObject({ name: base.name, birthday: '2008-03-12' })
  })
})

describe('perfil que rellenará el alumno con un enlace (preparado, sin usar)', () => {
  const courses = [{ id: 'c1', name: 'Locución' }]
  const profile = { discord: 'ana_ruiz', name: 'Ana', country: 'MX', timeZone: 'America/Mexico_City' }

  it('estos son los campos que podrá tocar, con Discord obligatorio y cumpleaños opcional', () => {
    expect(SELF_SERVICE_FIELDS.map((f) => f.field)).toEqual([
      'discord',
      'name',
      'birthday',
      'country',
      'timeZone',
      'email',
      'availability',
      'requestedCourseIds',
    ])
    const required = Object.fromEntries(SELF_SERVICE_FIELDS.map((f) => [f.field, f.required]))
    expect(required).toMatchObject({ discord: true, name: true, birthday: false, requestedCourseIds: false })
  })

  it('ignora lo que no puede tocar (cursos en los que está, notas, fecha de alta...)', () => {
    const patch = selfServicePatch({ ...profile, discord: '@ana_ruiz', courseIds: ['c1'], notes: 'x', enrolledAt: '2026-01-01', requestedCourseIds: ['c1'] })
    expect(patch).toEqual({ ...profile, requestedCourseIds: ['c1'] })
  })

  it('valida: Discord obligatorio, sin fecha de alta, y solo cursos que existen', () => {
    expect(validateSelfServiceProfile(profile, courses)).toBeNull()
    expect(validateSelfServiceProfile({ ...profile, discord: ' @ ' }, courses)).toBe('El usuario de Discord es obligatorio.')
    expect(validateSelfServiceProfile({ ...profile, requestedCourseIds: ['c1'] }, courses)).toBeNull()
    expect(validateSelfServiceProfile({ ...profile, requestedCourseIds: ['borrado'] }, courses)).toBe('Alguno de los cursos elegidos ya no existe.')
  })
})
