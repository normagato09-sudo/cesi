import { useCallback, useEffect, useState } from 'react'
import { useGoogleLogin, googleLogout } from '@react-oauth/google'
import {
  fetchCalendarList,
  fetchEventsForCalendar,
  createCalendarEvent,
  updateCalendarEvent,
  deleteCalendarEvent,
} from '../lib/googleCalendarApi'
import { normalizeEvent, CESI_UNAVAILABLE_KEY, CESI_UNAVAILABLE_VALUE } from '../lib/normalizeEvent'

const STORAGE_KEY = 'cesi_google_token_v2'
// calendar.events: crear/editar/eliminar eventos. calendar.readonly: leer calendarios y eventos.
const CALENDAR_SCOPE =
  'https://www.googleapis.com/auth/calendar.events https://www.googleapis.com/auth/calendar.readonly'
const PRIMARY_CALENDAR_ID = 'primary'

function readStoredToken() {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw)
    if (!parsed.accessToken || !parsed.expiresAt) return null
    if (parsed.expiresAt <= Date.now()) return null
    return parsed
  } catch {
    return null
  }
}

function storeToken(accessToken, expiresAt) {
  sessionStorage.setItem(STORAGE_KEY, JSON.stringify({ accessToken, expiresAt }))
}

function clearStoredToken() {
  sessionStorage.removeItem(STORAGE_KEY)
}

function eventsOverlap(aStart, aEnd, bStart, bEnd) {
  return aStart < bEnd && aEnd > bStart
}

