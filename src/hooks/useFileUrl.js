import { useEffect, useState } from 'react'
import { fileKey, getFileBlob } from '../lib/files/files'

// URL local (blob:) de un archivo guardado, o null mientras carga o si no está disponible.
// Las fotos ya descargadas se sirven desde la caché de IndexedDB (también sin conexión).
const memory = new Map() // fileKey → { url, users }

export function useFileUrl(ref) {
  const key = fileKey(ref)
  const [state, setState] = useState({ key: null, url: null })

  useEffect(() => {
    if (!key) return
    let cancelled = false
    let entry = memory.get(key)
    const acquire = (url) => {
      entry = memory.get(key) || { url, users: 0 }
      entry.users += 1
      memory.set(key, entry)
      if (!cancelled) setState({ key, url: entry.url })
    }
    if (entry) acquire(entry.url)
    else {
      getFileBlob(ref)
        .then((blob) => {
          if (cancelled || !blob) return
          acquire(memory.get(key)?.url || URL.createObjectURL(blob))
        })
        .catch(() => {})
    }
    return () => {
      cancelled = true
      const current = memory.get(key)
      if (!current) return
      current.users -= 1
      if (current.users <= 0) {
        memory.delete(key)
        setTimeout(() => URL.revokeObjectURL(current.url), 1000)
      }
    }
    // `ref` se identifica por su clave.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key])

  return state.key === key ? state.url : null
}
