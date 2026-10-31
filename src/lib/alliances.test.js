import { describe, expect, it } from 'vitest'
import {
  addAllianceNote,
  allianceContacts,
  allianceInput,
  amountLabel,
  applyAllianceSave,
  boardColumns,
  filterAlliances,
  formFromAlliance,
  isExternalContact,
  isNextStepOverdue,
  nextSteps,
  notesNewestFirst,
  removeAllianceNote,
  validateAllianceForm,
} from './alliances'

const contact = (id, alliance, extra = {}) => ({ id, name: id, alliance, ...extra })
const al = (extra = {}) => ({ type: 'patrocinador', status: 'contactado', nextStep: '', nextStepDate: '', ownerId: null, notes: [], ...extra })

describe('contactos externos', () => {
  it('ni del equipo, ni candidatos, ni archivados (o la marca del servidor)', () => {
    expect(isExternalContact({ id: 'a' })).toBe(true)
    expect(isExternalContact({ id: 'a', teamProfile: { status: 'former' } })).toBe(false)
    expect(isExternalContact({ id: 'a', candidacies: [{ id: 'x' }] })).toBe(false)
    expect(isExternalContact({ id: 'a', archived: true })).toBe(false)
    expect(isExternalContact({ id: 'a', external: false })).toBe(false)
    expect(isExternalContact({ id: 'a', teamProfile: {}, external: true })).toBe(true)
  })

  it('con seguimiento, por nombre', () => {
    const list = [contact('Zeta', al()), contact('Ana', al()), contact('Sin', null), contact('Equipo', al(), { teamProfile: {} })]
    expect(allianceContacts(list).map((c) => c.id)).toEqual(['Ana', 'Zeta'])
  })
})

describe('próximos pasos', () => {
  // 2030-11-06 es miércoles: la semana va hasta el domingo 10.
  const today = '2030-11-06'
  const list = [
    contact('atrasado', al({ nextStepDate: '2030-11-04' })),
    contact('hoy', al({ nextStepDate: '2030-11-06', ownerId: 'eva' })),
    contact('domingo', al({ nextStepDate: '2030-11-10' })),
    contact('luego', al({ nextStepDate: '2030-11-11' })),
    contact('cerrado', al({ status: 'cerrado', nextStepDate: '2030-11-01' })),
  ]

  it('atrasados (en rojo) y los de esta semana, de las alianzas abiertas', () => {
    const { overdue, week } = nextSteps(list, today)
    expect(overdue.map((r) => r.contact.id)).toEqual(['atrasado'])
    expect(week.map((r) => r.contact.id)).toEqual(['hoy', 'domingo'])
    expect(nextSteps(list, today, { onlyOwner: 'eva' }).week.map((r) => r.contact.id)).toEqual(['hoy'])
    expect(isNextStepOverdue(al({ nextStepDate: '2030-11-04' }), today)).toBe(true)
    expect(isNextStepOverdue(al({ nextStepDate: '2030-11-04', status: 'descartado' }), today)).toBe(false)
  })
})

describe('tablero y lista', () => {
  const list = [
    contact('a', al({ type: 'patrocinador', status: 'negociacion', ownerId: 'eva' })),
    contact('b', al({ type: 'colaborador', status: 'cerrado' })),
    contact('c', al({ type: 'patrocinador', status: 'negociacion' })),
  ]

  it('una columna por estado', () => {
    expect(boardColumns(list).map((c) => [c.id, c.contacts.length])).toEqual([
      ['por_contactar', 0],
      ['contactado', 0],
      ['negociacion', 2],
      ['cerrado', 1],
      ['descartado', 0],
    ])
  })

  it('filtros por tipo, estado y responsable', () => {
    expect(filterAlliances(list, { type: 'patrocinador' }).map((c) => c.id)).toEqual(['a', 'c'])
    expect(filterAlliances(list, { status: 'cerrado' }).map((c) => c.id)).toEqual(['b'])
    expect(filterAlliances(list, { owner: 'eva' }).map((c) => c.id)).toEqual(['a'])
    expect(filterAlliances(list, { owner: 'none' }).map((c) => c.id)).toEqual(['b', 'c'])
  })
})

describe('formulario y guardado', () => {
  it('valida importe y fechas', () => {
    const form = formFromAlliance(null)
    expect(validateAllianceForm({ ...form, amount: '1.500,50' })).toMatchObject({ amount: expect.any(String) })
    expect(validateAllianceForm({ ...form, amount: '1500,50' })).toEqual({})
    expect(validateAllianceForm({ ...form, startDate: '2030-12-01', endDate: '2030-11-01' })).toMatchObject({ endDate: expect.any(String) })
    expect(allianceInput({ ...form, amount: '1500,5', ownerId: '' })).toMatchObject({ amount: '1500.5', ownerId: null })
    expect(amountLabel(1500)).toMatch(/1\.?500 €/)
  })

  it('al cerrarla guarda cuándo, y conserva las notas', () => {
    const now = new Date('2030-11-06T10:00:00.000Z')
    const old = al({ notes: [{ id: 'n1', text: 'Llamada' }] })
    const closed = applyAllianceSave(old, allianceInput({ ...formFromAlliance(old), status: 'cerrado', amount: '300' }), '', now)
    expect(closed).toMatchObject({ status: 'cerrado', closedAt: now.toISOString(), amount: 300, notes: [{ id: 'n1', text: 'Llamada' }] })
    const later = applyAllianceSave(closed, allianceInput({ ...formFromAlliance(closed), offer: 'Más' }), '', new Date('2030-11-20T10:00:00.000Z'))
    expect(later.closedAt).toBe(now.toISOString())
    expect(applyAllianceSave(closed, allianceInput({ ...formFromAlliance(closed), status: 'descartado' })).closedAt).toBe(null)
  })

  it('notas: se añaden con fecha y autor, y se quitan', () => {
    const one = addAllianceNote(null, ' Enviado dossier ', { byId: 'eva', by: 'Eva' }, new Date('2030-11-06T10:00:00.000Z'))
    expect(one).toMatchObject({ type: 'otro', status: 'por_contactar' })
    const two = addAllianceNote(one, 'Llamada con Ana', {}, new Date('2030-11-07T10:00:00.000Z'))
    expect(notesNewestFirst(two).map((n) => n.text)).toEqual(['Llamada con Ana', 'Enviado dossier'])
    expect(() => addAllianceNote(two, '  ')).toThrow()
    expect(removeAllianceNote(two, two.notes[0].id).notes.map((n) => n.text)).toEqual(['Llamada con Ana'])
  })
})
