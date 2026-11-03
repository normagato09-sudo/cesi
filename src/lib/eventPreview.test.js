import { describe, expect, it } from 'vitest'
import { namesLine, previewContent, safeLink, shortText, whenText } from './eventPreview'

const start = new Date(2026, 10, 9, 16, 0)
const end = new Date(2026, 10, 9, 17, 0)

describe('tarjeta rápida del calendario', () => {
  it('participantes en una línea', () => {
    expect(namesLine(['Lucas'])).toBe('Lucas')
    expect(namesLine(['Lucas', 'Ana'])).toBe('Lucas y Ana')
    expect(namesLine(['Lucas', 'Ana', 'Bea', 'Carla', 'Dani', 'Eva', 'Fran'])).toBe('Lucas, Ana y 5 más')
    expect(namesLine([])).toBe('')
  })

  it('día y hora como «Lun 9 nov · 16:00–17:00» y el principio de la descripción', () => {
    expect(whenText({ start, end })).toBe('Lun 9 nov · 16:00–17:00')
    expect(shortText('Hola  mundo')).toBe('Hola mundo')
    expect(shortText('palabra '.repeat(40), 30).endsWith('…')).toBe(true)
  })

  it('mi reunión: participantes, enlace, lugar y descripción', () => {
    const contacts = [{ id: 'c1', name: 'Lucas' }, { id: 'c2', name: 'Ana' }]
    const p = previewContent({ title: 'Guion', start, end, participantIds: ['c1', 'c2'], guests: ['Bea'], meetLink: 'https://meet.google.com/x', location: 'Sala 1', description: 'Revisar el guion' }, { contacts })
    expect(p).toMatchObject({ title: 'Guion', people: 'Lucas, Ana y 1 más', link: 'https://meet.google.com/x', location: 'Sala 1', description: 'Revisar el guion' })
  })

  it('reunión compartida: mi respuesta y la de los demás', () => {
    const meeting = {
      id: 'm',
      title: 'Equipo',
      link: 'https://discord.gg/abc',
      organizer_id: 'org',
      organizer_name: 'Norma',
      my_status: 'pending',
      participants: [
        { id: 'org', name: 'Norma', status: 'accepted' },
        { id: 'yo', name: 'Ana', status: 'pending' },
        { id: 'l', name: 'Luis', status: 'declined' },
      ],
    }
    const p = previewContent({ title: 'Equipo', start, end, shared: true, item: { kind: 'meeting', meeting } }, { meId: 'yo' })
    expect(p.mine).toBe('Pendiente')
    expect(p.people).toBe('Norma y Luis')
    expect(p.answers.map((a) => `${a.name}: ${a.label}`)).toEqual(['Norma: Aceptada', 'Tú: Pendiente', 'Luis: Rechazada'])
    expect(p.lines).toEqual(['Organiza: Norma'])
    expect(p.link).toBe('https://discord.gg/abc')
  })

  it('clase: el profesor y si irá el alumno (sin más datos de la clase)', () => {
    const cls = { course_name: 'Office', teacher_name: 'Carmen', kind: 'alumno', my_status: 'yes', note: '' }
    const p = previewContent({ title: 'Office', start, end, item: { kind: 'class', cls } })
    expect(p).toMatchObject({ title: 'Office', mine: 'Irás', lines: ['Profesor: Carmen'], people: '', answers: [] })
  })

  it('solo abre enlaces web', () => {
    expect(safeLink('https://meet.google.com/x')).toBe('https://meet.google.com/x')
    expect(safeLink('javascript:alert(1)')).toBe('')
    expect(safeLink('no es un enlace')).toBe('')
  })
})
