import { beforeEach, describe, expect, it } from 'vitest'
import {
  attendanceCountOfCourse,
  attendanceCountOfStudent,
  classStudents,
  classSummary,
  classWhen,
  courseClasses,
  courseZone,
  deleteExtraClass,
  extraClassFormValues,
  getAllAttendance,
  getAllExtraClasses,
  groupClasses,
  instantForClass,
  isJustified,
  markAllPresent,
  markAttendance,
  myTime,
  recordProblem,
  removeCourseAttendance,
  removeStudentAttendance,
  saveExtraClass,
  scheduleSince,
  setAttendanceTimes,
  setJustification,
  setLateMinutes,
  unmarkAttendance,
  validateExtraClass,
  validateTimes,
} from './attendance'
import { scheduleWithSince } from './courses'
import { buildBackup, parseBackup, restoreBackup } from './backup'

beforeEach(() => localStorage.clear())

// Lunes y miércoles a las 18:00 en Ciudad de México (UTC-6 todo el año). España cambia de hora
// el 25/10/2026: antes las 18:00 de México son las 02:00 del día siguiente en España; después, la 01:00.
const MX = 'America/Mexico_City'
const course = {
  id: 'guion',
  name: 'Guion',
  classMinutes: 60,
  classesPerWeek: 2,
  createdAt: '2026-10-01T10:00:00.000Z',
  schedule: { timeZone: MX, since: '2026-10-19', slots: [{ day: 1, start: '18:00' }, { day: 3, start: '18:00' }] },
}
const ana = { id: 'ana', name: 'Ana', courseIds: ['guion'] }
const bruno = { id: 'bruno', name: 'Bruno', courseIds: ['guion'] }
const carla = { id: 'carla', name: 'Carla', courseIds: [] }
const students = [ana, bruno, carla]

const NOW = new Date('2026-10-28T12:00:00Z') // miércoles 28, 13:00 en España
const classesOf = (c = course, opts = {}) => courseClasses(c, { now: NOW, weeksAhead: 1, records: getAllAttendance(), extraClasses: getAllExtraClasses(), ...opts })
const classAt = (key, c = course) => classesOf(c).find((x) => x.key === key)

describe('clases del curso (no se guardan ni van al calendario)', () => {
  it('salen del horario desde since hasta las próximas semanas', () => {
    expect(classesOf().map((c) => c.key)).toEqual([
      '2026-10-19_18:00',
      '2026-10-21_18:00',
      '2026-10-26_18:00',
      '2026-10-28_18:00',
      '2026-11-02_18:00',
      '2026-11-04_18:00',
    ])
    const oct26 = classAt('2026-10-26_18:00')
    expect([oct26.start.toISOString(), oct26.end.toISOString(), oct26.timeZone]).toEqual(['2026-10-27T00:00:00.000Z', '2026-10-27T01:00:00.000Z', MX])
  })

  it('en mi hora tienen en cuenta el cambio de hora de España', () => {
    expect(classWhen(classAt('2026-10-19_18:00'), 'Europe/Madrid')).toBe('mar 20 oct · 02:00–03:00')
    expect(classWhen(classAt('2026-10-26_18:00'), 'Europe/Madrid')).toBe('mar 27 oct · 01:00–02:00')
    expect(classWhen(classAt('2026-10-26_18:00'), MX)).toBe('lun 26 oct · 18:00–19:00')
  })

  it('un horario guardado antes (sin since) vale desde que se creó el curso', () => {
    const old = { ...course, createdAt: '2026-10-27T12:00:00Z', schedule: { ...course.schedule, since: undefined } }
    expect(scheduleSince(old)).toBe('2026-10-27')
    expect(classesOf(old)[0].key).toBe('2026-10-28_18:00')
  })

  it('al cambiar el horario vale desde hoy; si no cambia, conserva su since', () => {
    const next = { timeZone: MX, slots: [{ day: 2, start: '19:00' }] }
    expect(scheduleWithSince(next, course.schedule, NOW)).toEqual({ ...next, since: '2026-10-28' })
    expect(scheduleWithSince({ timeZone: MX, slots: [...course.schedule.slots].reverse() }, course.schedule, NOW).since).toBe('2026-10-19')
    expect(scheduleWithSince(null, course.schedule, NOW)).toBeNull()
  })

  it('el pase de lista se conserva aunque cambie el horario', () => {
    markAttendance(classAt('2026-10-19_18:00'), 'ana', 'present')
    const changed = { ...course, classesPerWeek: 1, schedule: { timeZone: MX, since: '2026-10-28', slots: [{ day: 2, start: '19:00' }] } }
    expect(classesOf(changed).map((c) => c.key)).toEqual(['2026-10-19_18:00', '2026-11-03_19:00'])
  })

  it('un curso sin horario solo tiene clases sueltas, en la zona del profesor', () => {
    const noSchedule = { id: 'loc', name: 'Locución', teacherId: 't' }
    expect(courseZone(noSchedule, [{ id: 't', timeZone: 'America/Bogota' }])).toBe('America/Bogota')
    expect(courseZone(noSchedule, [])).toBe('Europe/Madrid')
    expect(classesOf(noSchedule)).toEqual([])
  })

  it('se agrupan en hoy (en mi hora), sin pasar lista, pasadas y próximas', () => {
    markAttendance(classAt('2026-10-21_18:00'), 'ana', 'absent')
    const groups = groupClasses(classesOf(), getAllAttendance(), NOW)
    const keys = (list) => list.map((c) => c.key)
    // La del lunes 26 (México) es el martes 27 a la 01:00 en España; la del miércoles 28, el jueves 29.
    expect(keys(groups.today)).toEqual([])
    expect(keys(groups.pending)).toEqual(['2026-10-26_18:00', '2026-10-19_18:00'])
    expect(keys(groups.past)).toEqual(['2026-10-21_18:00'])
    expect(keys(groups.upcoming)).toEqual(['2026-10-28_18:00', '2026-11-02_18:00', '2026-11-04_18:00'])
    expect(keys(groupClasses(classesOf(), [], new Date('2026-10-29T08:00:00Z')).today)).toEqual(['2026-10-28_18:00'])
  })
})

