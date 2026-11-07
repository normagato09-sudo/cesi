import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { over10, parseScoreText, scoreOf, submissionStatus, taskFormOf, toLocalInput, validateGradeForm, validateSubmission, validateTask } from './courseTasks'

const sql = readFileSync(new URL('../../supabase/parte42_tareas_y_examenes.sql', import.meta.url), 'utf8').replace(/\r\n/g, '\n')
function body(fn) {
  const start = sql.indexOf(`create or replace function public.${fn}(`)
  expect(start, fn).toBeGreaterThan(-1)
  return sql.slice(start, sql.indexOf('$$;', sql.indexOf('$$', start) + 2))
}

describe('tareas: estados, notas y formularios', () => {
  const due = '2026-11-12T22:59:00.000Z'

  it('Pendiente, Entregada, Entregada tarde y Corregida', () => {
    expect(submissionStatus(null, due, null)).toBe('pendiente')
    expect(submissionStatus('2026-11-12T10:00:00Z', due, null)).toBe('entregada')
    expect(submissionStatus('2026-11-13T10:00:00Z', due, null)).toBe('tarde')
    expect(submissionStatus('2026-11-13T10:00:00Z', due, 7)).toBe('corregida')
    expect(submissionStatus('2026-11-12T10:00:00Z', due, 0)).toBe('corregida')
  })

  it('la nota pasa a las calificaciones sobre 10', () => {
    expect(over10(4, 5)).toBe(8)
    expect(over10(7.5, 10)).toBe(7.5)
    expect(over10(2, 3)).toBe(6.67)
    expect(scoreOf(7.5, 10)).toBe('7,5 / 10')
    expect(parseScoreText('7,25')).toBe(7.25)
    expect(parseScoreText('abc')).toBe(null)
  })

  it('formularios: tarea, entrega y corrección', () => {
    const task = { kind: 'examen', title: 'Examen 1', instructions: '', due: '2026-11-20T10:00', maxScore: '10' }
    expect(validateTask(task)).toBe(null)
    expect(validateTask({ ...task, title: '' })).toMatch(/título/)
    expect(validateTask({ ...task, due: '' })).toMatch(/fecha/)
    expect(validateTask({ ...task, maxScore: '12' })).toMatch(/0,5 a 10/)
    expect(validateTask({ ...task, maxScore: '0' })).toMatch(/0,5 a 10/)
    expect(validateSubmission({ text: ' ' })).toMatch(/respuesta/)
    expect(validateSubmission({ text: 'Mi respuesta' })).toBe(null)
    expect(validateSubmission({ text: '', file: { name: 'a.exe', size: 10 } })).toMatch(/tipo/)
    expect(validateGradeForm({ score: '6' }, 5)).toMatch(/de 0 a 5/)
    expect(validateGradeForm({ score: '4,5', feedback: 'Bien' }, 5)).toBe(null)
    expect(taskFormOf({ kind: 'tarea', title: 'T', instructions: null, file_path: null, file_name: '', file_size: 0, due_at: '2026-11-20T09:00:00Z', max_score: 7.5 }).maxScore).toBe('7,5')
    expect(toLocalInput('bad')).toBe('')
  })
})

describe('tareas: permisos en la base de datos (parte 42)', () => {
  it('tablas cerradas a todos', () => {
    expect(sql).toContain('revoke all on public.course_tasks from public, anon, authenticated;')
    expect(sql).toContain('revoke all on public.task_submissions from public, anon, authenticated;')
    expect(sql).not.toMatch(/create policy/i)
    expect(sql).not.toMatch(/to anon/)
  })

  it('cada inscrito ve solo su entrega; el resto, solo cuántas hay', () => {
    const tasks = body('cesi_room_tasks')
    expect(tasks).toMatch(/if v_role is null then\s+raise exception/)
    expect(tasks).toMatch(/if not public\.cesi_room_can_enter\(v_me, p_course\) then\s+return;/)
    expect(tasks).toContain('left join public.task_submissions s on v_student and s.task_id = t.id and s.profile_id = v_me')
    expect(tasks).toContain('case when v_student then s.text_answer end')
  })

  it('las entregas de todos: solo el profesor del curso, la ceo y Directivo; corregir, solo el profesor', () => {
    expect(body('cesi_task_submissions')).toContain("if v_role is null or v_role not in ('teacher', 'manager') then")
    expect(body('cesi_task_submissions')).toContain("v_role = 'teacher' and x.id is not null")
    for (const fn of ['cesi_task_save', 'cesi_task_delete', 'cesi_task_grade']) expect(body(fn), fn).toContain("is distinct from 'teacher'")
  })

  it('entregar: solo un inscrito con el aula abierta, su archivo y hasta que esté corregida', () => {
    const submit = body('cesi_task_submit')
    expect(submit).toContain("public.cesi_room_role(v_me, v_task.course_id) is distinct from 'student'")
    expect(submit).toContain('not public.cesi_room_can_enter(v_me, v_task.course_id)')
    expect(submit).toContain("v_path not like v_task.course_id || '/subs/' || v_me::text || '/%'")
    expect(submit).toContain('if found and v_old.score is not null then')
  })

  it('las notas quedan siempre: pasan a grades (sobre 10), no se borran ni se editan a mano', () => {
    const grade = body('cesi_task_grade')
    expect(grade).toContain('round(p_score * 10 / v_task.max_score, 2)')
    expect(grade).toContain('on conflict (task_id, student_id) where task_id is not null do update')
    expect(body('cesi_task_delete')).toContain('x.score is not null')
    expect(body('cesi_grade_save')).toContain('task_id is not null')
    expect(body('cesi_grade_delete')).toContain('if v_task is not null then')
    expect(body('cesi_grades_course')).toContain('v_teacher and g.task_id is null')
    // El alumno ve todas las suyas (también de cursos que dejó o que terminaron), y solo las suyas.
    const mine = body('cesi_my_grades')
    expect(mine).toContain('where g.student_id = v_student')
    expect(mine).not.toContain('cesi_student_courses')
    expect(mine).toContain("p.id = v_me and p.role in ('alumno', 'equipo')")
    // Ver todas: la ceo y Directivo (como en la parte 36); el profesor, las de su curso.
    expect(body('cesi_grades_course')).toContain('if not (v_teacher or public.cesi_grade_viewer(v_me)) then')
  })
})
