import { describe, expect, it } from 'vitest'
import { expandEvent } from './recurrence'

describe('expandEvent', () => {
  it('mantiene un evento único si solapa el rango', () => {
    const ev = { id: 'a', start: '2026-09-23T10:00:00', end: '2026-09-23T11:00:00', recurrence: null }
    const out = expandEvent(ev, new Date(2026, 8, 23), new Date(2026, 8, 24))
    expect(out).toHaveLength(1)
    expect(out[0].seriesId).toBe('a')
  })

  it('genera ocurrencias semanales hasta la fecha límite', () => {
    const ev = {
      id: 'w',
      start: '2026-09-01T10:00:00',
      end: '2026-09-01T11:00:00',
      recurrence: { freq: 'weekly', until: '2026-09-29T23:59:59' },
    }
    const out = expandEvent(ev, new Date(2026, 8, 1), new Date(2026, 9, 31))
    expect(out.map((o) => o.start.getDate())).toEqual([1, 8, 15, 22, 29])
  })

  it('usa la zona horaria de España en los tests', () => {
    expect(Intl.DateTimeFormat().resolvedOptions().timeZone).toBe('Europe/Madrid')
  })
})
