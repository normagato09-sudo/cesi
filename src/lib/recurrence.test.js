import { describe, expect, it } from 'vitest'
import { format } from 'date-fns'
import { expandEvent, recurrenceLabel } from './recurrence'
import { cancelOccurrencePatch, editOccurrencePatch, splitSeries, truncateSeriesPatch } from './seriesEdits'

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

// Repetir cada X días/semanas/meses/años. Fechas en hora de España (ver el test de arriba).
const day = (d) => format(d, 'yyyy-MM-dd')
const hm = (d) => format(d, 'HH:mm')
const ALL = [new Date(2000, 0, 1), new Date(2100, 0, 1)]

function series(start, end, recurrence) {
  return { id: 's', start, end, recurrence }
}
const days = (ev) => expandEvent(ev, ...ALL).map((o) => day(o.start))

describe('repetir cada X', () => {
  it('cada 15 días', () => {
    const ev = series('2026-09-01T10:00:00', '2026-09-01T11:00:00', {
      freq: 'daily',
      interval: 15,
      until: '2026-10-31T23:59:59',
    })
    expect(days(ev)).toEqual(['2026-09-01', '2026-09-16', '2026-10-01', '2026-10-16', '2026-10-31'])
    expect(recurrenceLabel(ev.recurrence, ev.start)).toBe('Cada 15 días')
  })

  it('cada 2 semanas', () => {
    const ev = series('2026-09-07T09:30:00', '2026-09-07T10:00:00', {
      freq: 'weekly',
      interval: 2,
      until: '2026-11-01T23:59:59',
    })
    const out = expandEvent(ev, ...ALL)
    expect(out.map((o) => day(o.start))).toEqual(['2026-09-07', '2026-09-21', '2026-10-05', '2026-10-19'])
    expect(out.every((o) => hm(o.start) === '09:30' && hm(o.end) === '10:00')).toBe(true)
    expect(recurrenceLabel(ev.recurrence, ev.start)).toBe('Cada 2 semanas')
  })

  it('cada 3 meses desde un día 31: en los meses sin 31 cae el último día, y luego vuelve al 31', () => {
    const ev = series('2027-01-31T10:00:00', '2027-01-31T11:00:00', {
      freq: 'monthly',
      interval: 3,
      monthlyBy: 'date',
      until: '2028-01-31T23:59:59',
    })
    expect(days(ev)).toEqual(['2027-01-31', '2027-04-30', '2027-07-31', '2027-10-31', '2028-01-31'])
    expect(recurrenceLabel(ev.recurrence, ev.start)).toBe('Cada 3 meses')
  })

  it('cada año desde un 29 de febrero: el 28 en los años no bisiestos y el 29 en los bisiestos', () => {
    const ev = series('2028-02-29T12:00:00', '2028-02-29T13:00:00', {
      freq: 'yearly',
      interval: 1,
      until: '2033-12-31T23:59:59',
    })
    expect(days(ev)).toEqual(['2028-02-29', '2029-02-28', '2030-02-28', '2031-02-28', '2032-02-29', '2033-02-28'])
    expect(recurrenceLabel(ev.recurrence, ev.start)).toBe('Cada año')
  })

  it('el 5.º lunes: los meses sin 5.º lunes se saltan', () => {
    const ev = series('2026-11-30T10:00:00', '2026-11-30T11:00:00', {
      freq: 'monthly',
      interval: 1,
      monthlyBy: 'nth',
      until: '2027-08-31T23:59:59',
    })
    expect(days(ev)).toEqual(['2026-11-30', '2027-03-29', '2027-05-31', '2027-08-30'])
    expect(recurrenceLabel(ev.recurrence, ev.start)).toBe('El 5.º lunes de cada mes')
  })

  it('el 2.º martes de cada mes', () => {
    const ev = series('2026-10-13T18:00:00', '2026-10-13T19:00:00', {
      freq: 'monthly',
      monthlyBy: 'nth',
      until: '2027-01-31T23:59:59',
    })
    expect(days(ev)).toEqual(['2026-10-13', '2026-11-10', '2026-12-08', '2027-01-12'])
    expect(recurrenceLabel(ev.recurrence, ev.start)).toBe('El 2.º martes de cada mes')
  })

  it('el último viernes de cada mes, y cada 2 meses', () => {
    const recurrence = { freq: 'monthly', interval: 1, monthlyBy: 'last', until: '2027-02-28T23:59:59' }
    const ev = series('2026-10-30T16:00:00', '2026-10-30T17:00:00', recurrence)
    expect(days(ev)).toEqual(['2026-10-30', '2026-11-27', '2026-12-25', '2027-01-29', '2027-02-26'])
    expect(recurrenceLabel(ev.recurrence, ev.start)).toBe('El último viernes de cada mes')

    const every2 = { ...ev, recurrence: { ...recurrence, interval: 2 } }
    expect(days(every2)).toEqual(['2026-10-30', '2026-12-25', '2027-02-26'])
    expect(recurrenceLabel(every2.recurrence, every2.start)).toBe('El último viernes cada 2 meses')
  })

  it('las series guardadas antes (sin interval ni monthlyBy) siguen igual', () => {
    const weekly = series('2026-09-01T10:00:00', '2026-09-01T11:00:00', { freq: 'weekly', until: '2026-09-29T23:59:59' })
    expect(days(weekly)).toEqual(['2026-09-01', '2026-09-08', '2026-09-15', '2026-09-22', '2026-09-29'])
    expect(recurrenceLabel(weekly.recurrence, weekly.start)).toBe('Cada semana')

    const monthly = series('2026-01-31T10:00:00', '2026-01-31T11:00:00', { freq: 'monthly', until: '2026-05-31T23:59:59' })
    expect(days(monthly)).toEqual(['2026-01-31', '2026-02-28', '2026-03-31', '2026-04-30', '2026-05-31'])
    expect(recurrenceLabel(monthly.recurrence, monthly.start)).toBe('Cada mes')

    // Un interval que no es válido cuenta como 1.
    const bad = { ...weekly, recurrence: { ...weekly.recurrence, interval: 0 } }
    expect(days(bad)).toEqual(days(weekly))
  })

  it('una reunión hasta las 23:59 sigue acabando a las 23:59 el día del cambio de hora', () => {
    // 28/03/2027: el día tiene 23 horas.
    const ev = series('2027-03-14T01:00:00', '2027-03-14T23:59:00', {
      freq: 'weekly',
      interval: 2,
      until: '2027-04-11T23:59:59',
    })
    const out = expandEvent(ev, ...ALL)
    expect(out.map((o) => day(o.start))).toEqual(['2027-03-14', '2027-03-28', '2027-04-11'])
    for (const o of out) {
      expect(day(o.end)).toBe(day(o.start))
      expect(hm(o.end)).toBe('23:59')
    }
  })
})

