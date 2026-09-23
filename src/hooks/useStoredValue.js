import { useCallback, useEffect, useState } from 'react'

// Estado leído de localStorage que se vuelve a leer si otra pestaña cambia `key`.
export function useStoredValue(key, read) {
  const [value, setValue] = useState(read)

  const reload = useCallback(() => setValue(read()), [read])

  useEffect(() => {
    const handleStorage = (e) => {
      if (e.key === null || e.key === key) reload()
    }
    window.addEventListener('storage', handleStorage)
    return () => window.removeEventListener('storage', handleStorage)
  }, [key, reload])

  return [value, reload]
}
