import { useEffect, useState } from 'react'
import { newsletterUnread } from '../lib/newsletter'
import './Newsletter.css'

// Aviso en el Inicio de alumnos y equipo cuando hay alguna publicación de la newsletter sin abrir.
// Nada si no hay, sin la parte 34 o en «Ver como». onOpen: ir a la Newsletter.
export default function NewsletterNotice({ client, preview = false, onOpen }) {
  const [state, setState] = useState(null)

  useEffect(() => {
    if (!client || preview) return
    let active = true
    newsletterUnread(client).then(
      (row) => active && setState(row),
      () => {},
    )
    return () => {
      active = false
    }
  }, [client, preview])

  if (!state?.unread) return null
  return (
    <div className="nl-notice" role="status">
      <span>
        <strong>{state.unread === 1 ? 'Nueva en la newsletter' : `${state.unread} nuevas en la newsletter`}</strong>
        {state.latest_title ? `: ${state.latest_title}` : ''}
      </span>
      <button type="button" onClick={onOpen}>
        Leer
      </button>
    </div>
  )
}
