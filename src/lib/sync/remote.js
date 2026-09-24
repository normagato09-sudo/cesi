import { TABLES } from './collections'

const PAGE_SIZE = 500
const COLUMNS = 'id,data,updated_at,deleted_at,server_updated_at'

function check({ data, error }) {
  if (error) throw Object.assign(new Error(error.message || 'Error de Supabase'), { cause: error })
  return data
}

// Operaciones con las tablas de Supabase que necesita la sincronización, sobre un cliente
// de @supabase/supabase-js (o uno simulado en los tests).
export function createRemote(client) {
  return {
    async upsert(table, rows) {
      check(await client.from(table).upsert(rows, { onConflict: 'user_id,id' }))
    },

    // Filas cambiadas en el servidor después de `since` (ISO) o todas si es null, incluidas las
    // borradas (deleted_at), en orden de llegada al servidor.
    async fetchSince(table, since) {
      const rows = []
      for (let from = 0; ; from += PAGE_SIZE) {
        let query = client.from(table).select(COLUMNS)
        if (since) query = query.gt('server_updated_at', since)
        const page = check(
          await query
            .order('server_updated_at', { ascending: true })
            .order('id', { ascending: true })
            .range(from, from + PAGE_SIZE - 1),
        )
        rows.push(...(page || []))
        if (!page || page.length < PAGE_SIZE) return rows
      }
    },

    // ¿Hay algún dato (sin borrar) en la nube?
    async hasAnyRows() {
      for (const table of TABLES) {
        const { count, error } = await client.from(table).select('id', { count: 'exact', head: true }).is('deleted_at', null)
        if (error) check({ error })
        if (count > 0) return true
      }
      return false
    },

    // Cambios en tiempo real de las filas del usuario. Devuelve una función para dejar de escuchar.
    subscribe(userId, onRow) {
      let channel = client.channel(`cesi-sync-${userId}`)
      for (const table of TABLES) {
        channel = channel.on(
          'postgres_changes',
          { event: '*', schema: 'public', table, filter: `user_id=eq.${userId}` },
          (payload) => {
            if (payload.new && payload.new.id) onRow(table, payload.new)
          },
        )
      }
      channel.subscribe()
      return () => client.removeChannel(channel)
    },
  }
}