describe('pase de lista', () => {
  const cls = () => classAt('2026-10-26_18:00') // 01:00–02:00 en España

  it('presente: entrada y salida son el inicio y el fin de la clase', () => {
    const r = markAttendance(cls(), 'ana', 'present')
    expect(r).toMatchObject({ courseId: 'guion', classKey: '2026-10-26_18:00', studentId: 'ana', status: 'present', lateMinutes: null, timeZone: MX })
    expect([myTime(r.arrivedAt), myTime(r.leftAt)]).toEqual(['01:00', '02:00'])
    expect([myTime(r.arrivedAt, MX), myTime(r.leftAt, MX)]).toEqual(['18:00', '19:00'])
  })

  it('retraso: los minutos salen de la entrada (escrita en mi hora) y se pueden cambiar', () => {
    markAttendance(cls(), 'ana', 'present')
    let r = markAttendance(cls(), 'ana', 'late')
    // Entró a la hora: faltan los minutos.
    expect(r.lateMinutes).toBeNull()
    expect(recordProblem(r)).toBe('Faltan los minutos de retraso.')
    // Al poner los minutos, la entrada pasa a ser inicio + minutos.
    r = setLateMinutes(cls(), 'ana', 10)
    expect([r.lateMinutes, myTime(r.arrivedAt)]).toEqual([10, '01:10'])
    // Al cambiar la entrada se vuelven a calcular.
    r = setAttendanceTimes(cls(), 'ana', { arrived: '01:25', left: '02:00' })
    expect([r.lateMinutes, myTime(r.arrivedAt, MX)]).toEqual([25, '18:25'])
    // Y se pueden cambiar sin tocar la entrada.
    r = setLateMinutes(cls(), 'ana', 20)
    expect([r.lateMinutes, myTime(r.arrivedAt)]).toEqual([20, '01:25'])
    expect(() => setLateMinutes(cls(), 'ana', 0)).toThrow(/del 1 al 600/)
  })

  it('falta: sin entrada ni salida; y se puede volver a dejar sin marcar', () => {
    markAttendance(cls(), 'ana', 'present')
    expect(markAttendance(cls(), 'ana', 'absent')).toMatchObject({ status: 'absent', arrivedAt: null, leftAt: null })
    unmarkAttendance(cls(), 'ana')
    expect(getAllAttendance()).toEqual([])
  })

  it('sin marcar no cuenta como falta; «todos presentes» solo marca a los inscritos sin marcar', () => {
    const c = cls()
    markAttendance(c, 'ana', 'absent')
    expect(classSummary(c, students, getAllAttendance())).toMatchObject({ present: 0, late: 0, absent: 1, unmarked: 1 })
    expect(markAllPresent(c, students)).toBe(1)
    expect(classSummary(c, students, getAllAttendance())).toMatchObject({ present: 1, late: 0, absent: 1, unmarked: 0 })
  })

  it('salen los inscritos y los que tienen pase de lista aunque ya no estén en el curso', () => {
    const c = cls()
    markAttendance(c, 'carla', 'present')
    expect(classStudents(c, students, getAllAttendance()).map((r) => [r.student.id, r.enrolled, r.record?.status ?? null])).toEqual([
      ['ana', true, null],
      ['bruno', true, null],
      ['carla', false, 'present'],
    ])
  })
})

