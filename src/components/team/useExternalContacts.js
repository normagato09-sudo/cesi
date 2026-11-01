import { useEffect, useState } from 'react'
import { listPersonalContacts } from '../../lib/personalContacts'
import { fetchScreenData } from '../../lib/screenData'

const NONE = []

// Los contactos que una persona de equipo puede añadir como externos en «Nueva reunión»: los suyos
// y, en Alianzas, los del área (parte 24). Nada sin cliente (en «Ver como»: son privados) o si
// aún no hay SQL de la parte 24.
export function useExternalContacts(client, area) {
  const [contacts, setContacts] = useState(NONE)
  useEffect(() => {
    if (!client) return
    let active = true
    Promise.all([
      listPersonalContacts(client).catch(() => []),
      area === 'alianzas' ? fetchScreenData(client, 'contactos').then((d) => d.contacts, () => []) : [],
    ]).then(([mine, shared]) => {
      if (active) setContacts([...mine, ...shared].sort((a, b) => (a.name || '').localeCompare(b.name || '', 'es', { sensitivity: 'base' })))
    })
    return () => {
      active = false
    }
  }, [client, area])
  return client ? contacts : NONE
}