describe('repetir cada X con cambios de un día', () => {
  const base = series('2026-09-01T10:00:00', '2026-09-01T11:00:00', {
    freq: 'daily',
    interval: 15,
    until: '2026-10-31T23:59:59',
  })
  const occ = (ev, key) => expandEvent(ev, ...ALL).find((o) => day(o.originalStart) === key)

  it('cancelar y cambiar un día concreto', () => {
    let ev = { ...base, ...cancelOccurrencePatch(base, occ(base, '2026-09-16')) }
    const changes = { start: new Date(2026, 9, 1, 12), end: new Date(2026, 9, 1, 13), title: 'Otra' }
    ev = { ...ev, ...editOccurrencePatch(ev, occ(ev, '2026-10-01'), changes) }
    const out = expandEvent(ev, ...ALL)
    expect(out.map((o) => day(o.start))).toEqual(['2026-09-01', '2026-10-01', '2026-10-16', '2026-10-31'])
    const changed = out.find((o) => day(o.start) === '2026-10-01')
    expect([hm(changed.start), hm(changed.end), changed.title, changed.isException]).toEqual(['12:00', '13:00', 'Otra', true])
  })

  it('"este y los siguientes" y borrar los siguientes conservan el "cada 15 días"', () => {
    const { seriesPatch, newEvent } = splitSeries(base, occ(base, '2026-10-01'), { title: 'Nueva' })
    expect(seriesPatch.recurrence.interval).toBe(15)
    expect(days({ ...base, ...seriesPatch })).toEqual(['2026-09-01', '2026-09-16'])
    expect(days({ ...newEvent, id: 'n' })).toEqual(['2026-10-01', '2026-10-16', '2026-10-31'])

    const truncated = { ...base, ...truncateSeriesPatch(base, occ(base, '2026-10-16')) }
    expect(days(truncated)).toEqual(['2026-09-01', '2026-09-16', '2026-10-01'])
  })

  it('"este y los siguientes" en el último viernes sigue siendo el último viernes', () => {
    const ev = series('2026-10-30T16:00:00', '2026-10-30T17:00:00', {
      freq: 'monthly',
      monthlyBy: 'last',
      until: '2027-02-28T23:59:59',
    })
    const { newEvent } = splitSeries(ev, occ(ev, '2026-12-25'), {})
    expect(days({ ...newEvent, id: 'n' })).toEqual(['2026-12-25', '2027-01-29', '2027-02-26'])
  })
})
