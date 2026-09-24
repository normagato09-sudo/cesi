import { onLocalWrite, readJSON, writeJSON } from '../store'
import { notifyDataChanged } from '../dataEvents'
import { SYNCED_KEYS, TABLES, localHasData, readLocalTable, writeLocalTable } from './collections'
import { docHash } from './hash'
import { enqueue, flushQueue, loadQueue, pendingFor, removeSent, saveQueue, sameDoc } from './queue'
import { planInitialSync, shouldApplyRemote, toMs } from './conflicts'

// Sincronización local-first con Supabase.
//
// localStorage sigue siendo la fuente de la app. Cada escritura local se compara con la "sombra"
// (lo último sincronizado de cada documento: huella y fecha) y los cambios pasan a una cola que se
// envía a Supabase; sin conexión se queda guardada y se reintenta al volver la conexión o el foco.
// Al arrancar se descargan los cambios del servidor y, con Realtime, los de otros dispositivos
// llegan solos. Gana siempre el updated_at más reciente; los borrados viajan como deleted_at.

export const STATE_KEY = 'cesi_sync_state_v1'

// Margen al pedir cambios desde la última marca del servidor, por si una transacción terminó
// algo más tarde que otra que ya se leyó. Aplicar dos veces la misma fila no cambia nada.
const PULL_OVERLAP_MS = 5000
const SCAN_DELAY_MS = 300
const RETRY_DELAYS_MS = [5000, 15000, 60000, 300000]

function iso(ms) {
  return new Date(ms).toISOString()
}

function emptyState(userId) {
  return { userId, initialized: false, cursors: {}, shadow: {} }
}

export function loadSyncState() {
  const state = readJSON(STATE_KEY, null)
  return state && typeof state === 'object' ? state : null
}

/**
 * status: 'starting' | 'needs-choice' | 'syncing' | 'synced' | 'offline' | 'error'
 * choice (con 'needs-choice'): 'upload' (solo hay datos aquí) o 'conflict' (hay en los dos sitios).
 */
export class SyncEngine {
  constructor({ remote, userId, isOnline = () => true, now = () => Date.now(), timers = globalThis }) {
    this.remote = remote
    this.userId = userId
    this.isOnline = isOnline
    this.now = now
    this.timers = timers
    this.listeners = new Set()
    this.snapshot = { status: 'starting', choice: null, pending: loadQueue().length }
    this.cleanups = []
    this.scanTimer = null
    this.retryTimer = null
    this.retryCount = 0
    this.running = null
    this.again = false
    this.stopped = false
  }

  // ---------- Estado para la interfaz ----------

