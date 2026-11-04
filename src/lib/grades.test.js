import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { average, gradesByCourse, parseScore, scoreText, scoreTone, studentAverage, summaryMaps, validateGrade } from './grades'

describe('calificaciones', () => {
  it('notas de 0 a 10, con coma o punto', () => {
    expect([parseScore('7,5'), parseScore('10'), parseScore('0'), parseScore('11'), parseScore(''), parseScore('abc')]).toEqual([7.5, 10, 0, null, null, null])
    expect([scoreText(7.5), scoreText(10), scoreText(null)]).toEqual(['7,5', '10', '—'])
    expect([scoreTone(8), scoreTone(6), scoreTone(3), scoreTone(null)]).toEqual(['good', 'warn', 'bad', 'none'])
  })

  it('el formulario del profesor', () => {
    const ok = { student: 's1', activity: 'Examen 1', day: '2026-11-04', score: '8' }
    expect(validateGrade(ok)).toBe(null)
    expect(validateGrade({ ...ok, student: '' })).toBe('Elige el alumno.')
    expect(validateGrade({ ...ok, activity: ' ' })).toBe('Escribe la actividad.')
    expect(validateGrade({ ...ok, score: '12' })).toBe('La nota va de 0 a 10.')
  })

  it('el alumno ve las suyas por curso, con su media', () => {
    const rows = [
      { course_id: 'o', course_name: 'Office', score: '8' },
      { course_id: 'o', course_name: 'Office', score: '6.5' },
      { course_id: 'e', course_name: 'Excel', score: '9' },
    ]
    expect(gradesByCourse(rows).map((c) => [c.name, c.average, c.grades.length])).toEqual([
      ['Excel', 9, 1],
      ['Office', 7.25, 2],
    ])
    expect(average([])).toBe(null)
  })

  it('medias de cursos y alumnos (para las tarjetas)', () => {
    const maps = summaryMaps([
      { course_id: 'o', student_id: null, average: '7.5', count: 4 },
      { course_id: 'o', student_id: 's1', average: '8', count: 2 },
      { course_id: 'e', student_id: 's1', average: '5', count: 1 },
    ])
    expect(maps.course.get('o').average).toBe(7.5)
    expect(studentAverage(maps, 's1')).toBe(7)
    expect(studentAverage(maps, 's2')).toBe(null)
  })

  it('permisos en la base de datos', () => {
    const sql = readFileSync(new URL('../../supabase/parte36_calificaciones.sql', import.meta.url), 'utf8').replace(/\r\n/g, '\n')
    // Solo el profesor del curso escribe y borra, y solo a alumnos de ese curso.
    expect(sql).toMatch(/cesi_grade_save[\s\S]*?if not public\.cesi_grade_teacher\(v_me, p_course\) then/)
    expect(sql).toMatch(/cesi_grade_save[\s\S]*?if not public\.cesi_grade_enrolled\(p_course, p_student\) then/)
    expect(sql).toMatch(/cesi_grade_delete[\s\S]*?not public\.cesi_grade_teacher\(v_me, v_course\)/)
    // El alumno, solo las suyas y de sus cursos.
    expect(sql).toContain('where g.student_id = v_student')
    expect(sql).toContain('and g.course_id in (select public.cesi_student_courses(v_me))')
    // Ver un curso: su profesor, la ceo o Directivo.
    expect(sql).toContain('if not (v_teacher or public.cesi_grade_viewer(v_me)) then')
    expect(sql).toContain('revoke all on public.grades from anon, authenticated;')
  })
})
