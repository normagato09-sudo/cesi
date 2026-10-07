import { describe, expect, it } from 'vitest'
import { explainNoSlots, findSlots } from './findSlots'
import { emptyWeek } from './weeklySchedule'
import { findConflict } from './conflicts'
import { expandEvents } from './recurrence'
import { computeWeeklyReport } from './weeklyReport'
import { computeSummary } from './summary'
import { meetingsTodayAndTomorrow } from './home'
import { mailtoUrl } from './proposals'
import { convocationMessage, convocationShareData, involvesAttendees } from './notAttending'

const WED = new Date(2026, 8, 23) // miércoles 23/09/2026
const NOW = new Date(2026, 8, 22, 12, 0)

function at(day, h, m = 0) {
  const d = new Date(day)
  d.setHours(h, m, 0, 0)
  return d
}

let n = 0
function ev(day, startH, endH, extra = {}) {
  const toDate = (h) => at(day, Math.floor(h), Math.round((h % 1) * 60))
  return { id: `e${++n}`, title: `Reunión ${n}`, start: toDate(startH).toISOString(), end: toDate(endH).toISOString(), recurrence: null, ...extra }
}

function week(slotsByDay) {
  return emptyWeek().map((e) => (slotsByDay[e.day] ? { ...e, enabled: true, slots: slotsByDay[e.day] } : e))
}

