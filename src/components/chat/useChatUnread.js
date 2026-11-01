import { useEffect, useState } from 'react'
import { subscribeChat, unreadCount } from '../../lib/chat'

// Mensajes sin leer de mi cuenta, al día en tiempo real (para el menú y el Inicio). 0 sin cliente,
// en «Ver como» (client null: los mensajes son privados) o sin el SQL de la parte 21.
export function useChatUnread(client) {
  const [count, setCount] = useState(0)
  const [tick, setTick] = useState(0)

  useEffect(() => {
    if (!client) return
    let active = true
    unreadCount(client).then(
      (n) => active && setCount(Number(n) || 0),
      () => active && setCount(0),
    )
    return () => {
      active = false
    }
  }, [client, tick])

  useEffect(() => {
    if (!client) return
    return subscribeChat(client, () => setTick((n) => n + 1), 'chat-unread')
  }, [client])

  return client ? count : 0
}
