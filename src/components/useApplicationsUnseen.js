import { useCallback, useEffect, useState } from 'react'
import { unseenApplications } from '../lib/vacancyApplications'

// Candidaturas que la ceo aún no ha visto (parte 40), para su Inicio y el número del menú. Se
// vuelve a pedir al cambiar de pantalla, cada 2 minutos y con refresh(). 0 sin cliente o sin el SQL.
export function useApplicationsUnseen(client, section) {
  const [count, setCount] = useState(0)
  const [tick, setTick] = useState(0)
  const refresh = useCallback(() => setTick((n) => n + 1), [])

  useEffect(() => {
    if (!client) return
    let active = true
    unseenApplications(client).then(
      (n) => active && setCount(n),
      () => active && setCount(0),
    )
    return () => {
      active = false
    }
  }, [client, section, tick])

  useEffect(() => {
    if (!client) return
    const id = setInterval(refresh, 120000)
    return () => clearInterval(id)
  }, [client, refresh])

  return [client ? count : 0, refresh]
}