export function useGoogleCalendar(range) {
  const [token, setToken] = useState(readStoredToken)
  const [calendars, setCalendars] = useState([])
  const [events, setEvents] = useState([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [authError, setAuthError] = useState(null)

  const isConnected = !!token

  const disconnect = useCallback(() => {
    googleLogout()
    clearStoredToken()
    setToken(null)
    setCalendars([])
    setEvents([])
    setError(null)
  }, [])

  const handleAuthFailure = useCallback(
    (err) => {
      if (err.status === 401 || err.status === 403) {
        disconnect()
        setAuthError('Tu sesión de Google ha caducado o le faltan permisos. Vuelve a conectar.')
        return true
      }
      return false
    },
    [disconnect],
  )

  const login = useGoogleLogin({
    flow: 'implicit',
    scope: CALENDAR_SCOPE,
    onSuccess: (tokenResponse) => {
      const expiresAt = Date.now() + (tokenResponse.expires_in || 3600) * 1000
      storeToken(tokenResponse.access_token, expiresAt)
      setToken({ accessToken: tokenResponse.access_token, expiresAt })
      setAuthError(null)
    },
    onError: (err) => {
      setAuthError(err?.error_description || 'No se pudo conectar con Google Calendar.')
    },
  })

  const loadCalendars = useCallback(async () => {
    if (!token) return []
    const list = await fetchCalendarList(token.accessToken)
    setCalendars(list)
    return list
  }, [token])

  const loadEvents = useCallback(
    async (calendarList) => {
      if (!token) return
      const list = calendarList || calendars
      // Se consultan TODOS los calendarios a los que el usuario tiene acceso de lectura,
      // no solo los marcados como "selected" en la UI de Google Calendar: los eventos
      // creados por páginas de reserva de citas pueden vivir en calendarios ocultos.
      if (list.length === 0) {
        setEvents([])
        return
      }

      setLoading(true)
      setError(null)
      try {
        const results = await Promise.all(
          list.map(async (cal) => {
            const raw = await fetchEventsForCalendar(
              token.accessToken,
              cal.id,
              range.start.toISOString(),
              range.end.toISOString(),
            )
            return raw
              .filter((item) => item.status !== 'cancelled')
              .map((item) => normalizeEvent(item, cal))
          }),
        )
        const merged = results.flat().sort((a, b) => a.start - b.start)
        setEvents(merged)
      } catch (err) {
        if (!handleAuthFailure(err)) {
          setError(err.message || 'No se pudieron cargar los eventos.')
        }
      } finally {
        setLoading(false)
      }
    },
    [token, calendars, range, handleAuthFailure],
  )

  const refresh = useCallback(async () => {
    if (!token) return
    const list = await loadCalendars()
    await loadEvents(list)
  }, [token, loadCalendars, loadEvents])

  // Cargar calendarios y eventos al conectar.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- fetch inicial legítimo al autenticar
    if (token) refresh()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token])

  // Recargar eventos cuando cambia el rango visible (navegación de calendario).
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- refetch legítimo al cambiar de rango
    if (token && calendars.length > 0) loadEvents(calendars)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [range.start.getTime(), range.end.getTime()])

  // Comprueba si el rango [start, end) solapa con algún evento existente en Google Calendar,
  // consultando directamente la API (no depende de lo que haya cargado la vista actual).
  const checkConflict = useCallback(
    async (start, end, { excludeEventId } = {}) => {
      if (!token) return null
      const targets = calendars.length > 0 ? calendars : [{ id: PRIMARY_CALENDAR_ID }]
      const results = await Promise.all(
        targets.map(async (cal) => {
          const raw = await fetchEventsForCalendar(
            token.accessToken,
            cal.id,
            start.toISOString(),
            end.toISOString(),
          )
          return raw.filter((item) => item.status !== 'cancelled' && item.id !== excludeEventId)
        }),
      )
      const conflicting = results
        .flat()
        .filter((item) => {
          const itemStart = new Date(item.start?.dateTime || item.start?.date)
          const itemEnd = new Date(item.end?.dateTime || item.end?.date)
          return eventsOverlap(start, end, itemStart, itemEnd)
        })
      return conflicting.length > 0 ? conflicting[0] : null
    },
    [token, calendars],
  )

  const createMeeting = useCallback(
    async ({ title, description, start, end }) => {
      if (!token) return
      try {
        const body = await createCalendarEvent(token.accessToken, PRIMARY_CALENDAR_ID, {
          summary: title,
          description: description || undefined,
          start: { dateTime: start.toISOString() },
          end: { dateTime: end.toISOString() },
        })
        await refresh()
        return body
      } catch (err) {
        handleAuthFailure(err)
        throw err
      }
    },
    [token, refresh, handleAuthFailure],
  )

  const createUnavailableBlock = useCallback(
    async ({ reason, start, end }) => {
      if (!token) return
      try {
        const body = await createCalendarEvent(token.accessToken, PRIMARY_CALENDAR_ID, {
          summary: reason ? `No disponible: ${reason}` : 'No disponible',
          transparency: 'opaque',
          start: { dateTime: start.toISOString() },
          end: { dateTime: end.toISOString() },
          extendedProperties: {
            private: { [CESI_UNAVAILABLE_KEY]: CESI_UNAVAILABLE_VALUE },
          },
        })
        await refresh()
        return body
      } catch (err) {
        handleAuthFailure(err)
        throw err
      }
    },
    [token, refresh, handleAuthFailure],
  )

  const editEvent = useCallback(
    async (event, { title, description, start, end }) => {
      if (!token) return
      try {
        await updateCalendarEvent(token.accessToken, event.calendarId, event.googleEventId, {
          summary: title,
          description: description ?? undefined,
          start: { dateTime: start.toISOString() },
          end: { dateTime: end.toISOString() },
        })
        await refresh()
      } catch (err) {
        handleAuthFailure(err)
        throw err
      }
    },
    [token, refresh, handleAuthFailure],
  )

  const removeEvent = useCallback(
    async (event) => {
      if (!token) return
      try {
        await deleteCalendarEvent(token.accessToken, event.calendarId, event.googleEventId)
        await refresh()
      } catch (err) {
        handleAuthFailure(err)
        throw err
      }
    },
    [token, refresh, handleAuthFailure],
  )

  return {
    isConnected,
    calendars,
    events,
    loading,
    error,
    authError,
    connect: login,
    disconnect,
    refresh,
    checkConflict,
    createMeeting,
    createUnavailableBlock,
    editEvent,
    removeEvent,
  }
}
