// Cliente de Supabase simulado para los tests de sincronización. Imita lo que hace
// supabase/schema.sql en el servidor: server_updated_at en cada cambio, "gana el updated_at más
// reciente" (el trigger ignora escrituras más antiguas) y avisos de Realtime por usuario.

export function createFakeSupabase() {
  const tables = new Map()
  const channels = new Set()
  let clock = Date.parse('2026-09-24T10:00:00.000Z')
  let online = true
  const calls = []

  const tableRows = (name) => {
    if (!tables.has(name)) tables.set(name, new Map())
    return tables.get(name)
  }
  const offlineError = () => ({ data: null, error: { message: 'TypeError: Failed to fetch' } })

  function upsert(table, rows) {
    calls.push({ type: 'upsert', table, rows })
    if (!online) return Promise.resolve(offlineError())
    const store = tableRows(table)
    for (const row of rows) {
      const key = `${row.user_id}:${row.id}`
      const existing = store.get(key)
      if (existing && Date.parse(row.updated_at) < Date.parse(existing.updated_at)) continue
      clock += 1000
      const saved = { ...structuredClone(row), server_updated_at: new Date(clock).toISOString() }
      store.set(key, saved)
      for (const ch of channels) ch.emit(table, saved)
    }
    return Promise.resolve({ data: null, error: null })
  }

  function select(table, _columns, { count, head } = {}) {
    const filters = []
    let range = null
    const query = {
      gt(column, value) {
        filters.push((r) => Date.parse(r[column]) > Date.parse(value))
        return query
      },
      is(column, value) {
        filters.push((r) => (r[column] ?? null) === value)
        return query
      },
      order() {
        return query
      },
      range(from, to) {
        range = [from, to]
        return query
      },
      then(resolve, reject) {
        if (!online) return Promise.resolve(offlineError()).then(resolve, reject)
        let rows = [...tableRows(table).values()]
          .filter((r) => filters.every((f) => f(r)))
          .sort((a, b) => Date.parse(a.server_updated_at) - Date.parse(b.server_updated_at) || a.id.localeCompare(b.id))
        if (head && count) return Promise.resolve({ count: rows.length, data: null, error: null }).then(resolve, reject)
        if (range) rows = rows.slice(range[0], range[1] + 1)
        return Promise.resolve({ data: structuredClone(rows), error: null }).then(resolve, reject)
      },
    }
    return query
  }

  const client = {
    from: (table) => ({
      upsert: (rows) => upsert(table, rows),
      select: (columns, options) => select(table, columns, options),
    }),
    channel() {
      const handlers = []
      const ch = {
        on(_type, { table, filter }, callback) {
          handlers.push({ table, userId: filter.replace('user_id=eq.', ''), callback })
          return ch
        },
        subscribe() {
          channels.add(ch)
          return ch
        },
        emit(table, row) {
          for (const h of handlers) {
            if (h.table === table && h.userId === row.user_id) h.callback({ new: structuredClone(row) })
          }
        },
      }
      return ch
    },
    removeChannel(ch) {
      channels.delete(ch)
    },
  }

  return {
    client,
    calls,
    setOnline(value) {
      online = value
    },
    row(table, id, userId = 'user-1') {
      return tableRows(table).get(`${userId}:${id}`) || null
    },
    rows(table) {
      return [...tableRows(table).values()]
    },
  }
}

// localStorage en memoria, uno por "dispositivo".
export class MemoryStorage {
  constructor() {
    this.map = new Map()
  }
  getItem(key) {
    return this.map.has(key) ? this.map.get(key) : null
  }
  setItem(key, value) {
    this.map.set(key, String(value))
  }
  removeItem(key) {
    this.map.delete(key)
  }
  clear() {
    this.map.clear()
  }
}
