import { useCallback, useEffect, useState } from 'react'
import { onStoredDataChanged } from '../lib/dataEvents'

// Estado leído de localStorage que se vuelve a leer si otra pestaña (o la sincronización) cambia `key`.
export function useStoredValue(key, read) {
  const [value, setValue] = useState(read)

  const reload = useCallback(() => setValue(read()), [read])

  useEffect(
    () =>
      onStoredDataChanged((changed) => {
        if (changed === null || changed === key) reload()
      }),
    [key, reload],
  )

  return [value, reload]
}
