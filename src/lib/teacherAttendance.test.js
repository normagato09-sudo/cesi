import { describe, expect, it, vi } from 'vitest'
import { pickRecord } from './attendance'
import { removeRecord, replaceRecord, teacherAttendanceActions, teacherPayload } from './teacherAttendance'

const cls = {
  key: '2030-11-04_18:00',
  courseId: 'c1',
  date: '2030-11-04',
  start: new Date('2030-11-04T17:00:00.000Z'),
  end: new Date('2030-11-04T18:00:00.000Z'),
  timeZone: 'Europe/Madrid',
  extraId: null,
  note: '',
}
const rec = (studentId, extra = {}) => ({ id: `r-${studentId}`, courseId: 'c1', classKey: cls.key, studentId, status: 'present', updatedAt: '2030-11-04T18:00:00.000Z', ...extra })

// Cliente simulado: guarda lo que se envía y devuelve el registro como lo haría la función.
function fakeClient() {
  const calls = []
  return {
    calls,
    rpc: vi.fn(async (fn, args) => {
      calls.push([fn, args])
      if (fn === 'cesi_teacher_attendance_save') {
        return { data: { id: `s-${args.p_student_id}`, courseId: args.p_course_id, classKey: args.p_class_key, studentId: args.p_student_id, ...args.p_data }, error: null }
      }
      return { data: null, error: null }
    }),
  }
}

// onChange recibe una función: se aplica sobre la última lista, como hace la pantalla.
function holder(initial) {
  const box = { records: initial }
  return { box, onChange: (update) => (box.records = update(box.records)) }
}

describe('pase de lista del profesor', () => {
  it('envía solo los campos del pase de lista', () => {
    expect(teacherPayload({ status: 'absent', arrivedAt: 'x', leftAt: 'y', lateMinutes: 5, justified: true, justification: 'Médico', id: 'r' })).toEqual({
      status: 'absent',
      lateMinutes: null,
      arrivedAt: null,
      leftAt: null,
      justified: true,
      justification: 'Médico',
    })
  })

  it('sustituye el registro (y los repetidos) o lo quita', () => {
    const list = [rec('a'), rec('a', { id: 'dup' }), rec('b')]
    const saved = rec('a', { id: 'nuevo', status: 'late' })
    expect(replaceRecord(list, saved).map((r) => r.id)).toEqual(['r-b', 'nuevo'])
    expect(removeRecord(list, cls, 'a').map((r) => r.id)).toEqual(['r-b'])
  })

  it('marcar: calcula el cambio como en mi app y lo guarda con la función', async () => {
    const client = fakeClient()
    const { box, onChange } = holder([])
    const actions = teacherAttendanceActions({ client, records: [], students: [], onChange })
    await actions.mark(cls, 'a', 'present')
    expect(client.calls[0][0]).toBe('cesi_teacher_attendance_save')
    expect(client.calls[0][1]).toMatchObject({
      p_course_id: 'c1',
      p_class_key: cls.key,
      p_student_id: 'a',
      p_data: { status: 'present', arrivedAt: cls.start.toISOString(), leftAt: cls.end.toISOString(), justified: false },
    })
    expect(box.records.map((r) => r.studentId)).toEqual(['a'])
  })

  it('un error de validación no llega a enviarse', async () => {
    const client = fakeClient()
    const actions = teacherAttendanceActions({ client, records: [], students: [], onChange: () => {} })
    await expect(actions.setLateMinutes(cls, 'a', 5)).rejects.toThrow('Marca primero el retraso.')
    expect(client.calls).toHaveLength(0)
  })

  it('todos presentes: solo los inscritos sin marcar, sin perder ninguno', async () => {
    const client = fakeClient()
    const students = [
      { id: 'a', courseIds: ['c1'] },
      { id: 'b', courseIds: ['c1'] },
      { id: 'c', courseIds: ['c1'] },
      { id: 'otro', courseIds: ['c2'] },
    ]
    const { box, onChange } = holder([rec('b')])
    const actions = teacherAttendanceActions({ client, records: box.records, students, onChange })
    await actions.markAllPresent(cls)
    expect(client.calls.map(([, args]) => args.p_student_id)).toEqual(['a', 'c'])
    expect(box.records.map((r) => r.studentId).sort()).toEqual(['a', 'b', 'c'])
  })

  it('dejar sin marcar', async () => {
    const client = fakeClient()
    const { box, onChange } = holder([rec('a'), rec('b')])
    const actions = teacherAttendanceActions({ client, records: box.records, students: [], onChange })
    await actions.unmark(cls, 'a')
    expect(client.calls[0]).toEqual(['cesi_teacher_attendance_clear', { p_course_id: 'c1', p_class_key: cls.key, p_student_id: 'a' }])
    expect(box.records.map((r) => r.studentId)).toEqual(['b'])
  })

  it('con dos registros del mismo alumno y clase, vale el más reciente', () => {
    const old = rec('a', { id: 'viejo', status: 'absent', updatedAt: '2030-11-04T18:00:00.000Z' })
    const recent = rec('a', { id: 'nuevo', status: 'late', updatedAt: '2030-11-04T18:05:00.000Z' })
    expect(pickRecord([recent, old], cls, 'a').id).toBe('nuevo')
    expect(pickRecord([old, recent], cls, 'a').id).toBe('nuevo')
    expect(pickRecord([old], cls, 'b')).toBe(null)
  })
})
