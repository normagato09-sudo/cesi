import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { bookingAvailability, getBookingLink, getPendingRequests, publishAvailability, watchRequests } from '../lib/bookings'

const REFRESH_MS = 60 * 1000
const PUBLISH_DELAY_MS = 1500

/**
 * Enlace de reservas (ver lib/bookings.js), solo con la sincronización en marcha (`active`):
 * - link: el enlace activo (null si no hay; undefined mientras no se sabe);
 * - requests: solicitudes pendientes que aún no han empezado (las de hora pasada han caducado);
 * - publica los huecos libres cada vez que cambian mis reuniones o mi disponibilidad.
 */
export function useBookings({ active, rawEvents, weeklyAvailability, now }) {
  const [link, setLink] = useState(undefined)
  const [requests, setRequests] = useState([])
  const [error, setError] = useState(null)
  const lastPublished = useRef(null)

  const reloadRequests = useCallback(() => {
    getPendingRequests()
      .then((rows) => {
        setRequests(rows || [])
        setError(null)
      })
      .catch((err) => setError(err.message))
  }, [])

  useEffect(() => {
    if (!active) return
    let alive = true
    let stopWatching = null
    getBookingLink()
      .then((found) => alive && setLink(found))
      .catch((err) => alive && setError(err.message))
    reloadRequests()
    watchRequests(reloadRequests)
      .then((stop) => {
        if (alive) stopWatching = stop
        else stop()
      })
      .catch(() => {})
    const timer = setInterval(reloadRequests, REFRESH_MS)
    const onFocus = () => document.visibilityState === 'visible' && reloadRequests()
    document.addEventListener('visibilitychange', onFocus)
    return () => {
      alive = false
      clearInterval(timer)
      document.removeEventListener('visibilitychange', onFocus)
      stopWatching?.()
    }
  }, [active, reloadRequests])

  // Lo que hay que publicar cambia con las reuniones, la disponibilidad y, una vez al día, con la
  // fecha (al empezar una semana, la anterior deja de publicarse).
  const today = (now || new Date()).toDateString()
  const published = useMemo(
    () => (active && link ? bookingAvailability({ rawEvents, weeklyAvailability, now: new Date(today) }) : null),
    [active, link, rawEvents, weeklyAvailability, today],
  )

  useEffect(() => {
    if (!published || !link) return
    const json = JSON.stringify(published)
    if (lastPublished.current === `${link.token}:${json}`) return
    const timer = setTimeout(() => {
      publishAvailability(link.token, published)
        .then(() => {
          lastPublished.current = `${link.token}:${json}`
        })
        .catch((err) => setError(err.message))
    }, PUBLISH_DELAY_MS)
    return () => clearTimeout(timer)
  }, [published, link])

  // Al crear o regenerar el enlace ya se publica: no hace falta repetirlo.
  const onLinkChange = useCallback((next, publishedNow = null) => {
    if (next && publishedNow) lastPublished.current = `${next.token}:${JSON.stringify(publishedNow)}`
    setLink(next)
  }, [])

  const visibleRequests = useMemo(() => requests.filter((r) => !now || new Date(r.starts_at) > now), [requests, now])

  return { link: active ? link : null, requests: active ? visibleRequests : [], error, reloadRequests, onLinkChange, setRequests }
}
