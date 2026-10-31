import { useCallback, useEffect, useRef, useState } from 'react'
import { ceoBusyBlocks, listMyMeetings, publishCeoBusy } from '../lib/sharedCalendar'

const REFRESH_MS = 60 * 1000
const PUBLISH_DELAY_MS = 1500
const NONE = []

/**
 * Mis reuniones compartidas (calendario compartido, ver lib/sharedCalendar.js) del rango visible
 * de mi calendario, leídas aparte de mis eventos (no pasan por events ni por la sincronización).
 * Se vuelven a leer cada minuto y al volver a la pestaña (respuestas de los invitados).
 */
export function useSharedMeetings(client, range) {
  const [rows, setRows] = useState(NONE)
  const [tick, setTick] = useState(0)
  const reload = useCallback(() => setTick((n) => n + 1), [])
  const from = range.start.getTime()
  const to = range.end.getTime()

  useEffect(() => {
    if (!client) return
    let active = true
    listMyMeetings(client, new Date(from), new Date(to)).then(
      (next) => active && setRows(next || []),
      () => {},
    )
    return () => {
      active = false
    }
  }, [client, from, to, tick])

  useEffect(() => {
    if (!client) return
    const timer = setInterval(reload, REFRESH_MS)
    const onFocus = () => document.visibilityState === 'visible' && reload()
    document.addEventListener('visibilitychange', onFocus)
    return () => {
      clearInterval(timer)
      document.removeEventListener('visibilitychange', onFocus)
    }
  }, [client, reload])

  return { rows: client ? rows : NONE, reload }
}

/**
 * Publica mis bloques ocupados (ceo_busy: solo inicio y fin) cada vez que cambian mis reuniones,
 * también cuando llegan por la sincronización desde otro dispositivo (rawEvents se vuelve a leer
 * entonces), y una vez al día (avanza la ventana). Solo si ha cambiado algo.
 */
export function usePublishCeoBusy(client, rawEvents, now) {
  const last = useRef(null)
  const today = (now || new Date()).toDateString()

  useEffect(() => {
    if (!client) return
    const timer = setTimeout(() => {
      const blocks = ceoBusyBlocks(rawEvents, new Date(today))
      const json = JSON.stringify(blocks)
      if (last.current === json) return
      publishCeoBusy(client, blocks).then(
        () => {
          last.current = json
        },
        () => {},
      )
    }, PUBLISH_DELAY_MS)
    return () => clearTimeout(timer)
  }, [client, rawEvents, today])
}
