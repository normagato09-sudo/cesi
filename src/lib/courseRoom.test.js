import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { FILE_MAX_BYTES, fileError, fileTypeOf, roomFilePath, safeFileName, sizeText, validatePost } from './courseRoom'

const sql = readFileSync(new URL('../../supabase/parte41_aula.sql', import.meta.url), 'utf8').replace(/\r\n/g, '\n')
function body(fn) {
  const start = sql.indexOf(`create or replace function public.${fn}(`)
  expect(start, fn).toBeGreaterThan(-1)
  return sql.slice(start, sql.indexOf('$$;', sql.indexOf('$$', start) + 2))
}

describe('aula: archivos y formulario', () => {
  it('solo pdf, imágenes, pptx, docx y xlsx, hasta 20 MB', () => {
    const f = (name, size = 1000) => ({ name, size })
    expect(['a.pdf', 'b.JPG', 'c.png', 'd.pptx', 'e.docx', 'f.xlsx'].map((n) => fileTypeOf(f(n)) !== null)).toEqual([true, true, true, true, true, true])
    expect(fileError(f('virus.exe'))).toMatch(/tipo/)
    expect(fileError(f('viejo.doc'))).toMatch(/tipo/)
    expect(fileError(f('grande.pdf', FILE_MAX_BYTES + 1))).toMatch(/20 MB/)
    expect(fileError(f('ok.pdf', FILE_MAX_BYTES))).toBe(null)
    expect(sizeText(1536)).toBe('2 KB')
    expect(sizeText(3 * 1024 * 1024)).toBe('3,0 MB')
  })

  it('cada archivo va en la carpeta de su curso, con un nombre seguro', () => {
    expect(safeFileName('Tema 1: Fórmulas & más.PDF')).toBe('Tema-1-Formulas-mas.pdf')
    expect(roomFilePath('c1', 'posts', 'x.pdf')).toMatch(/^c1\/posts\/[^/]+\/x\.pdf$/)
    expect(roomFilePath('c1', 'subs', 'x.pdf', 'u1')).toMatch(/^c1\/subs\/u1\/[^/]+\/x\.pdf$/)
  })

  it('un aviso lleva título; un material, archivo', () => {
    expect(validatePost({ kind: 'aviso', title: 'Bienvenida', body: '' })).toBe(null)
    expect(validatePost({ kind: 'aviso', title: ' ' })).toMatch(/título/)
    expect(validatePost({ kind: 'material', title: 'Tema 1' })).toMatch(/archivo/)
    expect(validatePost({ kind: 'material', title: 'Tema 1', filePath: 'c1/posts/a/x.pdf' })).toBe(null)
  })
})

describe('aula: permisos en la base de datos (parte 41)', () => {
  it('entran el profesor, Directivo, la ceo y los inscritos; nadie más', () => {
    const role = body('cesi_room_role')
    expect(role).toContain("when p_course in (select public.cesi_teacher_courses(p_profile)) then 'teacher'")
    expect(role).toContain("when public.cesi_grade_viewer(p_profile) then 'manager'")
    expect(role).toContain("when p_course in (select public.cesi_student_courses(p_profile)) then 'student'")
    expect(role).not.toMatch(/\belse\b/)
  })

  it('los inscritos solo desde el día de inicio (hora de España)', () => {
    expect(body('cesi_room_can_enter')).toContain("when 'student' then coalesce(public.cesi_room_opens(p_course) <= (now() at time zone 'Europe/Madrid')::date, true)")
    expect(body('cesi_room_can_enter')).toContain('else false')
    const posts = body('cesi_room_posts')
    expect(posts).toMatch(/if v_role is null then\s+raise exception/)
    expect(posts).toMatch(/if not public\.cesi_room_can_enter\(v_me, p_course\) then\s+return;/)
    expect(body('cesi_room_info')).toMatch(/if v_role is null then\s+raise exception/)
  })

  it('solo el profesor del curso publica, cambia y borra', () => {
    for (const fn of ['cesi_room_post_save', 'cesi_room_post_delete']) {
      expect(body(fn), fn).toContain("is distinct from 'teacher' then")
    }
    expect(body('cesi_room_post_save')).toContain("v_path not like p_course || '/posts/%'")
  })

  it('tablas cerradas y archivos privados, con 20 MB y tipos permitidos', () => {
    expect(sql).toContain('revoke all on public.course_posts from public, anon, authenticated;')
    expect(sql).toContain('revoke all on public.course_post_reads from public, anon, authenticated;')
    expect(sql).not.toMatch(/create policy "[^"]*" on public\./)
    expect(sql).toMatch(/values \('cesi-aula', 'cesi-aula', false, 20971520,/)
    expect(sql).toContain('set public = false,')
    for (const t of ['application/pdf', 'image/png', 'presentationml.presentation', 'wordprocessingml.document', 'spreadsheetml.sheet']) expect(sql).toContain(t)
    expect(sql).not.toContain("'application/msword'")
    // Las reglas de Storage pasan siempre por la comprobación del curso de la carpeta.
    const policies = [...sql.matchAll(/create policy "cesi-aula: [^"]+" on storage\.objects[\s\S]*?;/g)].map((m) => m[0])
    expect(policies).toHaveLength(3)
    for (const p of policies) expect(p).toMatch(/bucket_id = 'cesi-aula' and public\.cesi_room_file_ok\(name, '(read|write|delete)'\)/)
    expect(sql).not.toMatch(/for update to authenticated[\s\S]*?cesi-aula/)
  })

  it('archivos: lo del profesor lo abre quien entra; cada entrega, su dueño, el profesor, Directivo y la ceo', () => {
    const ok = body('cesi_room_file_ok')
    expect(ok).toContain("if v_kind in ('posts', 'tasks') then")
    expect(ok).toContain("when 'read' then public.cesi_room_can_enter(v_me, v_course)")
    expect(ok).toContain("else v_role = 'teacher'")
    expect(ok).toContain("when 'read' then v_parts[3] = v_me::text or v_role in ('teacher', 'manager')")
    expect(ok).toContain("when 'write' then v_parts[3] = v_me::text and v_role = 'student' and public.cesi_room_can_enter(v_me, v_course)")
    expect(ok).toContain('if v_role is null then\n    return false;')
    // Sin cuenta, nada.
    expect(ok).toContain('if v_me is null')
    expect(sql).toContain('revoke all on function public.cesi_room_file_ok(text, text) from public, anon;')
  })

  it('las ayudas internas no se pueden llamar y nada es para anon', () => {
    for (const sig of ['cesi_room_role(uuid, text)', 'cesi_room_opens(text)', 'cesi_room_can_enter(uuid, text)']) {
      expect(sql).toContain(`revoke all on function public.${sig} from public, anon, authenticated;`)
    }
    expect(sql).not.toMatch(/to anon/)
  })
})
