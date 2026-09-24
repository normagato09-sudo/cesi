import { describe, expect, it } from 'vitest'
import { bufferWarningsFor, checkMeetingBuffer } from './buffer'

const at = (hh, mm = 0) => new Date(2026, 8, 30, hh, mm)
const iso = (hh, mm = 0) => at(hh, mm).toISOString()

const meeting = (id, from, to, extra = {}) => ({ id, title: id, start: iso(...from), end: iso(...to), ...extra })
const occurrence = (id, from, to, extra = {}) => ({ id, seriesId: id, title: id, start: at(...from), end: at(...to), ...extra })

describe('aviso de margen entre reuniones', () => {
  it('avisa si quedan menos minutos que el margen con la reunión anterior', () => {
    const others = [occurrence('Equipo', [9], [10])]
    const warnings = checkMeetingBuffer({ start: at(10, 5), end: at(11) }, others, 15)
    expect(warnings).toEqual([
      { type: 'buffer', side: 'previous', minutes: 5, message: 'Quedan solo 5 min con la reunión anterior («Equipo»).' },
    ])
  })

  it('avisa con la reunión siguiente y cuando van seguidas sin margen', () => {
    const others = [occurrence('Antes', [8], [9]), occurrence('Después', [10, 10], [11])]
    const warnings = checkMeetingBuffer({ start: at(9), end: at(10) }, others, 15)
    expect(warnings.map((w) => w.message)).toEqual([
      'No queda margen con la reunión anterior («Antes»).',
      'Quedan solo 10 min con la reunión siguiente («Después»).',
    ])
  })

  it('no avisa si se respeta el margen o no hay margen configurado', () => {
    const others = [occurrence('Equipo', [9], [10])]
    expect(checkMeetingBuffer({ start: at(10, 15), end: at(11) }, others, 15)).toEqual([])
    expect(checkMeetingBuffer({ start: at(10), end: at(11) }, others, 0)).toEqual([])
  })

  it('usa la reunión más cercana de cada lado', () => {
    const others = [occurrence('Lejos', [9], [9, 50]), occurrence('Cerca', [9, 50], [9, 58])]
    const [warning] = checkMeetingBuffer({ start: at(10), end: at(11) }, others, 15)
    expect(warning.message).toBe('Quedan solo 2 min con la reunión anterior («Cerca»).')
  })

  it('los bloques "No disponible" no llevan margen', () => {
    const blocked = [occurrence('Médico', [9], [10], { isUnavailable: true })]
    expect(checkMeetingBuffer({ start: at(10), end: at(11) }, blocked, 15)).toEqual([])
    const others = [occurrence('Equipo', [9], [10])]
    expect(checkMeetingBuffer({ start: at(10), end: at(11), isUnavailable: true }, others, 15)).toEqual([])
  })

  it('ignora la propia serie al mover y los solapes (que ya se bloquean aparte)', () => {
    const others = [occurrence('Yo', [9], [10]), occurrence('Solape', [10, 30], [11, 30])]
    expect(checkMeetingBuffer({ start: at(10), end: at(11) }, others, 15, { excludeSeriesId: 'Yo' })).toEqual([])
  })

  it('tiene en cuenta las reuniones que se repiten', () => {
    const weekly = meeting('Semanal', [9], [10], { recurrence: { freq: 'weekly', until: null } })
    weekly.start = new Date(2026, 8, 23, 9).toISOString()
    weekly.end = new Date(2026, 8, 23, 10).toISOString()
    const warnings = bufferWarningsFor({ start: at(10, 10), end: at(11) }, [weekly], 15)
    expect(warnings.map((w) => w.message)).toEqual(['Quedan solo 10 min con la reunión anterior («Semanal»).'])
  })
})
