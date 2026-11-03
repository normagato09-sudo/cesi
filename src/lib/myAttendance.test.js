import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { rowToRecord, statusText, summarizeMyAttendance, summaryText } from './myAttendance'

const row = (course, key, status, extra = {}) => ({
  course_id: course,
  course_name: course === 'office' ? 'Office' : 'Excel',
  class_key: key,
  class_start: `${key}T17:00:00Z`,
  time_zone: 'Europe/Madrid',
  status,
  justified: false,
  late_minutes: null,
  ...extra,
})

describe('la asistencia del alumno', () => {
  it('resume cada curso como la ceo: los retrasos cuentan como venidos', () => {
    const records = [
      row('office', '2030-11-04', 'present'),
      row('office', '2030-11-06', 'late', { late_minutes: 10, justified: true }),
      row('office', '2030-11-11', 'absent'),
      row('office', '2030-11-13', 'present'),
      row('office', '2030-11-18', 'present'),
    ].map(rowToRecord)
    const [office, excel] = summarizeMyAttendance(records, [
      { id: 'office', name: 'Office' },
      { id: 'excel', name: 'Excel' },
    ]).sort((a, b) => (a.courseId === 'office' ? -1 : b.courseId === 'office' ? 1 : 0))
    expect(summaryText(office)).toBe('Has venido a 4 de 5 clases (80 %)')
    expect(office.records[0].classKey).toBe('2030-11-18')
    expect(statusText(office.records.find((r) => r.status === 'late'))).toBe('Retraso (10 min) · Justificada')
    expect(summaryText(excel)).toBe('Todavía no se ha pasado lista en ninguna clase.')
  })

  it('un alumno nunca ve la asistencia de otro: la función solo devuelve la de su cuenta', () => {
    const sql = readFileSync(new URL('../../supabase/parte31_mi_asistencia.sql', import.meta.url), 'utf8').replace(/\r\n/g, '\n')
    // Solo una cuenta de alumno (cesi_student_me da error con cualquier otra).
    expect(sql).toContain('v_me uuid := public.cesi_student_me();')
    // La ficha es la unida a SU cuenta (auth.uid), no un parámetro que se pueda cambiar.
    expect(sql).toContain('select p.linked_student_id into v_student from public.profiles p where p.id = v_me;')
    expect(sql).toMatch(/create or replace function public\.cesi_my_attendance\(\)\n/)
    // Solo sus registros y de sus cursos; sin el motivo de la justificación.
    expect(sql).toContain("and a.data ->> 'studentId' = v_student")
    expect(sql).toContain("and a.data ->> 'courseId' in (select public.cesi_student_courses(v_me))")
    expect(sql).not.toContain("'justification'")
    // Sin acceso directo a la tabla: la asistencia sigue siendo solo de la ceo (parte 2).
    expect(sql).not.toMatch(/grant [a-z, ]+ on (table )?public\.attendance/)
  })

  it('el resumen de un alumno solo usa sus registros', () => {
    const mine = [row('office', '2030-11-04', 'present')].map(rowToRecord)
    const [office] = summarizeMyAttendance(mine, [{ id: 'office', name: 'Office' }])
    expect(office.marked).toBe(1)
    expect(office.records.every((r) => r.courseId === 'office')).toBe(true)
  })
})
