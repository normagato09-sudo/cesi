import { beforeEach, describe, expect, it } from 'vitest'
import { createFakeSupabase } from '../../../test/fakeSupabase'
import { createRemote } from './remote'
import { enqueue, flushQueue, loadQueue, pendingFor, removeSent, saveQueue } from './queue'

const op = (id, updatedAt, extra = {}) => ({ table: 'events', id, data: { id, title: id }, updatedAt, deletedAt: null, ...extra })

beforeEach(() => localStorage.clear())

describe('cola de cambios pendientes', () => {
  it('se guarda en localStorage y deja solo el último cambio de cada documento', () => {
    let queue = enqueue([], op('a', '2026-09-24T10:00:00.000Z'))
    queue = enqueue(queue, op('b', '2026-09-24T10:00:01.000Z'))
    queue = enqueue(queue, op('a', '2026-09-24T10:00:02.000Z', { data: null, deletedAt: '2026-09-24T10:00:02.000Z' }))
    saveQueue(queue)
    expect(loadQueue().map((o) => [o.id, o.deletedAt ? 'borrado' : 'cambio'])).toEqual([
      ['b', 'cambio'],
      ['a', 'borrado'],
    ])
    expect(pendingFor(loadQueue(), 'events', 'a').updatedAt).toBe('2026-09-24T10:00:02.000Z')
    expect(pendingFor(loadQueue(), 'contacts', 'a')).toBeNull()
  })

  it('al terminar un envío conserva los cambios que llegaron mientras tanto', () => {
    const sent = [op('a', '2026-09-24T10:00:00.000Z'), op('b', '2026-09-24T10:00:00.000Z')]
    const now = [op('a', '2026-09-24T10:00:05.000Z'), sent[1], op('c', '2026-09-24T10:00:06.000Z')]
    expect(removeSent(now, sent).map((o) => o.id)).toEqual(['a', 'c'])
  })

  it('envía los cambios agrupados por tabla con el usuario, la fecha y el borrado', async () => {
    const server = createFakeSupabase()
    const queue = [
      op('a', '2026-09-24T10:00:00.000Z'),
      op('x', '2026-09-24T10:00:00.000Z', { table: 'contacts', data: null, deletedAt: '2026-09-24T10:00:00.000Z' }),
    ]
    const { sent, error } = await flushQueue(queue, createRemote(server.client), 'user-1')
    expect(error).toBeNull()
    expect(sent).toHaveLength(2)
    expect(server.row('events', 'a')).toMatchObject({ user_id: 'user-1', data: { title: 'a' }, deleted_at: null })
    expect(server.row('contacts', 'x').deleted_at).toBe('2026-09-24T10:00:00.000Z')
  })

  it('sin conexión no pierde nada: devuelve el error y no marca nada como enviado', async () => {
    const server = createFakeSupabase()
    server.setOnline(false)
    const { sent, error } = await flushQueue([op('a', '2026-09-24T10:00:00.000Z')], createRemote(server.client), 'user-1')
    expect(sent).toEqual([])
    expect(error.message).toMatch(/Failed to fetch/)
    expect(server.rows('events')).toEqual([])
  })
})
