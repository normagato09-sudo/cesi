import { describe, expect, it } from 'vitest'
import { findSlots } from './findSlots'

const DAY = new Date(2026, 8, 23) // miércoles
const NOW = new Date(2026, 8, 22, 12, 0)

function ev(id, startH, endH, extra = {}) {
  const start = new Date(DAY)
  start.setHours(Math.floor(startH), (startH % 1) * 60, 0, 0)
  const end = new Date(DAY)
  end.setHours(Math.floor(endH), (endH % 1) * 60, 0, 0)
  return { id, title: id, start: start.toISOString(), end: end.toISOString(), recurrence: null, ...extra }
}

const hhmm = (d) => `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`

describe('findSlots: margen entre reuniones', () => {
  const base = { durationMinutes: 60, fromDate: DAY, toDate: DAY, minTime: '09:00', maxTime: '13:00', now: NOW }

  it('sin margen propone el hueco justo al acabar una reunión', () => {
    const slots = findSlots({ ...base, events: [ev('a', 9, 10)] })
    expect(hhmm(slots[0].start)).toBe('10:00')
  })

  it('con margen deja tiempo libre antes y después', () => {
    const slots = findSlots({ ...base, events: [ev('a', 9, 10), ev('b', 11.5, 12)], bufferMinutes: 15 })
    // 10:15–11:15 cabe (termina 15 min antes de las 11:30); 12:15–13:00 no llega a 1 h.
    expect(slots.map((s) => hhmm(s.start))).toEqual(['10:15'])
  })
})
