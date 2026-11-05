import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { canUseVacancies, dataFromForm, emptyVacancyForm, filterVacancies, normalizeVacancy, seatsText, validateVacancy } from './vacancyBoard'

describe('vacantes', () => {
  it('las antiguas se leen con los estados nuevos', () => {
    expect(['open', 'in_progress', 'filled', 'en_pausa', undefined].map((s) => normalizeVacancy({ status: s }).status)).toEqual(['abierta', 'abierta', 'cerrada', 'en_pausa', 'abierta'])
    expect(seatsText(normalizeVacancy({ seats: 2 }))).toBe('2 plazas')
    expect(seatsText(normalizeVacancy({}))).toBe('Plazas sin indicar')
  })

  it('el formulario: título, área, estado, plazas y fechas', () => {
    const ok = { ...emptyVacancyForm(new Date(2026, 10, 5)), title: 'Locutor', area: 'Media', seats: '2', hoursPerWeek: '3-5 h' }
    expect(validateVacancy(ok)).toBe(null)
    expect(validateVacancy({ ...ok, title: ' ' })).toBe('Escribe el título.')
    expect(validateVacancy({ ...ok, area: 'Otra' })).toBe('Elige el área.')
    expect(validateVacancy({ ...ok, seats: '0' })).toMatch(/plazas/i)
    expect(validateVacancy({ ...ok, closesAt: '2026-01-01' })).toMatch(/cierre/)
    expect(dataFromForm(ok)).toMatchObject({ title: 'Locutor', area: 'Media', seats: 2, status: 'abierta', openedAt: '2026-11-05', closesAt: '' })
  })

  it('filtros por estado y área (abiertas primero)', () => {
    const list = [
      { id: 'a', title: 'Editor', area: 'Media', status: 'filled', openedAt: '2026-10-01' },
      { id: 'b', title: 'Profesor de Office', area: 'Profesor', status: 'abierta', openedAt: '2026-11-01' },
      { id: 'c', title: 'Moderador', area: 'Moderación', status: 'en_pausa', openedAt: '2026-10-15' },
    ]
    expect(filterVacancies(list).map((v) => v.id)).toEqual(['b', 'c', 'a'])
    expect(filterVacancies(list, { status: 'cerrada' }).map((v) => v.id)).toEqual(['a'])
    expect(filterVacancies(list, { area: 'Media' }).map((v) => v.id)).toEqual(['a'])
    expect(filterVacancies(list, { query: 'office' }).map((v) => v.id)).toEqual(['b'])
  })

  it('solo Directivo y RRHH en el equipo', () => {
    expect(['direccion', 'personas', 'media', 'formacion', null].map(canUseVacancies)).toEqual([true, true, false, false, false])
  })

  it('en la base de datos: solo la ceo, Directivo y RRHH, y sin abrir la tabla a nadie más', () => {
    const sql = readFileSync(new URL('../../supabase/parte38_vacantes.sql', import.meta.url), 'utf8').replace(/\r\n/g, '\n')
    expect(sql).toContain("where id = p_profile and (role = 'ceo' or (role = 'equipo' and area in ('direccion', 'personas')))")
    for (const fn of ['cesi_vacancies_list', 'cesi_vacancy_save', 'cesi_vacancy_delete']) {
      const start = sql.indexOf(`create or replace function public.${fn}(`)
      expect(sql.slice(start, sql.indexOf('$$;', start + 200))).toContain('public.cesi_vacancy_me()')
    }
    expect(sql).not.toMatch(/create policy/i)
    expect(sql).not.toMatch(/grant [a-z, ]+ on (table )?public\.vacancies/i)
  })
})
