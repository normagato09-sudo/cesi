import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { filterMailbox, statusCounts, validateMailbox } from './mailbox'

const list = [
  { id: '1', kind: 'queja', status: 'nueva' },
  { id: '2', kind: 'sugerencia', status: 'vista' },
  { id: '3', kind: 'sugerencia', status: 'resuelta' },
  { id: '4', kind: 'reporte', status: 'nueva' },
]

describe('buzón', () => {
  it('tipo obligatorio y texto de 1 a 1000 caracteres', () => {
    expect(validateMailbox({ kind: '', body: 'hola' })).toMatch(/Sugerencia/)
    expect(validateMailbox({ kind: 'reporte', body: 'hola' })).toMatch(/Sugerencia/)
    expect(validateMailbox({ kind: 'queja', body: '  ' })).toBe('Escribe el texto.')
    expect(validateMailbox({ kind: 'queja', body: 'x'.repeat(1001) })).toMatch(/1000/)
    expect(validateMailbox({ kind: 'sugerencia', body: 'Más horarios por la tarde' })).toBe(null)
  })

  it('la ceo filtra por estado y tipo', () => {
    expect(filterMailbox(list, { status: 'nueva' }).map((m) => m.id)).toEqual(['1', '4'])
    expect(filterMailbox(list, { kind: 'sugerencia' }).map((m) => m.id)).toEqual(['2', '3'])
    expect(statusCounts(list)).toEqual({ '': 4, nueva: 2, vista: 1, resuelta: 1 })
  })

  it('permisos en la base de datos: cada uno solo los suyos y solo la ceo responde', () => {
    const sql = readFileSync(new URL('../../supabase/parte35_buzon.sql', import.meta.url), 'utf8').replace(/\r\n/g, '\n')
    expect(sql).toContain('where v_ceo or m.author_id = v_me')
    expect(sql).toMatch(/cesi_mailbox_answer[\s\S]*?if not public\.is_ceo\(\) then/)
    expect(sql).toContain("if v_course <> '' and v_course not in (select public.cesi_testimonial_course_ids(v_me)) then")
    expect(sql).toContain('revoke all on public.mailbox from anon, authenticated;')
  })
})
