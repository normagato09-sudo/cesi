import { readJSON, writeJSON } from '../store'

// Cola de cambios pendientes de enviar a Supabase. Sobrevive a cierres de la app y a estar sin
// conexión. Cada cambio: { table, id, data, updatedAt, deletedAt } (data null si es un borrado).

export const QUEUE_KEY = 'cesi_sync_queue_v1'

export function loadQueue() {
  const list = readJSON(QUEUE_KEY, [])
  return Array.isArray(list) ? list : []
}

export function saveQueue(queue) {
  writeJSON(QUEUE_KEY, queue, { silent: true })
}

export function sameDoc(a, b) {
  return a.table === b.table && a.id === b.id
}

// Añade un cambio. Si ya había otro pendiente del mismo documento, se queda solo el último.
export function enqueue(queue, op) {
  return [...queue.filter((o) => !sameDoc(o, op)), op]
}

export function pendingFor(queue, table, id) {
  return queue.find((o) => o.table === table && o.id === id) || null
}

// Quita de la cola los cambios ya enviados, salvo que entretanto haya llegado uno más nuevo
// del mismo documento (ese se enviará en la siguiente vuelta).
export function removeSent(queue, sent) {
  return queue.filter((o) => !sent.some((s) => sameDoc(s, o) && s.updatedAt === o.updatedAt))
}

// Fila de Supabase para un cambio de la cola.
export function toRow(op, userId) {
  return {
    user_id: userId,
    id: op.id,
    data: op.data ?? {},
    updated_at: op.updatedAt,
    deleted_at: op.deletedAt || null,
  }
}

// Envía la cola agrupada por tabla. Devuelve { sent, error }: los cambios enviados y el primer
// error (si lo hubo). Lo que no se pudo enviar se queda en la cola para reintentarlo; quien llama
// quita `sent` de la cola actual con removeSent (puede haber cambios nuevos que llegaron mientras).
export async function flushQueue(queue, remote, userId) {
  const sent = []
  const tables = [...new Set(queue.map((o) => o.table))]
  for (const table of tables) {
    const ops = queue.filter((o) => o.table === table)
    try {
      await remote.upsert(
        table,
        ops.map((op) => toRow(op, userId)),
      )
      sent.push(...ops)
    } catch (error) {
      return { sent, error }
    }
  }
  return { sent, error: null }
}
