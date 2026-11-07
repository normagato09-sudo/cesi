import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { dayText, freeSeats, progressPercent, progressText, scheduleInZone, splitCourses, studentCoursesErrorText } from './studentCourses'

describe('cursos del alumno', () => {
  it('el horario en su zona (con el cambio de hora)', () => {
    const course = { schedule: { timeZone: 'Europe/Madrid', slots: [{ day: 1, start: '18:00' }] }, class_minutes: 60 }
    const now = new Date('2030-11-04T08:00:00Z')
    expect(scheduleInZone(course, 'Europe/Madrid', now)).toEqual(['Lun 18:00–19:00'])
    expect(scheduleInZone(course, 'America/Mexico_City', now)).toEqual(['Lun 11:00–12:00'])
    expect(scheduleInZone({ schedule: null }, 'Europe/Madrid', now)).toEqual([])
  })

  it('plazas libres, progreso y fechas', () => {
    expect(freeSeats({ max_seats: 20, enrolled: 14 })).toBe(6)
    expect(freeSeats({ max_seats: null, enrolled: 14 })).toBe(null)
    expect(progressText({ done_classes: 4, total_classes: 12 })).toBe('4 de 12 clases')
    expect(progressText({ done_classes: 1, total_classes: null })).toBe('1 clase hecha')
    expect(progressPercent({ done_classes: 3, total_classes: 12 })).toBe(25)
    expect(progressPercent({ done_classes: 3 })).toBe(null)
    expect(dayText('2030-11-03')).toBe('3 de noviembre')
    expect(splitCourses([{ id: 'a', mine: true }, { id: 'b', mine: false }]).open.map((c) => c.id)).toEqual(['b'])
  })
})

describe('el equipo en los cursos (parte 39)', () => {
  const sql = readFileSync(new URL('../../supabase/parte39_equipo_en_cursos.sql', import.meta.url), 'utf8').replace(/\r\n/g, '\n')

  it('alumnos y equipo se apuntan con su ficha de alumno; nadie a un curso que da', () => {
    expect(sql).toContain("where id = v_me and role in ('alumno', 'equipo')")
    expect(sql).toContain("where pr.id = p_profile and pr.role in ('alumno', 'equipo')")
    expect(sql).toContain("when v_acc.role = 'equipo' then jsonb_build_object('fromTeam', true)")
    expect(sql).toContain("if p_course in (select public.cesi_teacher_courses(v_me)) then")
    // Las internas siguen sin poder llamarse.
    expect(sql).toContain('revoke all on function public.cesi_student_ficha(uuid, uuid) from public, anon, authenticated;')
    expect(sql).toContain('revoke all on function public.cesi_student_courses(uuid) from public, anon, authenticated;')
    // Ya no lleva las candidaturas (parte 40).
    expect(sql).not.toContain('vacancy_applications')
  })

  it('sin el SQL de la parte 39, el equipo ve qué falta', () => {
    expect(studentCoursesErrorText({ code: '42501', message: 'Solo los alumnos pueden apuntarse a los cursos.' })).toMatch(/parte 39/)
  })
})