  subscribe = (listener) => {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  getSnapshot = () => this.snapshot

  setStatus(patch) {
    this.snapshot = { ...this.snapshot, pending: loadQueue().length, ...patch }
    for (const listener of this.listeners) listener()
  }

  // ---------- Estado guardado ----------

  loadState() {
    const state = loadSyncState()
    return state && state.userId === this.userId ? state : emptyState(this.userId)
  }

  saveState(state) {
    writeJSON(STATE_KEY, state, { silent: true })
  }

  // ---------- Arranque ----------

  // Se puede volver a llamar después de stop() (React monta dos veces en desarrollo).
  async start() {
    this.stopped = false
    const state = this.loadState()
    if (state.initialized) {
      await this.activate()
      return
    }
    // Si la cola es de otro usuario (o de una sesión anterior sin terminar), no se envía.
    saveQueue([])
    try {
      const cloudHasData = await this.remote.hasAnyRows()
      if (this.stopped) return
      if (!localHasData()) await this.resolveInitial('cloud')
      else this.setStatus({ status: 'needs-choice', choice: cloudHasData ? 'conflict' : 'upload' })
    } catch (error) {
      this.fail(error, () => this.start())
    }
  }

  // Primer inicio de sesión: 'cloud', 'device' (también para "Subir los datos de este
  // dispositivo" con la nube vacía) o 'merge'.
  async resolveInitial(strategy) {
    const previous = this.snapshot
    this.setStatus({ status: 'syncing', choice: null })
    // Primero se descarga todo; si falla la conexión a medias, no se ha tocado nada local.
    const remoteRows = {}
    try {
      for (const table of TABLES) remoteRows[table] = await this.remote.fetchSince(table, null)
    } catch (error) {
      this.setStatus({ status: previous.status, choice: previous.choice, error: String(error?.message || error) })
      throw error
    }
    if (this.stopped) return

    const state = emptyState(this.userId)
    const changedKeys = []
    let queue = []
    const now = this.now()

    for (const table of TABLES) {
      const rows = remoteRows[table]
      const plan = planInitialSync(strategy, readLocalTable(table), rows, now)
      const rowById = new Map(rows.map((r) => [r.id, r]))
      const shadow = {}

      // Lo que viene de la nube queda con su fecha; lo que se sube, con la fecha del cambio.
      for (const [id, row] of rowById) {
        shadow[id] = { h: row.deleted_at ? null : docHash(row.data), s: toMs(row.updated_at), d: !!row.deleted_at }
      }
      for (const item of plan.upload) {
        shadow[item.id] = { h: item.deleted ? null : docHash(item.data), s: item.stamp, d: item.deleted }
        queue = enqueue(queue, {
          table,
          id: item.id,
          data: item.deleted ? null : item.data,
          updatedAt: iso(item.stamp),
          deletedAt: item.deleted ? iso(item.stamp) : null,
        })
      }
      state.shadow[table] = shadow
      state.cursors[table] = maxServerStamp(rows, null)
      changedKeys.push(...writeLocalTable(table, plan.local))
    }

    state.initialized = true
    this.saveState(state)
    saveQueue(queue)
    notifyDataChanged(changedKeys)
    await this.activate()
  }

  activate() {
    if (this.stopped) return
    this.cleanups.push(
      onLocalWrite((key) => {
        if (SYNCED_KEYS.includes(key)) this.scheduleScan()
      }),
    )
    try {
      this.cleanups.push(this.remote.subscribe(this.userId, (table, row) => this.applyRows(table, [row])))
    } catch {
      // Sin Realtime la app sigue sincronizando al abrir y al recuperar el foco.
    }
    if (typeof window !== 'undefined') {
      const retry = () => this.sync()
      const onVisible = () => document.visibilityState === 'visible' && this.sync()
      window.addEventListener('online', retry)
      window.addEventListener('focus', retry)
      document.addEventListener('visibilitychange', onVisible)
      this.cleanups.push(() => {
        window.removeEventListener('online', retry)
        window.removeEventListener('focus', retry)
        document.removeEventListener('visibilitychange', onVisible)
      })
    }
    // Cambios hechos mientras la sincronización no estaba en marcha.
    this.scan()
    return this.sync()
  }

  stop() {
    this.stopped = true
    this.timers.clearTimeout(this.scanTimer)
    this.timers.clearTimeout(this.retryTimer)
    for (const cleanup of this.cleanups.splice(0)) cleanup()
  }

  // ---------- Cambios locales → cola ----------

  scheduleScan() {
    this.timers.clearTimeout(this.scanTimer)
    this.scanTimer = this.timers.setTimeout(() => {
      if (this.scan() > 0) this.sync()
    }, SCAN_DELAY_MS)
  }

  // Compara lo guardado en el dispositivo con la sombra y encola las diferencias.
  // Devuelve cuántos cambios ha encontrado.
  scan() {
    const state = this.loadState()
    if (!state.initialized) return 0
    let queue = loadQueue()
    let found = 0
    const stamp = this.now()

    for (const table of TABLES) {
      const shadow = state.shadow[table] || (state.shadow[table] = {})
      const docs = readLocalTable(table)
      for (const [id, doc] of docs) {
        const h = docHash(doc)
        const known = shadow[id]
        if (known && !known.d && known.h === h) continue
        const s = Math.max(stamp, (known?.s || 0) + 1)
        shadow[id] = { h, s, d: false }
        queue = enqueue(queue, { table, id, data: doc, updatedAt: iso(s), deletedAt: null })
        found++
      }
      for (const [id, known] of Object.entries(shadow)) {
        if (known.d || docs.has(id)) continue
        const s = Math.max(stamp, (known.s || 0) + 1)
        shadow[id] = { h: null, s, d: true }
        queue = enqueue(queue, { table, id, data: null, updatedAt: iso(s), deletedAt: iso(s) })
        found++
      }
    }

    if (found > 0) {
      this.saveState(state)
      saveQueue(queue)
      this.setStatus({})
    }
    return found
  }

  // ---------- Envío y descarga ----------

  // Envía la cola y descarga los cambios. Si ya está en marcha, se repite al terminar.
  sync() {
    if (this.stopped || !this.loadState().initialized) return Promise.resolve()
    if (this.running) {
      this.again = true
      return this.running
    }
    this.running = (async () => {
      do {
        this.again = false
        await this.syncOnce()
      } while (this.again && !this.stopped)
      this.running = null
    })()
    return this.running
  }

  async syncOnce() {
    this.timers.clearTimeout(this.retryTimer)
    if (!this.isOnline()) {
      this.setStatus({ status: 'offline' })
      return
    }
    this.setStatus({ status: 'syncing' })
    try {
      await this.flush()
      await this.pull()
      this.retryCount = 0
      this.setStatus({ status: loadQueue().length > 0 ? 'syncing' : 'synced', error: null })
      if (loadQueue().length > 0) this.again = true
    } catch (error) {
      this.fail(error, () => this.sync())
    }
  }

  async flush() {
    const queue = loadQueue()
    if (queue.length === 0) return
    const { sent, error } = await flushQueue(queue, this.remote, this.userId)
    saveQueue(removeSent(loadQueue(), sent))
    if (error) throw error
  }

  async pull() {
    const state = this.loadState()
    for (const table of TABLES) {
      const cursor = state.cursors[table]
      const since = cursor ? iso(toMs(cursor) - PULL_OVERLAP_MS) : null
      const rows = await this.remote.fetchSince(table, since)
      if (this.stopped) return
      this.applyRows(table, rows)
      const latest = this.loadState()
      latest.cursors[table] = maxServerStamp(rows, latest.cursors[table])
      this.saveState(latest)
    }
  }

  // Aplica filas que llegan de la nube (descarga o Realtime), respetando los cambios locales
  // más recientes que aún no se han enviado.
  applyRows(table, rows) {
    if (rows.length === 0 || !TABLES.includes(table)) return
    const state = this.loadState()
    if (!state.initialized) return
    const shadow = state.shadow[table] || (state.shadow[table] = {})
    let queue = loadQueue()
    const docs = readLocalTable(table)
    let changed = false

    for (const row of rows) {
      const pending = pendingFor(queue, table, row.id)
      const known = shadow[row.id] ? { stamp: shadow[row.id].s } : null
      if (!shouldApplyRemote({ pending, known, remote: row })) continue
      if (pending) queue = queue.filter((o) => !sameDoc(o, pending))
      const deleted = !!row.deleted_at
      if (deleted) docs.delete(row.id)
      else docs.set(row.id, row.data)
      shadow[row.id] = { h: deleted ? null : docHash(row.data), s: toMs(row.updated_at), d: deleted }
      changed = true
    }

    if (!changed) return
    this.saveState(state)
    saveQueue(queue)
    notifyDataChanged(writeLocalTable(table, docs))
    this.setStatus({})
  }

  fail(error, retry) {
    const offline = !this.isOnline() || /fetch|network|Failed to fetch|Load failed/i.test(String(error?.message))
    this.setStatus({ status: offline ? 'offline' : 'error', error: offline ? null : String(error?.message || error) })
    const delay = RETRY_DELAYS_MS[Math.min(this.retryCount, RETRY_DELAYS_MS.length - 1)]
    this.retryCount++
    this.timers.clearTimeout(this.retryTimer)
    this.retryTimer = this.timers.setTimeout(() => !this.stopped && retry(), delay)
  }
}

function maxServerStamp(rows, current) {
  let best = current ? toMs(current) : 0
  for (const r of rows) best = Math.max(best, toMs(r.server_updated_at))
  return best ? iso(best) : current || null
}

