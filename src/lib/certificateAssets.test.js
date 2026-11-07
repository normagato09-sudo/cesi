import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { certificatePeople, certificateWarnings, courseHours, defaultChoice, imageFileError, personCourseIds } from './certificateAssets'
import { buildCertificatePdf, longDate, nextCertificateCode, periodText, statText } from './certificatePdf'
import { certificateGroups } from './certificates'

const sql = readFileSync(new URL('../../supabase/parte44_generar_certificados.sql', import.meta.url), 'utf8').replace(/\r\n/g, '\n')
const sql43 = readFileSync(new URL('../../supabase/parte43_certificados.sql', import.meta.url), 'utf8').replace(/\r\n/g, '\n')

describe('certificado: textos y código', () => {
  it('fechas, periodo y horas', () => {
    expect(longDate('2026-11-07')).toBe('7 de noviembre de 2026')
    expect(longDate('mal')).toBe('')
    expect(periodText('2026-09-01', '2026-10-30', 24)).toBe('Del 1 de septiembre de 2026 al 30 de octubre de 2026 · 24 horas')
    expect(periodText('2026-09-01', '', 1.5)).toBe('Desde el 1 de septiembre de 2026 · 1,5 horas')
    expect(periodText('', '', 0)).toBe('')
    expect(statText.average(8.25)).toBe('Nota media: 8,25 / 10')
    expect(statText.attendance(91.6)).toBe('Asistencia: 92 %')
  })

  it('código de verificación CIFA-AÑO-0001, seguido dentro de cada año', () => {
    expect(nextCertificateCode([], '2026')).toBe('CIFA-2026-0001')
    expect(nextCertificateCode(['CIFA-2026-0001', 'CIFA-2026-0007', 'CIFA-2025-0040', null], '2026')).toBe('CIFA-2026-0008')
    expect(nextCertificateCode(['CIFA-2025-0040'], '2027')).toBe('CIFA-2027-0001')
  })

  it('crea un PDF A4 horizontal de una página (sin fuentes incrustadas en el test)', async () => {
    const doc = await buildCertificatePdf({ personName: 'Ana Pérez', courseName: 'Excel', startDate: '2026-09-01', endDate: '2026-10-30', hours: 24, issuedOn: '2026-11-07', code: 'CIFA-2026-0001', showStats: true, average: 8, attendance: 90, left: { name: 'Laura', title: 'Profesora' }, right: null, logo: null })
    expect(doc.getNumberOfPages()).toBe(1)
    const { width, height } = doc.internal.pageSize
    expect(Math.round(width)).toBe(842)
    expect(Math.round(height)).toBe(595)
  })
})

