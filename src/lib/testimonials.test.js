import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { coursesInList, countText, filterTestimonials, myTestimonial, roleLine, sortTestimonials, summarize, validateTestimonial } from './testimonials'

const t = (id, rating, kind, course_id, updated_at, extra = {}) => ({
  id,
  rating,
  kind,
  course_id,
  course_name: course_id ? (course_id === 'office' ? 'Office' : 'Excel') : 'General (CIFA)',
  author_role: kind === 'alumno' ? 'Alumno' : kind === 'ceo' ? 'CEO' : 'Profesor',
  updated_at,
  mine: false,
  ...extra,
})
const list = [
  t('a', 5, 'alumno', 'office', '2026-11-02T10:00:00Z'),
  t('b', 5, 'equipo', 'office', '2026-11-01T10:00:00Z'),
  t('c', 3, 'alumno', 'excel', '2026-10-31T10:00:00Z', { mine: true }),
  t('d', 4, 'ceo', '', '2026-10-30T10:00:00Z'),
]

describe('testimonios', () => {
  it('media, número y cuántas hay de cada puntuación', () => {
    const s = summarize(list)
    expect(s.averageText).toBe('4,3')
    expect(s.count).toBe(4)
    expect(s.dist.map((d) => [d.stars, d.count, d.percent])).toEqual([
      [5, 2, 50],
      [4, 1, 25],
      [3, 1, 25],
      [2, 0, 0],
      [1, 0, 0],
    ])
    expect(summarize([]).averageText).toBe('—')
    expect([countText(1), countText(3)]).toEqual(['1 valoración', '3 valoraciones'])
  })

  it('filtra por quién (el equipo incluye a la ceo) y por curso', () => {
    expect(filterTestimonials(list, { who: 'alumno' }).map((x) => x.id)).toEqual(['a', 'c'])
    expect(filterTestimonials(list, { who: 'equipo' }).map((x) => x.id)).toEqual(['b', 'd'])
    expect(filterTestimonials(list, { course: 'office' }).map((x) => x.id)).toEqual(['a', 'b'])
    expect(filterTestimonials(list, { course: 'general' }).map((x) => x.id)).toEqual(['d'])
    expect(coursesInList(list)).toEqual([
      { id: 'excel', name: 'Excel' },
      { id: 'office', name: 'Office' },
    ])
  })

  it('ordena por más recientes, mejor o peor valoradas', () => {
    expect(sortTestimonials(list, 'recent').map((x) => x.id)).toEqual(['a', 'b', 'c', 'd'])
    expect(sortTestimonials(list, 'best').map((x) => x.id)).toEqual(['a', 'b', 'd', 'c'])
    expect(sortTestimonials(list, 'worst').map((x) => x.id)).toEqual(['c', 'd', 'a', 'b'])
  })

  it('cada opinión con su papel y curso; mi valoración de un curso se cambia', () => {
    expect(roleLine(list[1])).toBe('Profesor · Office')
    expect(roleLine(list[3])).toBe('CEO · General (CIFA)')
    expect(myTestimonial(list, 'excel').id).toBe('c')
    expect(myTestimonial(list, 'office')).toBe(null)
  })

  it('las estrellas son obligatorias y el texto, de hasta 1000 caracteres', () => {
    expect(validateTestimonial({ rating: 0 })).toBe('Elige de 1 a 5 estrellas.')
    expect(validateTestimonial({ rating: 4, body: 'x'.repeat(1001) })).toMatch(/1000/)
    expect(validateTestimonial({ rating: 5, body: '' })).toBe(null)
  })

  it('en la base de datos: una por persona y curso, y solo borra quien puede', () => {
    const sql = readFileSync(new URL('../../supabase/parte33_testimonios.sql', import.meta.url), 'utf8').replace(/\r\n/g, '\n')
    expect(sql).toContain('unique (author_id, course_id)')
    expect(sql).toContain('on conflict (author_id, course_id) do update')
    expect(sql).toContain('check (rating between 1 and 5)')
    expect(sql).toContain('check (length(body) <= 1000)')
    // Borrar: la suya o la ceo.
    expect(sql).toContain('delete from public.testimonials t where t.id = p_id and (t.author_id = v_me or public.is_ceo());')
    // Solo sus cursos (o General).
    expect(sql).toContain("if v_course <> '' and v_course not in (select public.cesi_testimonial_course_ids(v_me)) then")
    // Sin acceso directo a la tabla.
    expect(sql).toContain('revoke all on public.testimonials from anon, authenticated;')
  })
})
