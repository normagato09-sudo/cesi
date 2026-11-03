// «Asistencia» del portal del alumno: su asistencia en cada curso (cesi_my_attendance, parte 31,
// que solo devuelve la suya). Como en la app de la ceo: cuentan las clases con lista pasada y los
// retrasos cuentan como venidos.

export const MY_STATUS_LABEL = { present: 'Presente', late: 'Retraso', absent: 'Falta' }

// Fila de cesi_my_attendance → registro.
export function rowToRecord(r) {
  return {
    courseId: r.course_id,
    courseName: r.course_name || 'Curso',
    classKey: r.class_key,
    start: r.class_start ? new Date(r.class_start) : null,
    timeZone: r.time_zone || 'Europe/Madrid',
    status: r.status,
    justified: !!r.justified,
    lateMinutes: r.late_minutes ?? null,
  }
}

// «Presente», «Retraso (10 min) · Justificada», «Falta · Justificada».
export function statusText(record) {
  const base = MY_STATUS_LABEL[record.status] || record.status
  const late = record.status === 'late' && record.lateMinutes ? ` (${record.lateMinutes} min)` : ''
  return `${base}${late}${record.justified ? ' · Justificada' : ''}`
}

/**
 * Por curso: [{ courseId, name, attended, marked, percent, records }] (records, de la más reciente a
 * la más antigua). myCourses: [{ id, name }] sus cursos, para que salgan también los que aún no
 * tienen lista. Por nombre de curso.
 */
export function summarizeMyAttendance(records, myCourses = []) {
  const byCourse = new Map()
  for (const c of myCourses) byCourse.set(c.id, { courseId: c.id, name: c.name || 'Curso', records: [] })
  for (const r of records) {
    if (!byCourse.has(r.courseId)) byCourse.set(r.courseId, { courseId: r.courseId, name: r.courseName, records: [] })
    byCourse.get(r.courseId).records.push(r)
  }
  return [...byCourse.values()]
    .map((c) => {
      const records = [...c.records].sort((a, b) => (b.start?.getTime() || 0) - (a.start?.getTime() || 0))
      const attended = records.filter((r) => r.status === 'present' || r.status === 'late').length
      return { ...c, records, attended, marked: records.length, percent: records.length ? Math.round((attended / records.length) * 100) : null }
    })
    .sort((a, b) => a.name.localeCompare(b.name, 'es', { sensitivity: 'base' }))
}

// «Has venido a 8 de 10 clases (80 %)».
export function summaryText({ attended, marked, percent }) {
  if (!marked) return 'Todavía no se ha pasado lista en ninguna clase.'
  return `Has venido a ${attended} de ${marked} ${marked === 1 ? 'clase' : 'clases'} (${percent} %)`
}

export async function listMyAttendance(client) {
  const { data, error } = await client.rpc('cesi_my_attendance')
  if (error) throw error
  return (data || []).map(rowToRecord)
}

export function myAttendanceErrorText(err) {
  if (err?.code === 'PGRST202' || err?.code === '42883') return 'La asistencia aún no está disponible. Inténtalo más tarde.'
  return err?.message || 'No se pudo cargar tu asistencia.'
}
