import { createContext, useContext, useSyncExternalStore } from 'react'

// { engine, email, signOut } cuando la sincronización está activa; null si no está configurada.
export const SyncContext = createContext(null)

const IDLE = { status: 'starting', choice: null, pending: 0 }
const noopSubscribe = () => () => {}

export function useSync() {
  return useContext(SyncContext)
}

// Estado de la sincronización: { status, choice, pending, error }.
export function useSyncStatus() {
  const sync = useContext(SyncContext)
  const engine = sync?.engine
  return useSyncExternalStore(engine ? engine.subscribe : noopSubscribe, engine ? engine.getSnapshot : () => IDLE)
}

export const STATUS_TEXT = {
  starting: 'Sincronizando…',
  syncing: 'Sincronizando…',
  synced: 'Sincronizado',
  offline: 'Sin conexión, se sincronizará luego',
  error: 'Error al sincronizar, se reintentará',
  'needs-choice': 'Falta elegir qué datos conservar',
}
