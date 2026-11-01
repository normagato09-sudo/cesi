import { describe, expect, it, vi } from 'vitest'
import { beforeOf, changedFields, changedLabel, directivoActions, docWriter, rrhhActions, withStatusChange } from './teamEdits'

// Cliente simulado: devuelve el documento como lo dejaría cesi_ceo_doc_patch.
function fakeClient(docs = {}) {
  const calls = []
  return {
    calls,
    rpc: vi.fn(async (fn, args) => {
      calls.push(args)
      const old = docs[args.p_id] || {}
      return { data: { ...old, ...args.p_patch, id: args.p_id }, error: null }
    }),
  }
}

describe('qué se envía', () => {
  it('solo los campos que cambian, y cómo estaban en el servidor', () => {
    const doc = { id: 'a', name: 'Ana', teamProfile: { role: 'x' }, email: 'a@b.c' }
    expect(changedFields(doc, { name: 'Ana', email: 'nuevo@b.c', teamProfile: { role: 'x' } })).toEqual({ email: 'nuevo@b.c' })
    expect(beforeOf({ email: 'a@b.c' }, { email: 'nuevo@b.c', phone: '1' })).toEqual({ email: 'a@b.c', phone: null })
  })

  it('el escritor no llama si no cambia nada; al crear, sin id ni fechas', async () => {
    const client = fakeClient()
    const writer = docWriter(client, () => ({ id: 'a', name: 'Ana' }))
    await writer.patch('contacts', { id: 'a', name: 'Ana' }, { name: 'Ana' })
    expect(client.calls).toHaveLength(0)
    await writer.patch('contacts', { id: 'a', name: 'Ana' }, { name: 'Ana López' })
    expect(client.calls[0]).toMatchObject({ p_table: 'contacts', p_id: 'a', p_patch: { name: 'Ana López' }, p_before: { name: 'Ana' }, p_create: false })
    await writer.create('vacancies', { id: 'x', title: 'Diseño', createdAt: 'y' })
    expect(client.calls[1]).toMatchObject({ p_table: 'vacancies', p_patch: { title: 'Diseño' }, p_create: true })
    expect(client.calls[1].p_patch.id).toBeUndefined()
  })
})

describe('RRHH', () => {
  it('pasar a antiguo miembro lo archiva (como en mi app)', async () => {
    const contact = { id: 'c1', name: 'Eva', teamProfile: { status: 'active', roles: [], joinedAt: '2030-01-01' } }
    const client = fakeClient({ c1: contact })
    const actions = rrhhActions(docWriter(client, () => contact), () => ({ contacts: [contact], vacancies: [] }))
    await actions.markFormer(contact, '2030-11-04')
    const sent = client.calls[0].p_patch
    expect(sent.teamProfile.status).toBe('former')
    expect(sent.archived).toBe(true)
    expect(withStatusChange({ ...contact, archived: true }, { teamProfile: { ...contact.teamProfile, status: 'active' } })).toMatchObject({ archived: false })
  })

  it('no envía la foto al guardar la ficha de equipo', async () => {
    const contact = { id: 'c1', name: 'Eva', photo: null, teamProfile: { status: 'active', bio: '' } }
    const client = fakeClient({ c1: contact })
    const actions = rrhhActions(docWriter(client, () => contact), () => ({ contacts: [contact], vacancies: [] }))
    await actions.saveTeamProfile('c1', { contactPatch: { photo: { store: 'x' }, email: 'e@x.es' }, teamProfile: { status: 'active', bio: 'Hola' } })
    expect(client.calls[0].p_patch).toEqual({ email: 'e@x.es', teamProfile: { status: 'active', bio: 'Hola' } })
  })

  it('un candidato nuevo se crea como contacto con sus datos por defecto', async () => {
    const client = fakeClient()
    const actions = rrhhActions(docWriter(client, () => null), () => ({ contacts: [], vacancies: [{ id: 'v1' }] }))
    await actions.addCandidacy('v1', { contactData: { name: 'Luis', email: 'luis@x.es', country: 'ES', timeZone: 'Europe/Madrid' }, candidacy: { notes: 'Bien' } })
    const { p_patch, p_create } = client.calls[0]
    expect(p_create).toBe(true)
    expect(p_patch).toMatchObject({ name: 'Luis', candidateOnly: true, phone: '', organization: '' })
    expect(p_patch.candidacies[0]).toMatchObject({ vacancyId: 'v1', status: 'new', notes: 'Bien' })
  })
})

describe('Directivo', () => {
  it('inscribir: solo cambia los cursos de quien entra o sale', async () => {
    const students = [
      { id: 's1', courseIds: ['c1'] },
      { id: 's2', courseIds: [] },
      { id: 's3', courseIds: ['c2'] },
    ]
    const client = fakeClient()
    const actions = directivoActions(docWriter(client, (t, id) => students.find((s) => s.id === id)), () => ({ courses: [], students }))
    await actions.setEnrolled('c1', ['s2', 's3'])
    expect(client.calls.map((c) => [c.p_id, c.p_patch])).toEqual([
      ['s1', { courseIds: [] }],
      ['s2', { courseIds: ['c1'] }],
      ['s3', { courseIds: ['c2', 'c1'] }],
    ])
  })

  it('clase suelta: se valida y se crea con su hora', async () => {
    const client = fakeClient()
    const actions = directivoActions(docWriter(client, () => null), () => ({ courses: [], students: [] }))
    expect(() => actions.createExtraClass('c1', { date: '', start: '18:00', minutes: 60 }, 'Europe/Madrid')).toThrow()
    await actions.createExtraClass('c1', { date: '2030-11-04', start: '18:00', minutes: 60, note: ' Recuperación ' }, 'Europe/Madrid')
    expect(client.calls[0]).toMatchObject({ p_table: 'extra_classes', p_create: true, p_patch: { courseId: 'c1', start: '2030-11-04T17:00:00.000Z', end: '2030-11-04T18:00:00.000Z', note: 'Recuperación' } })
  })
})

describe('registro', () => {
  it('qué cambió, con nombres legibles', () => {
    expect(changedLabel({ after: { teamProfile: {}, archived: true, archivedAt: 'x', email: 'e' } })).toBe('ficha de equipo, archivado, email')
  })
})