const hhmm = (d) => `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
const MY_HOURS = week({ 3: [{ start: '09:00', end: '12:00' }] }) // yo, solo los miércoles por la mañana
const ana = { id: 'ana', name: 'Ana García', email: 'ana@example.com', phone: '+34 600 111 222', availability: week({ 3: [{ start: '15:00', end: '19:00' }] }) }
const luis = { id: 'luis', name: 'Luis Pérez', email: 'luis@example.com', availability: week({ 3: [{ start: '16:00', end: '20:00' }] }) }
const eva = { id: 'eva', name: 'Eva' }
const contacts = [ana, luis, eva]

describe('buscar hueco con "Yo no asisto"', () => {
  const base = { durationMinutes: 60, fromDate: WED, toDate: WED, now: NOW, workingHours: MY_HOURS, contacts }
  const attendees = { participantIds: ['ana', 'luis'], guests: [] }

  it('usa solo la disponibilidad de los participantes e ignora mi horario y mis reuniones', () => {
    const mine = ev(WED, 16, 17) // reunión mía sin ellos
    const slots = findSlots({ ...base, events: [mine], participants: [ana, luis], notAttending: true, attendees })
    expect(slots.map((s) => hhmm(s.start))).toEqual(['16:00'])
    // Sin "Yo no asisto", mi horario (9–12) no coincide con el suyo.
    expect(findSlots({ ...base, events: [mine], participants: [ana, luis] })).toEqual([])
  })

  it('evita las reuniones de mi calendario en las que participa alguno de ellos', () => {
    const withLuis = ev(WED, 16, 17.5, { participantIds: ['luis'], guests: [] })
    const slots = findSlots({ ...base, events: [withLuis], participants: [ana, luis], notAttending: true, attendees })
    expect(slots.map((s) => [hhmm(s.start), hhmm(s.end)])).toEqual([['17:30', '18:30']])
  })

  it('sin nadie con disponibilidad apuntada no hay huecos', () => {
    const slots = findSlots({ ...base, events: [], participants: [eva], notAttending: true, attendees: { participantIds: ['eva'], guests: [] } })
    expect(slots).toEqual([])
  })

  it('mis bloques "No disponible" no cuentan', () => {
    const blocked = ev(WED, 0, 24, { isUnavailable: true, allDay: true })
    const slots = findSlots({ ...base, events: [blocked], participants: [ana], notAttending: true, attendees: { participantIds: ['ana'], guests: [] } })
    expect(slots.length).toBeGreaterThan(0)
  })

  it('explica quién lo impide hablando de los demás, no de mí', () => {
    const early = { ...luis, availability: week({ 3: [{ start: '08:00', end: '12:00' }] }) }
    const { blockers } = explainNoSlots({ ...base, events: [], participants: [ana, early], notAttending: true, attendees })
    expect(blockers.length).toBeGreaterThan(0)
    expect(blockers[0].message).toMatch(/los demás no pueden/)
  })

  it('las reuniones que organizo sin asistir no ocupan mis huecos', () => {
    const organized = ev(WED, 9, 12, { notAttending: true, participantIds: ['ana'] })
    const slots = findSlots({ ...base, events: [organized] })
    expect(slots.map((s) => hhmm(s.start))).toEqual(['09:00'])
  })

  it('reconoce a los participantes por contacto o como invitados sueltos', () => {
    expect(involvesAttendees({ participantIds: ['ana'], guests: [] }, attendees, contacts)).toBe(true)
    expect(involvesAttendees({ participantIds: [], guests: ['Marta@x.com'] }, { participantIds: [], guests: ['marta@x.com'] }, contacts)).toBe(true)
    expect(involvesAttendees({ participantIds: ['eva'], guests: [] }, attendees, contacts)).toBe(false)
    expect(involvesAttendees({ participantIds: ['ana'], isUnavailable: true }, attendees, contacts)).toBe(false)
  })
})

describe('no es tiempo mío', () => {
  const organized = ev(WED, 10, 11, { notAttending: true, participantIds: ['ana', 'luis'], guests: [] })
  const mine = ev(WED, 12, 13, { participantIds: [], guests: [] })

  it('no choca con mis reuniones', () => {
    const occ = expandEvents([organized], at(WED, 0), at(WED, 23))
    expect(findConflict(occ, at(WED, 10), at(WED, 11))).toBeNull()
  })

  it('no cuenta en el Resumen ni en el Inicio', () => {
    const report = computeWeeklyReport([organized, mine], { weekStart: new Date(2026, 8, 21), workingHours: MY_HOURS, contacts })
    expect(report.count).toBe(1)
    expect(report.meetingMs).toBe(3600000)
    expect(meetingsTodayAndTomorrow([organized, mine], at(WED, 8)).today.map((m) => m.id)).toEqual([mine.id])
    const summary = computeSummary([organized, mine], MY_HOURS, at(WED, 8))
    expect(summary.today.meetings).toBe(1)
    expect(summary.nextMeeting.id).toBe(mine.id)
  })

})

describe('mensaje de convocatoria', () => {
  const occurrence = {
    id: 'm1',
    title: 'Revisión del presupuesto',
    description: 'Hay que cerrar las cifras del trimestre.',
    start: at(WED, 16),
    end: at(WED, 17, 30),
    meetLink: 'https://meet.google.com/abc-defg-hij',
    participantIds: ['ana', 'luis'],
    guests: [],
    agenda: [
      { id: 'a1', text: 'Gastos de septiembre', done: false },
      { id: 'a2', text: 'Previsión de octubre', done: false },
    ],
    notAttending: true,
    recurrence: null,
  }

  it('saluda por su nombre e incluye motivo, fecha, hora, duración, enlace y agenda', () => {
    const text = convocationMessage(occurrence, contacts, { myZone: 'Europe/Madrid' })
    expect(text).toContain('Hola, Ana y Luis:')
    expect(text).toContain('Os escribo para convocaros a una reunión entre vosotros sobre «Revisión del presupuesto».')
    expect(text).toContain('Hay que cerrar las cifras del trimestre.')
    expect(text).toContain('Fecha: miércoles 23 de septiembre')
    expect(text).toContain('Hora: 16:00 (hora de España)')
    expect(text).toContain('Duración: 1 hora y 30 minutos')
    expect(text).toContain('Enlace: https://meet.google.com/abc-defg-hij')
    expect(text).toContain('Agenda:\n1. Gastos de septiembre\n2. Previsión de octubre')
    expect(text).not.toContain('confirm')
    expect(text.trim().endsWith('Un saludo.')).toBe(true)
  })

  it('con una sola persona, en singular; un texto sin enlace es el lugar', () => {
    const text = convocationMessage({ ...occurrence, participantIds: ['ana'], meetLink: 'Sala 2, planta baja', agenda: [] }, contacts, { myZone: 'Europe/Madrid' })
    expect(text).toContain('Hola, Ana:')
    expect(text).toContain('Te escribo para convocarte a una reunión sobre')
    expect(text).toContain('Lugar: Sala 2, planta baja')
    expect(text).not.toContain('Agenda:')
  })

  it('pone la hora local de quien está en otra zona horaria', () => {
    const mex = { ...luis, timeZone: 'America/Mexico_City' }
    const text = convocationMessage(occurrence, [ana, mex], { myZone: 'Europe/Madrid' })
    expect(text).toContain('Hora local: Luis, a las 08:00 en')
  })

  it('datos para compartir: texto, emails de todos y asunto', () => {
    const share = convocationShareData(occurrence, contacts, { myZone: 'Europe/Madrid' })
    expect(share.text).toBe(convocationMessage(occurrence, contacts, { myZone: 'Europe/Madrid' }))
    expect(share.email).toBe('ana@example.com,luis@example.com')
    expect(share.phone).toBe('') // varias personas: WhatsApp sin destinatario
    expect(share.subject).toBe('Convocatoria: Revisión del presupuesto (miércoles 23 de septiembre)')
  })

  it('con una sola persona, WhatsApp va a su teléfono', () => {
    expect(convocationShareData({ ...occurrence, participantIds: ['ana'] }, contacts).phone).toBe('+34 600 111 222')
  })

  it('el email admite varias direcciones', () => {
    expect(mailtoUrl('Hola', 'ana@example.com,luis@example.com', 'Asunto')).toBe('mailto:ana@example.com,luis@example.com?subject=Asunto&body=Hola')
  })
})
