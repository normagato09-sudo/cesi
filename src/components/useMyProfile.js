import { useCallback, useEffect, useState } from 'react'
import { fetchMyPortal, saveMyPortal } from '../lib/studentPortal'

// Perfil de la cuenta que ha entrado (alumno, equipo o ceo): { account, profile } desde Supabase.
// Con `preview` ({ account, profile }, vista previa de «Ver como») o sin cliente no se pide nada.
// save(fila) guarda y devuelve el perfil; si falla, lanza el error.
export function useMyProfile(client, userId, preview = null) {
  const [fetched, setData] = useState(null)
  const [loadError, setLoadError] = useState(false)
  const [attempt, setAttempt] = useState(0)
  const data = preview || fetched

  useEffect(() => {
    if (preview || !client || !userId) return
    let active = true
    fetchMyPortal(client, userId).then(
      (next) => {
        if (!active) return
        setData(next)
        setLoadError(false)
      },
      () => active && setLoadError(true),
    )
    return () => {
      active = false
    }
  }, [client, userId, attempt, preview])

  const save = useCallback(
    async (row) => {
      const profile = await saveMyPortal(client, userId, row, data?.profile || null)
      setData((d) => ({ ...d, profile }))
      return profile
    },
    [client, userId, data],
  )

  const retry = useCallback(() => setAttempt((n) => n + 1), [])

  return { data, loadError, retry, save }
}