describe('generar: valores por defecto, avisos y datos', () => {
  const sigs = [
    { id: 'ceo', is_ceo_default: true, teacher_id: null },
    { id: 'prof', is_ceo_default: false, teacher_id: 't1' },
    { id: 'otra', is_ceo_default: false, teacher_id: null },
  ]

  it('firma izquierda la del profesor, derecha la de la ceo; o lo guardado para el curso', () => {
    expect(defaultChoice({ teacherId: 't1' }, sigs)).toEqual({ leftId: 'prof', rightId: 'ceo', logoId: null, showStats: true })
    expect(defaultChoice({ teacherId: 'tX' }, sigs)).toEqual({ leftId: null, rightId: 'ceo', logoId: null, showStats: true })
    expect(defaultChoice({ teacherId: 't1' }, sigs, { left_signature_id: 'otra', right_signature_id: 'borrada', logo_id: 'L', show_stats: false })).toEqual({ leftId: 'otra', rightId: 'ceo', logoId: 'L', showStats: false })
  })

  it('avisa si el curso no ha terminado o no hay notas (pero se puede emitir)', () => {
    expect(certificateWarnings({ course: { status: 'en_curso', endDate: '2026-12-01' }, today: '2026-11-07', average: null })).toHaveLength(2)
    expect(certificateWarnings({ course: { status: 'terminado' }, today: '2026-11-07', average: 7 })).toEqual([])
  })

  it('horas = clases (hasta el fin) × duración', () => {
    const classes = [new Date('2026-10-01T16:00'), new Date('2026-10-08T16:00'), new Date('2026-11-05T16:00')].map((start) => ({ start }))
    expect(courseHours({ classMinutes: 90, endDate: '2026-10-30' }, classes)).toBe(3)
    expect(courseHours({ classMinutes: 60 }, classes, new Date('2026-12-01'))).toBe(3)
  })

  it('personas: cuentas de alumnos y equipo con ficha, con el nombre de su perfil; y sus cursos, también pasados', () => {
    const students = [
      { id: 's1', name: 'Ficha Ana', courseIds: ['c1'] },
      { id: 's2', name: 'Ficha Luis', courseIds: [] },
    ]
    const profiles = [
      { id: 'a1', role: 'alumno', linked_student_id: 's1', email: 'ana@x.es' },
      { id: 'a2', role: 'equipo', linked_student_id: 's2', display_name: 'Luis' },
      { id: 'a3', role: 'ceo', linked_student_id: null },
      { id: 'a4', role: 'pendiente', linked_student_id: 's1' },
      { id: 'a5', role: 'equipo', linked_student_id: null },
    ]
    const people = certificatePeople(profiles, new Map([['a1', { full_name: 'Ana Pérez' }]]), students)
    expect(people.map((p) => [p.accountId, p.name, p.role])).toEqual([
      ['a1', 'Ana Pérez', 'alumno'],
      ['a2', 'Ficha Luis', 'equipo'],
    ])
    const grades = { student: new Map([['c2|s1', { average: 7 }], ['c3|s2', { average: 5 }]]) }
    expect(personCourseIds('s1', { students, grades, attendance: [{ studentId: 's1', courseId: 'c4' }], certs: new Map([['c5|s1', {}]]) }).sort()).toEqual(['c1', 'c2', 'c4', 'c5'])
  })

  it('imágenes de firmas y logos: PNG o JPG de hasta 2 MB', () => {
    expect(imageFileError({ name: 'firma.png', size: 1000 })).toBe(null)
    expect(imageFileError({ name: 'firma.JPG', size: 1000 })).toBe(null)
    expect(imageFileError({ name: 'firma.gif', size: 1000 })).toMatch(/PNG o JPG/)
    expect(imageFileError({ name: 'firma.png', size: 3 * 1024 * 1024 })).toMatch(/2 MB/)
  })

  it('en la lista salen también quienes ya tienen certificado de un curso sin terminar', () => {
    const groups = certificateGroups({
      courses: [{ id: 'c9', name: 'Python', status: 'en_curso', endDate: '2027-01-01' }],
      students: [{ id: 's1', name: 'Ana', courseIds: ['c9'] }, { id: 's2', name: 'Bea', courseIds: ['c9'] }],
      attendance: [],
      certs: new Map([['c9|s2', { id: 'k' }]]),
      today: '2026-11-07',
    })
    expect(groups.map((g) => [g.course.id, g.finished, g.rows.map((r) => r.student.id)])).toEqual([['c9', false, ['s2']]])
  })
})

describe('certificados, firmas y logos: solo la ceo (parte 44)', () => {
  it('las tablas nuevas, cerradas y con todas sus reglas exigiendo ser la ceo', () => {
    expect(sql).toMatch(/foreach t in array array\['certificate_signatures', 'certificate_logos', 'certificate_course_settings'\] loop/)
    expect(sql).toContain("execute format('revoke all on public.%I from public, anon, authenticated', t);")
    const creates = [...sql.matchAll(/execute format\('create policy [^;]+;/g)].map((m) => m[0])
    expect(creates).toHaveLength(4)
    for (const c of creates) expect(c).toContain('(select public.is_ceo())')
    expect(sql).not.toMatch(/to anon/)
    expect(sql).not.toMatch(/security definer/)
    expect(sql).not.toContain('direccion')
  })

  it('el bucket sigue privado y con las reglas de la parte 43 (solo la ceo); ahora con PNG y JPG', () => {
    expect(sql).toContain("set public = false,\n    allowed_mime_types = array['application/pdf', 'image/png', 'image/jpeg']")
    expect(sql).not.toMatch(/create policy "[^"]*" on storage\.objects/)
    expect(sql).not.toMatch(/drop policy[^;]*cesi-certificados/)
    const bucketPolicies = [...sql43.matchAll(/create policy "cesi-certificados: [^"]+" on storage\.objects[\s\S]*?;/g)].map((m) => m[0])
    expect(bucketPolicies).toHaveLength(3)
    for (const p of bucketPolicies) expect(p).toContain("bucket_id = 'cesi-certificados' and (select public.is_ceo())")
  })

  it('no quita nada de la parte 43: solo añade columnas', () => {
    expect(sql).not.toMatch(/drop table|drop column|delete from|truncate/i)
    expect(sql).toMatch(/add column if not exists code text;/)
    expect(sql).toContain("check (code is null or code ~ '^CIFA-[0-9]{4}-[0-9]{4,6}$')")
    expect(sql).toContain('create unique index if not exists course_certificates_code_idx')
  })
})
