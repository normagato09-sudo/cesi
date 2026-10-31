import { SPAIN_ZONE } from './timezones'
import { justificationPatch, lateMinutesPatch, markPatch, pickRecord, timesPatch, unmarkedStudents } from './attendance'

// Pase de lista del profesor (parte 15): los mismos cambios que en mi app (markPatch, timesPatch…),
// calculados sobre el pase de lista que ve, pero guardados con cesi_teacher_attendance_save /
// cesi_teacher_attendance_clear, que comprueban que el curso es suyo y escriben en mis datos. Me
// llegan como un cambio de otro dispositivo; si los dos marcamos al mismo alumno a la vez, gana el
// último cambio.

// Los campos que se envían (lo demás lo pone la función).
export function teacherPayload(record) {
  return {
    status: record.status,
    lateMinutes: record.status === 'late' ? record.lateMinutes ?? null : null,
    arrivedAt: record.status === 'absent' ? null : record.arrivedAt || null,
    leftAt: record.status === 'absent' ? null : record.leftAt || null,
    justified: !!record.justified,
    justification: record.justification || '',
  }
}

// Sustituye (o añade) el registro guardado en la lista y quita los repetidos de ese alumno y clase.
export function replaceRecord(records, saved) {
  const same = (r) => r.courseId === saved.courseId && r.classKey === saved.classKey && r.studentId === saved.studentId
  return [...records.filter((r) => !same(r)), saved]
}

export function removeRecord(records, cls, studentId) {
  return records.filter((r) => !(r.courseId === cls.courseId && r.classKey === cls.key && r.studentId === studentId))
}

/**
 * Las acciones del pase de lista para el profesor (las de AttendanceModal). Devuelven promesas y
 * lanzan un Error con el mensaje para el usuario.
 * records: el pase de lista que ve ahora; onChange(update): update(lista) da la lista después de
 * guardar (para aplicarlo sobre la última, aunque se marquen varios seguidos).
 */
export function teacherAttendanceActions({ client, records, students, onChange, myZone = SPAIN_ZONE }) {
  // Guarda y devuelve la lista nueva (la siguiente acción de «Todos presentes» parte de ella).
  const saveIn = async (list, cls, studentId, patchFor) => {
    const current = pickRecord(list, cls, studentId)
    const patch = patchFor(current)
    const record = { ...(current || {}), ...patch }
    const { data, error } = await client.rpc('cesi_teacher_attendance_save', {
      p_course_id: cls.courseId,
      p_class_key: cls.key,
      p_student_id: studentId,
      p_data: teacherPayload(record),
    })
    if (error) throw new Error(teacherErrorText(error))
    onChange((prev) => replaceRecord(prev, data))
    return replaceRecord(list, data)
  }
  const save = (cls, studentId, patchFor) => saveIn(records, cls, studentId, patchFor)

  return {
    mark: (cls, studentId, status) => save(cls, studentId, (current) => markPatch(current, cls, status)),
    setTimes: (cls, studentId, times) => save(cls, studentId, (current) => timesPatch(current, cls, times, myZone)),
    setLateMinutes: (cls, studentId, minutes) => save(cls, studentId, (current) => lateMinutesPatch(current, cls, minutes)),
    setJustification: (cls, studentId, input) => save(cls, studentId, (current) => justificationPatch(current, input)),
    unmark: async (cls, studentId) => {
      const { error } = await client.rpc('cesi_teacher_attendance_clear', { p_course_id: cls.courseId, p_class_key: cls.key, p_student_id: studentId })
      if (error) throw new Error(teacherErrorText(error))
      onChange((prev) => removeRecord(prev, cls, studentId))
    },
    markAllPresent: async (cls) => {
      let list = records
      for (const student of unmarkedStudents(cls, students, records)) {
        list = await saveIn(list, cls, student.id, (current) => markPatch(current, cls, 'present'))
      }
    },
    // El profesor no crea ni cambia clases sueltas.
    saveExtraClass: () => {},
    deleteExtraClass: () => {},
  }
}

export function teacherErrorText(err) {
  if (err?.code === 'PGRST202' || err?.code === '42883') return 'Falta ejecutar en Supabase el SQL de la parte 15 (pasar lista del profesor).'
  return err?.message || 'No se pudo guardar. Comprueba la conexión.'
}