describe('justificaciones', () => {
  const cls = () => classAt('2026-10-26_18:00')

  it('una falta o un retraso se marca como justificado con su motivo', () => {
    markAttendance(cls(), 'ana', 'absent')
    let r = setJustification(cls(), 'ana', { justified: true, justification: '  Cita médica ' })
    expect([r.justified, r.justification, isJustified(r), recordProblem(r)]).toEqual([true, 'Cita médica', true, null])

    markAttendance(cls(), 'bruno', 'late')
    setLateMinutes(cls(), 'bruno', 15)
    r = setJustification(cls(), 'bruno', { justified: true, justification: 'Problema de conexión' })
    expect(isJustified(r)).toBe(true)
    expect(classSummary(cls(), students, getAllAttendance())).toMatchObject({ late: 1, absent: 1, justifiedLate: 1, justifiedAbsent: 1 })
  })

  it('sin motivo se guarda igual pero avisa; al quitar la justificación se borra el motivo', () => {
    markAttendance(cls(), 'ana', 'absent')
    let r = setJustification(cls(), 'ana', { justified: true, justification: '' })
    expect(recordProblem(r)).toBe('Falta el motivo de la justificación.')
    setJustification(cls(), 'ana', { justified: true, justification: 'Enfermedad' })
    r = setJustification(cls(), 'ana', { justified: false, justification: 'Enfermedad' })
    expect([r.justified, r.justification, recordProblem(r)]).toEqual([false, '', null])
    expect(() => setJustification(cls(), 'ana', { justified: true, justification: 'x'.repeat(501) })).toThrow(/500 caracteres/)
  })

  it('entre falta y retraso se conserva; si pasa a presente, se quita; sin falta ni retraso no se puede', () => {
    markAttendance(cls(), 'ana', 'absent')
    setJustification(cls(), 'ana', { justified: true, justification: 'Viaje' })
    expect(markAttendance(cls(), 'ana', 'late')).toMatchObject({ justified: true, justification: 'Viaje' })
    expect(markAttendance(cls(), 'ana', 'absent')).toMatchObject({ justified: true, justification: 'Viaje' })
    const r = markAttendance(cls(), 'ana', 'present')
    expect([r.justified, r.justification, isJustified(r)]).toEqual([false, '', false])
    expect(() => setJustification(cls(), 'ana', { justified: true, justification: 'x' })).toThrow('Solo se justifica una falta o un retraso.')
    expect(() => setJustification(cls(), 'bruno', { justified: true, justification: 'x' })).toThrow('Solo se justifica una falta o un retraso.')
  })

  it('los registros guardados antes (sin justified) no están justificados', () => {
    expect(isJustified({ status: 'absent' })).toBe(false)
    expect(isJustified({ status: 'present', justified: true })).toBe(false)
    expect(recordProblem({ status: 'absent' })).toBeNull()
  })
})

describe('horas de entrada y salida (en mi hora)', () => {
  it('una hora de madrugada en España es del día de la clase, no del anterior', () => {
    const c = classAt('2026-10-26_18:00') // martes 27, 01:00–02:00 en España
    expect(instantForClass('01:15', c).toISOString()).toBe('2026-10-27T00:15:00.000Z')
    // Las 23:50 del lunes 26 en España, 10 min antes de empezar.
    expect(instantForClass('23:50', c).toISOString()).toBe('2026-10-26T22:50:00.000Z')
    expect(instantForClass('1:15', c)).toBeNull()
  })

  it('la salida, posterior a la entrada y como mucho a las 23:59 del día de la clase en la hora del curso', () => {
    const c = classAt('2026-10-26_18:00')
    const at = (hhmm) => instantForClass(hhmm, c)
    expect(validateTimes(c, at('01:00'), at('02:00'))).toBeNull()
    expect(validateTimes(c, at('02:00'), at('01:30'))).toBe('La salida tiene que ser posterior a la entrada.')
    // 07:00 en España = 00:00 del día siguiente en México.
    expect(validateTimes(c, at('01:00'), at('07:00'))).toMatch(/23:59 del día de la clase/)
    expect(validateTimes(c, at('06:58'), at('06:59'))).toMatch(/entre 3 h antes del inicio y 3 h después/)
    expect(validateTimes(c, at('21:30'), at('02:00'))).toMatch(/entre 3 h antes del inicio y 3 h después/)
    markAttendance(c, 'ana', 'present')
    expect(() => setAttendanceTimes(c, 'ana', { arrived: '01:00', left: '07:00' })).toThrow(/23:59/)
  })
})

