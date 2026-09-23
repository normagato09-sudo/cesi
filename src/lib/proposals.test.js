import { describe, expect, it } from 'vitest'
import { buildProposalMessage, formatDurationLong, isExpired, mailtoUrl, optionsOf, whatsappUrl } from './proposals'
import { findSlots } from './findSlots'
import { emptyWeek } from './weeklySchedule'

const opt = (y, m, d, h, min = 0, dur = 60) => {
  const start = new Date(y, m - 1, d, h, min)
  return { start, end: new Date(start.getTime() + dur * 60000) }
}

const proposal = { id: 'p1', title: 'Revisión del proyecto', durationMinutes: 60, participantIds: ['ana'], guests: [] }
const OPTIONS = [opt(2026, 9, 29, 10), opt(2026, 9, 30, 16, 30), opt(2026, 10, 1, 11)]

describe('mensaje de la propuesta', () => {
  it('lista las opciones en hora de España si el contacto no tiene otra zona', () => {
    const contacts = [{ id: 'ana', name: 'Ana García' }]
    expect(buildProposalMessage(proposal, OPTIONS, contacts, { myZone: 'Europe/Madrid' })).toBe(
      'Hola Ana, te propongo estas opciones para Revisión del proyecto (1 hora): martes 29 de septiembre a las 10:00, ' +
        'miércoles 30 de septiembre a las 16:30 o jueves 1 de octubre a las 11:00. ¿Cuál te viene mejor?',
    )
  })

  it('usa la hora local del contacto con la de España entre paréntesis', () => {
    const contacts = [{ id: 'ana', name: 'Ana García', timeZone: 'America/Mexico_City' }]
    const text = buildProposalMessage(proposal, OPTIONS.slice(0, 2), contacts, { myZone: 'Europe/Madrid' })
    expect(text).toBe(
      'Hola Ana, te propongo estas opciones para Revisión del proyecto (1 hora): martes 29 de septiembre a las 02:00 ' +
        '(10:00 en España) o miércoles 30 de septiembre a las 08:30 (16:30 en España). ¿Cuál te viene mejor?',
    )
  })

  it('cambia de día si en su zona ya es otro día y usa "a la" con la una', () => {
    const contacts = [{ id: 'ana', name: 'Kenji', timeZone: 'Asia/Tokyo' }]
    const text = buildProposalMessage(proposal, [opt(2026, 9, 29, 18), opt(2026, 9, 30, 10)], contacts, { myZone: 'Europe/Madrid' })
    expect(text).toContain('miércoles 30 de septiembre a la 01:00 (18:00 en España)')
    expect(text).toContain('miércoles 30 de septiembre a las 17:00 (10:00 en España)')
  })

  it('saluda sin nombre si no hay contacto y formatea duraciones', () => {
    const text = buildProposalMessage({ ...proposal, participantIds: [], durationMinutes: 90 }, OPTIONS.slice(0, 2), [], {
      myZone: 'Europe/Madrid',
    })
    expect(text.startsWith('Hola, te propongo estas opciones para Revisión del proyecto (1 hora y 30 minutos):')).toBe(true)
    expect(formatDurationLong(30)).toBe('30 minutos')
    expect(formatDurationLong(120)).toBe('2 horas')
  })
})

describe('enlaces para enviar', () => {
  it('WhatsApp con y sin teléfono', () => {
    expect(whatsappUrl('Hola ¿qué tal?', '+34 600 11 22 33')).toBe('https://wa.me/34600112233?text=Hola%20%C2%BFqu%C3%A9%20tal%3F')
    expect(whatsappUrl('Hola', '0052 55 1234 5678')).toBe('https://wa.me/525512345678?text=Hola')
    expect(whatsappUrl('Hola', '')).toBe('https://wa.me/?text=Hola')
  })

  it('email con asunto y cuerpo', () => {
    expect(mailtoUrl('Hola Ana', 'ana@x.com', 'Opciones')).toBe('mailto:ana@x.com?subject=Opciones&body=Hola%20Ana')
    expect(mailtoUrl('Hola', '', 'Opciones')).toBe('mailto:?subject=Opciones&body=Hola')
  })
})

describe('estado de la propuesta', () => {
  it('ordena sus opciones y detecta cuándo ha caducado', () => {
    const events = [
      { id: 'b', proposalId: 'p1', provisional: true, start: '2026-09-30T10:00:00', end: '2026-09-30T11:00:00' },
      { id: 'a', proposalId: 'p1', provisional: true, start: '2026-09-29T10:00:00', end: '2026-09-29T11:00:00' },
      { id: 'x', proposalId: 'otra', provisional: true, start: '2026-09-29T10:00:00', end: '2026-09-29T11:00:00' },
    ]
    const options = optionsOf(proposal, events)
    expect(options.map((o) => o.id)).toEqual(['a', 'b'])
    expect(isExpired(options, new Date(2026, 8, 30, 10, 30))).toBe(false)
    expect(isExpired(options, new Date(2026, 8, 30, 11, 0))).toBe(true)
  })

  it('findSlots trata las opciones provisionales como ocupadas', () => {
    const wed = new Date(2026, 8, 30)
    const work = emptyWeek().map((e) => (e.day === 3 ? { ...e, enabled: true, slots: [{ start: '10:00', end: '12:00' }] } : e))
    const provisional = { id: 'a', proposalId: 'p1', provisional: true, start: '2026-09-30T10:00:00', end: '2026-09-30T11:00:00', recurrence: null }
    const slots = findSlots({ durationMinutes: 60, fromDate: wed, toDate: wed, events: [provisional], workingHours: work, now: new Date(2026, 8, 1) })
    expect(slots.map((s) => s.start.getHours())).toEqual([11])
  })
})
