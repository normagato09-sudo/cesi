import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { linkSelection, listLines, parseInline, parseRichText, plainText, safeHref, wrapSelection } from './richText'

describe('texto con formato de la newsletter', () => {
  it('negrita, cursiva y enlaces', () => {
    expect(parseInline('Hola **todos**, *mira* [esto](https://cifa.es/x).')).toEqual([
      { type: 'text', text: 'Hola ' },
      { type: 'bold', text: 'todos' },
      { type: 'text', text: ', ' },
      { type: 'italic', text: 'mira' },
      { type: 'text', text: ' ' },
      { type: 'link', text: 'esto', href: 'https://cifa.es/x' },
      { type: 'text', text: '.' },
    ])
  })

  it('nunca HTML ni enlaces peligrosos: se quedan como texto', () => {
    expect(parseInline('<script>alert(1)</script>')).toEqual([{ type: 'text', text: '<script>alert(1)</script>' }])
    expect(parseInline('[pulsa](javascript:alert(1))')[0].type).toBe('text')
    expect(safeHref('data:text/html,hola')).toBe('')
  })

  it('párrafos y listas con puntos y numeradas', () => {
    const blocks = parseRichText('Novedades:\n\n- Office\n- Excel\n\n1. Apúntate\n2. Ven')
    expect(blocks.map((b) => b.type)).toEqual(['p', 'ul', 'ol'])
    expect(blocks[1].items.map((i) => i[0].text)).toEqual(['Office', 'Excel'])
    expect(blocks[2].items.map((i) => i[0].text)).toEqual(['Apúntate', 'Ven'])
  })

  it('el resumen va sin marcas', () => {
    expect(plainText('**Nuevo** curso: [Office](https://x.es)\n- Lunes')).toBe('Nuevo curso: Office Lunes')
  })

  it('los botones de formato', () => {
    expect(wrapSelection('hola mundo', 5, 10, '**', '**', 'texto').value).toBe('hola **mundo**')
    expect(wrapSelection('', 0, 0, '*', '*', 'texto').value).toBe('*texto*')
    expect(listLines('uno\ndos', 0, 7, false).value).toBe('- uno\n- dos')
    expect(listLines('uno\ndos', 0, 7, true).value).toBe('1. uno\n2. dos')
    expect(linkSelection('ver aquí', 4, 8, 'https://cifa.es').value).toBe('ver [aquí](https://cifa.es/)')
    expect(linkSelection('x', 0, 1, 'javascript:alert(1)')).toBe(null)
  })
})

describe('permisos de la newsletter (parte 34)', () => {
  const sql = readFileSync(new URL('../../supabase/parte34_newsletter.sql', import.meta.url), 'utf8').replace(/\r\n/g, '\n')
  it('solo la ceo escribe, publica y borra', () => {
    expect(sql).toMatch(/cesi_newsletter_save[\s\S]*?if not public\.is_ceo\(\) then/)
    expect(sql).toMatch(/cesi_newsletter_delete[\s\S]*?if not public\.is_ceo\(\) then/)
  })
  it('el resto solo ve las publicadas, y nadie toca las tablas directamente', () => {
    expect(sql).toContain("where v_ceo or n.status = 'published'")
    expect(sql).toContain('revoke all on public.newsletter_posts, public.newsletter_reads from anon, authenticated;')
  })
})