describe('clases sueltas', () => {
  it('se valida la fecha, la hora, la duración, el cambio de hora y el límite de 23:59', () => {
    const ok = { date: '2026-11-07', start: '10:00', minutes: 60 }
    expect(validateExtraClass(ok, MX)).toBeNull()
    expect(validateExtraClass({ ...ok, date: '' }, MX)).toBe('Pon la fecha de la clase.')
    expect(validateExtraClass({ ...ok, start: '' }, MX)).toBe('Pon la hora de la clase.')
    expect(validateExtraClass({ ...ok, minutes: 5 }, MX)).toMatch(/duración/)
    expect(validateExtraClass({ ...ok, start: '23:00', minutes: 60 }, MX)).toMatch(/23:59/)
    expect(validateExtraClass({ ...ok, start: '23:00', minutes: 59 }, MX)).toBeNull()
    expect(validateExtraClass({ date: '2027-03-28', start: '02:30', minutes: 60 }, 'Europe/Madrid')).toMatch(/cambio de hora/)
  })

  it('salen entre las clases del curso con su nota; al moverlas, su pase de lista va con ellas; al borrarlas, también se borra', () => {
    const x = saveExtraClass('guion', { date: '2026-11-07', start: '10:00', minutes: 90, note: 'Recuperación' }, MX)
    const key = `extra:${x.id}`
    const cls = classAt(key)
    expect([cls.date, cls.note, classWhen(cls, MX)]).toEqual(['2026-11-07', 'Recuperación', 'sáb 7 nov · 10:00–11:30'])
    markAttendance(cls, 'ana', 'present')

    saveExtraClass('guion', { date: '2026-11-08', start: '11:00', minutes: 60, note: 'Recuperación' }, MX, x.id)
    expect(extraClassFormValues(getAllExtraClasses()[0])).toEqual({ date: '2026-11-08', start: '11:00', minutes: 60, note: 'Recuperación' })
    expect(getAllAttendance()[0]).toMatchObject({ classKey: key, classStart: '2026-11-08T17:00:00.000Z', classEnd: '2026-11-08T18:00:00.000Z' })

    deleteExtraClass(x.id)
    expect([getAllExtraClasses(), getAllAttendance()]).toEqual([[], []])
  })
})

describe('al borrar un alumno o un curso', () => {
  it('se borra su pase de lista (y las clases sueltas del curso); lo demás se queda', () => {
    const other = { ...course, id: 'loc' }
    markAttendance(classAt('2026-10-19_18:00'), 'ana', 'present')
    markAttendance(classAt('2026-10-19_18:00'), 'bruno', 'absent')
    markAttendance(classAt('2026-10-19_18:00', other), 'ana', 'present')
    saveExtraClass('guion', { date: '2026-11-07', start: '10:00', minutes: 60 }, MX)
    expect(attendanceCountOfStudent('ana')).toBe(2)
    expect(attendanceCountOfCourse('guion')).toEqual({ records: 2, extraClasses: 1 })

    removeStudentAttendance('ana')
    expect(getAllAttendance().map((r) => [r.studentId, r.courseId])).toEqual([['bruno', 'guion']])
    removeCourseAttendance('guion')
    expect([getAllAttendance(), getAllExtraClasses()]).toEqual([[], []])
  })
})

describe('copia de seguridad', () => {
  it('incluye el pase de lista y las clases sueltas; una copia anterior se importa sin ellos', () => {
    markAttendance(classAt('2026-10-19_18:00'), 'ana', 'present')
    saveExtraClass('guion', { date: '2026-11-07', start: '10:00', minutes: 60 }, MX)
    const backup = buildBackup()
    expect([backup.attendance.length, backup.extraClasses.length]).toEqual([1, 1])
    localStorage.clear()
    restoreBackup(parseBackup(JSON.stringify(backup)))
    expect([getAllAttendance().length, getAllExtraClasses().length]).toEqual([1, 1])

    const old = { ...backup, version: 18 }
    delete old.attendance
    delete old.extraClasses
    restoreBackup(parseBackup(JSON.stringify(old)))
    expect([getAllAttendance(), getAllExtraClasses()]).toEqual([[], []])
  })
})
