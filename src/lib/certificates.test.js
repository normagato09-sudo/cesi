import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { certFileError, certificateGroups, courseFinished } from './certificates'

const sql = readFileSync(new URL('../../supabase/parte43_certificados.sql', import.meta.url), 'utf8').replace(/\r\n/g, '\n')

describe('certificados: cursos terminados y búsqueda', () => {
  const today = '2026-11-07'
  const courses = [
    { id: 'c1', name: 'Excel', status: 'terminado', endDate: '2026-10-30' },
    { id: 'c2', name: 'Word', status: 'en_curso', endDate: '2026-11-01' },
    { id: 'c3', name: 'Python', status: 'en_curso', endDate: '2026-12-20' },
  ]
  const students = [
    { id: 's1', name: 'Ana Pérez', courseIds: ['c1', 'c3'] },
    { id: 's2', name: 'Íñigo Ruiz', courseIds: ['c1', 'c2'] },
  ]
  const attendance = [
    { studentId: 's1', courseId: 'c1', status: 'present' },
    { studentId: 's1', courseId: 'c1', status: 'absent' },
  ]
  const grades = { course: new Map(), student: new Map([['c1|s1', { average: 8.25, count: 2 }]]) }
  const certs = new Map([['c1|s1', { id: 'k', issued_on: '2026-11-02', file_path: 'c1/s1/x.pdf' }]])

  it('terminado: con el estado «Terminado» o con la fecha de fin ya pasada', () => {
    expect(courses.map((c) => courseFinished(c, today))).toEqual([true, true, false])
  })

  it('por curso terminado, sus alumnos con media, asistencia y certificado', () => {
    const groups = certificateGroups({ courses, students, attendance, grades, certs, today })
    expect(groups.map((g) => g.course.id)).toEqual(['c2', 'c1'])
    const excel = groups.find((g) => g.course.id === 'c1')
    expect(excel.rows.map((r) => [r.student.id, r.average, r.attendance, !!r.cert])).toEqual([
      ['s1', 8.25, 50, true],
      ['s2', null, null, false],
    ])
  })

  it('buscar por alumno (sin acentos) y por curso', () => {
    expect(certificateGroups({ courses, students, attendance, today, query: 'inigo' }).flatMap((g) => g.rows.map((r) => r.student.id))).toEqual(['s2', 's2'])
    expect(certificateGroups({ courses, students, attendance, today, query: 'excel' }).map((g) => g.course.id)).toEqual(['c1'])
    expect(certificateGroups({ courses, students, attendance, today, course: 'c2' }).map((g) => g.course.id)).toEqual(['c2'])
  })

  it('solo PDF de hasta 10 MB', () => {
    expect(certFileError({ name: 'cert.pdf', size: 1000 })).toBe(null)
    expect(certFileError({ name: 'cert.docx', size: 1000 })).toMatch(/PDF/)
    expect(certFileError({ name: 'cert.pdf', size: 11 * 1024 * 1024 })).toMatch(/10 MB/)
  })
})

describe('certificados: solo la ceo (parte 43)', () => {
  it('cada regla de la tabla y del bucket exige ser la ceo', () => {
    const policies = [...sql.matchAll(/create policy "[^"]+" on (public\.course_certificates|storage\.objects)[\s\S]*?;/g)].map((m) => m[0])
    expect(policies).toHaveLength(7)
    for (const p of policies) expect(p).toContain('(select public.is_ceo())')
    for (const p of policies.filter((x) => x.includes('storage.objects'))) expect(p).toContain("bucket_id = 'cesi-certificados'")
  })

  it('ni anon ni funciones que abran los datos a otros (Directivo tampoco)', () => {
    expect(sql).toContain('revoke all on public.course_certificates from public, anon, authenticated;')
    expect(sql).not.toMatch(/to anon/)
    expect(sql).not.toMatch(/security definer/)
    expect(sql).not.toContain('direccion')
    expect(sql).not.toContain('cesi_grade_viewer')
  })

  it('bucket privado, solo PDF', () => {
    expect(sql).toContain("values ('cesi-certificados', 'cesi-certificados', false, 10485760, array['application/pdf'])")
    expect(sql).toContain('set public = false,')
  })
})
