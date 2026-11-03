import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { canInvite, canSeeContact } from './accessRules'

const sql = (file) => readFileSync(new URL(`../../supabase/${file}`, import.meta.url), 'utf8').replace(/\r\n/g, '\n')

describe('quién puede invitar a quién', () => {
  const ceo = { id: 'ceo', role: 'ceo' }
  const ana = { id: 'ana', role: 'equipo' }
  const profe = { id: 'profe', role: 'equipo', teacherCourses: ['office'] }
  const otroProfe = { id: 'otro', role: 'equipo', teacherCourses: ['excel'] }
  const alumno = { id: 'al', role: 'alumno', studentCourses: ['office'] }
  const companero = { id: 'co', role: 'alumno', studentCourses: ['office', 'excel'] }
  const otroAlumno = { id: 'ot', role: 'alumno', studentCourses: ['excel'] }
  const pendiente = { id: 'pe', role: 'pendiente' }

  it('la ceo, a cualquiera (menos cuentas pendientes)', () => {
    expect([ana, profe, alumno, otroAlumno].every((p) => canInvite(ceo, p))).toBe(true)
    expect(canInvite(ceo, pendiente)).toBe(false)
    expect(canInvite(ceo, ceo)).toBe(false)
  })

  it('el equipo, al equipo y a la ceo; el profesor, además, a sus alumnos', () => {
    expect(canInvite(ana, ceo)).toBe(true)
    expect(canInvite(ana, profe)).toBe(true)
    expect(canInvite(ana, alumno)).toBe(false)
    expect(canInvite(profe, alumno)).toBe(true)
    expect(canInvite(profe, otroAlumno)).toBe(false)
  })

  it('el alumno, a sus compañeros y profesores; nunca a la ceo', () => {
    expect(canInvite(alumno, ceo)).toBe(false)
    expect(canInvite(alumno, profe)).toBe(true)
    expect(canInvite(alumno, otroProfe)).toBe(false)
    expect(canInvite(alumno, ana)).toBe(false)
    expect(canInvite(alumno, companero)).toBe(true)
    expect(canInvite(alumno, otroAlumno)).toBe(false)
  })

  it('la base de datos tiene la misma regla (parte 22)', () => {
    const fn = sql('parte22_invitar_y_participantes.sql')
    expect(fn).toContain("if v_from = 'ceo' then\n    return true;")
    expect(fn).toContain("if v_from = 'alumno' and v_to = 'equipo' then")
    expect(fn).toContain("if v_from = 'alumno' and v_to = 'alumno' then")
    // La lista de «Nueva reunión» solo trae a quien se puede invitar.
    expect(fn).toMatch(/cesi_can_invite\(\(select auth\.uid\(\)\), p\.id\)/)
  })
})

describe('contactos privados', () => {
  const ceo = { id: 'ceo', role: 'ceo' }
  const ana = { id: 'ana', role: 'equipo', area: 'media' }
  const luis = { id: 'luis', role: 'equipo', area: 'alianzas' }
  const dir = { id: 'dir', role: 'equipo', area: 'direccion' }
  const alumno = { id: 'al', role: 'alumno' }

  it('cada persona ve solo los suyos (ni la ceo ve los del equipo)', () => {
    const deAna = { kind: 'personal', ownerId: 'ana' }
    expect(canSeeContact(ana, deAna)).toBe(true)
    expect(canSeeContact(luis, deAna)).toBe(false)
    expect(canSeeContact(ceo, deAna)).toBe(false)
    expect(canSeeContact(alumno, { kind: 'personal', ownerId: 'al' })).toBe(false)
  })

  it('los de la ceo solo los ve ella; los de Alianzas, también toda el área Alianzas', () => {
    const mio = { kind: 'ceo', alliance: false }
    const patrocinador = { kind: 'ceo', alliance: true }
    expect(canSeeContact(ceo, mio)).toBe(true)
    expect([ana, luis, dir, alumno].some((p) => canSeeContact(p, mio))).toBe(false)
    expect(canSeeContact(luis, patrocinador)).toBe(true)
    expect([ana, dir, alumno].some((p) => canSeeContact(p, patrocinador))).toBe(false)
  })

  it('la base de datos tiene la misma regla (partes 24 y 27)', () => {
    const p24 = sql('parte24_contactos_de_cada_persona.sql')
    expect(p24).toContain('create policy "team_contacts: solo los míos" on public.team_contacts\n  for all to authenticated\n  using (owner_id = (select auth.uid())')
    // En Contactos, del equipo solo llegan los de Alianzas y solo a quien tiene papel en Alianzas.
    expect(p24).toContain("when 'contactos' then case when v_alliance is null then '[]'::jsonb")
    const p27 = sql('parte27_directivo_sin_areas.sql')
    expect(p27).toContain("    when p.role = 'equipo' and p.area = 'alianzas' then 'edit'\n  end")
    expect(p27).not.toContain("p_area = 'direccion' then 'view'")
  })
})
