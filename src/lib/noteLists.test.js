import { describe, expect, it } from 'vitest'
import { enter, indent, lineAt, lineContent, noteBlocks, parseLine, renumber, toggleList } from './noteLists'

// Estado con la selección marcada con "|" (cursor) o con "[" y "]" (selección).
function state(marked) {
  if (marked.includes('|')) {
    const start = marked.indexOf('|')
    return { text: marked.replace('|', ''), start, end: start }
  }
  const start = marked.indexOf('[')
  const end = marked.indexOf(']') - 1
  return { text: marked.replace('[', '').replace(']', ''), start, end }
}

function show(result) {
  if (!result) return null
  const { text, start, end } = result
  if (start === end) return text.slice(0, start) + '|' + text.slice(start)
  return text.slice(0, start) + '[' + text.slice(start, end) + ']' + text.slice(end)
}

describe('parseLine', () => {
  it('reconoce viñetas y números con su nivel', () => {
    expect(parseLine('- hola')).toMatchObject({ level: 0, kind: 'bullet', content: 'hola', prefixLength: 2 })
    expect(parseLine('    12. punto')).toMatchObject({ level: 2, kind: 'number', num: 12, content: 'punto', prefixLength: 8 })
    expect(parseLine('- ')).toMatchObject({ kind: 'bullet', content: '' })
  })

  it('el texto normal no es una lista', () => {
    expect(parseLine('Hola')).toBeNull()
    expect(parseLine('-hola')).toBeNull()
    expect(parseLine('2026. año')).toMatchObject({ kind: 'number' })
    expect(parseLine('1.5 kilos')).toBeNull()
  })
})

describe('lineAt y lineContent', () => {
  it('da la línea del cursor y su texto sin la viñeta', () => {
    const text = 'uno\n- dos\n3. tres'
    expect(lineAt(text, 6)).toMatchObject({ index: 1, text: '- dos' })
    expect(lineContent('- dos ')).toBe('dos')
    expect(lineContent('  3. tres')).toBe('tres')
    expect(lineContent('texto')).toBe('texto')
  })
})

describe('enter', () => {
  it('continúa la lista con viñetas', () => {
    expect(show(enter(state('- uno|')))).toBe('- uno\n- |')
  })

  it('continúa la lista numerada y renumera lo de debajo', () => {
    expect(show(enter(state('1. uno|\n2. dos')))).toBe('1. uno\n2. |\n3. dos')
  })

  it('mantiene el nivel del subpunto', () => {
    expect(show(enter(state('1. uno\n  1. sub|')))).toBe('1. uno\n  1. sub\n  2. |')
  })

  it('parte el punto si el cursor está en medio', () => {
    expect(show(enter(state('- uno|dos')))).toBe('- uno\n- |dos')
  })

  it('en un punto vacío sale de la lista', () => {
    expect(show(enter(state('- uno\n- |')))).toBe('- uno\n|')
    expect(show(enter(state('1. uno\n2. |\n3. tres')))).toBe('1. uno\n|\n3. tres')
  })

  it('fuera de una lista hace lo de siempre', () => {
    expect(enter(state('texto|'))).toBeNull()
    expect(enter(state('|- uno'))).toBeNull()
  })
})

describe('indent', () => {
  it('Tab crea un subpunto numerado que empieza en 1 y renumera', () => {
    expect(show(indent(state('1. uno\n2. dos|\n3. tres'), 1))).toBe('1. uno\n  1. dos|\n2. tres')
  })

  it('Shift+Tab lo sube un nivel y vuelve a numerar', () => {
    expect(show(indent(state('1. uno\n  1. dos|\n2. tres'), -1))).toBe('1. uno\n2. dos|\n3. tres')
  })

  it('sangra varias líneas seleccionadas', () => {
    expect(show(indent(state('- [uno\n- dos]'), 1))).toBe('  - [uno\n  - dos]')
  })

  it('no hace nada fuera de una lista (el tabulador mueve el foco)', () => {
    expect(indent(state('texto|'), 1)).toBeNull()
  })

  it('no sube más arriba del primer nivel', () => {
    expect(show(indent(state('- uno|'), -1))).toBe('- uno|')
  })
})

describe('toggleList', () => {
  it('convierte la línea en viñeta o número y al revés', () => {
    expect(show(toggleList(state('hola|'), 'bullet'))).toBe('- hola|')
    expect(show(toggleList(state('- hola|'), 'bullet'))).toBe('hola|')
    expect(show(toggleList(state('- hola|'), 'number'))).toBe('1. hola|')
    expect(show(toggleList(state('|'), 'number'))).toBe('1. |')
  })

  it('numera varias líneas seguidas', () => {
    expect(show(toggleList(state('[uno\ndos\ntres]'), 'number'))).toBe('1. [uno\n2. dos\n3. tres]')
  })
})

describe('renumber', () => {
  it('respeta el primer número de cada lista y corta con una línea normal', () => {
    expect(renumber('3. a\n3. b\ntexto\n5. c\n1. d').text).toBe('3. a\n4. b\ntexto\n5. c\n6. d')
  })

  it('una viñeta en el mismo nivel corta la numeración', () => {
    expect(renumber('1. a\n- b\n1. c\n4. d').text).toBe('1. a\n- b\n1. c\n2. d')
  })

  it('ajusta el cursor cuando cambia la longitud del número', () => {
    const text = Array.from({ length: 10 }, () => '1. x').join('\n')
    const result = renumber(text, text.length)
    expect(result.text.endsWith('10. x')).toBe(true)
    expect(result.start).toBe(result.text.length)
  })
})

describe('noteBlocks', () => {
  it('las notas sin listas son un solo bloque de texto', () => {
    expect(noteBlocks('Hola\nadiós')).toEqual([{ type: 'text', text: 'Hola\nadiós' }])
  })

  it('agrupa listas anidadas', () => {
    const blocks = noteBlocks('Temas:\n1. uno\n  - sub\n2. dos\n\nFin')
    expect(blocks).toHaveLength(3)
    expect(blocks[1]).toMatchObject({ type: 'list', kind: 'number', start: 1 })
    expect(blocks[1].items.map((i) => i.text)).toEqual(['uno', 'dos'])
    expect(blocks[1].items[0].children[0]).toMatchObject({ kind: 'bullet', items: [{ text: 'sub' }] })
    expect(blocks[2]).toEqual({ type: 'text', text: 'Fin' })
  })
})
