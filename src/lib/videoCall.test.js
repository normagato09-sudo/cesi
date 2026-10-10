import { beforeEach, describe, expect, it } from 'vitest'
import {
  cleanOptions,
  getVideoRooms,
  jitsiLink,
  linkChoices,
  meetingLinkFor,
  saveVideoRooms,
  validateRoomUrl,
  validateVideoSettings,
} from './videoCall'
import { decisionMessage, linkSettings, placeLine, requestDescription } from './bookings'

const rooms = { zoom: 'https://us02web.zoom.us/j/123', meet: '', teams: 'https://teams.microsoft.com/l/meetup-join/abc' }

beforeEach(() => localStorage.clear())

describe('videollamada', () => {
  it('mis salas se guardan en las preferencias', () => {
    expect(getVideoRooms()).toEqual({ zoom: '', meet: '', teams: '' })
    saveVideoRooms({ ...rooms, zoom: ' https://zoom.us/j/1 ' })
    expect(getVideoRooms().zoom).toBe('https://zoom.us/j/1')
  })

  it('comprueba que cada enlace sea de su plataforma', () => {
    expect(validateRoomUrl('zoom', '')).toBeNull()
    expect(validateRoomUrl('zoom', 'https://us02web.zoom.us/j/1')).toBeNull()
    expect(validateRoomUrl('meet', 'https://meet.google.com/abc-defg-hij')).toBeNull()
    expect(validateRoomUrl('meet', 'http://meet.google.com/abc')).toMatch(/https/)
    expect(validateRoomUrl('teams', 'https://zoom.us/j/1')).toMatch(/no parece de Microsoft Teams/)
    expect(validateRoomUrl('zoom', 'zoom')).toMatch(/no es una dirección válida/)
  })

  it('opciones del enlace: al menos una, y Zoom/Meet/Teams solo con sala', () => {
    expect(cleanOptions(['in_person', 'jitsi', 'x', 'jitsi'])).toEqual(['jitsi', 'in_person'])
    expect(validateVideoSettings(rooms, [])).toMatch(/al menos una/)
    expect(validateVideoSettings(rooms, ['meet'])).toMatch(/Google Meet/)
    expect(validateVideoSettings(rooms, ['zoom', 'teams', 'jitsi', 'in_person'])).toBeNull()
  })

  it('enlace según dónde se hace la reunión', () => {
    const fixed = () => new Uint8Array(12)
    expect(jitsiLink(fixed)).toBe('https://meet.jit.si/CESI-aaaaaaaaaaaa')
    expect(jitsiLink()).toMatch(/^https:\/\/meet\.jit\.si\/CESI-[A-Za-z0-9]{12}$/)
    expect(jitsiLink()).not.toBe(jitsiLink())
    expect(meetingLinkFor('zoom', rooms)).toBe(rooms.zoom)
    expect(meetingLinkFor('meet', rooms)).toBe('')
    expect(meetingLinkFor('in_person', rooms)).toBe('')
    expect(meetingLinkFor('jitsi', rooms, () => 'J')).toBe('J')
    expect(linkChoices(rooms).map((p) => p.id)).toEqual(['zoom', 'teams', 'jitsi'])
  })

  it('el enlace de reservas guarda las opciones activas', () => {
    expect(linkSettings(null).videoOptions).toEqual(['jitsi', 'in_person'])
    expect(linkSettings({ video_options: ['zoom', 'in_person'] }).videoOptions).toEqual(['zoom', 'in_person'])
  })

  it('el mensaje de confirmación dice la plataforma y el enlace', () => {
    expect(placeLine('zoom', 'https://zoom.us/j/1')).toBe('Será por Zoom: https://zoom.us/j/1')
    expect(placeLine('in_person')).toBe('Será presencial o por teléfono; te paso los detalles.')
    expect(placeLine('', '')).toBe('')
    const request = {
      name: 'Ana',
      starts_at: '2026-10-14T08:00:00Z',
      ends_at: '2026-10-14T08:30:00Z',
      time_zone: 'Europe/Madrid',
      reason: 'Hablar',
      meeting_place: 'jitsi',
    }
    const msg = decisionMessage(request, 'accepted', { meetLink: 'https://meet.jit.si/CESI-x' })
    expect(msg.text).toContain('Será por Jitsi Meet: https://meet.jit.si/CESI-x')
    expect(requestDescription(request)).toContain('Dónde: Jitsi Meet')
  })
})
