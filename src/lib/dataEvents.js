// Aviso dentro de la misma pestaña de que han cambiado datos guardados sin pasar por la interfaz
// (p. ej. cambios que llegan de otro dispositivo). Los hooks vuelven a leer esas claves.
const EVENT = 'cesi:data-changed'

export function notifyDataChanged(keys) {
  if (typeof window === 'undefined' || keys.length === 0) return
  window.dispatchEvent(new CustomEvent(EVENT, { detail: { keys } }))
}

// Llama a `listener(key)` cuando cambia una clave, tanto desde otra pestaña (evento storage)
// como desde la sincronización. key null = pueden haber cambiado todas.
export function onStoredDataChanged(listener) {
  const handleStorage = (e) => listener(e.key)
  const handleData = (e) => {
    for (const key of e.detail.keys) listener(key)
  }
  window.addEventListener('storage', handleStorage)
  window.addEventListener(EVENT, handleData)
  return () => {
    window.removeEventListener('storage', handleStorage)
    window.removeEventListener(EVENT, handleData)
  }
}
