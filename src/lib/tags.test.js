import { describe, expect, it } from 'vitest'
import { addTag, allTags, eventHasTag, normalizeTag } from './tags'

describe('etiquetas', () => {
  it('normaliza espacios y no duplica sin distinguir mayúsculas ni acentos', () => {
    expect(normalizeTag('  proyecto   X ')).toBe('proyecto X')
    expect(addTag(['Entrevista'], 'entrevista')).toEqual(['Entrevista'])
    expect(addTag(['Revisión'], 'revision')).toEqual(['Revisión'])
    expect(addTag([], '  ')).toEqual([])
  })

  it('reúne todas las etiquetas usadas ordenadas', () => {
    const events = [{ tags: ['zeta', 'Entrevista'] }, { tags: ['entrevista', 'alfa'] }, {}]
    expect(allTags(events)).toEqual(['alfa', 'Entrevista', 'zeta'])
    expect(eventHasTag(events[1], 'ENTREVISTA')).toBe(true)
  })
})
