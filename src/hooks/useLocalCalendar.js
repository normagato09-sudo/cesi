import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  STORAGE_KEY as EVENTS_KEY,
  getAllEvents,
  createEvent as storageCreateEvent,
  updateEvent as storageUpdateEvent,
  deleteEvent as storageDeleteEvent,
} from '../lib/localEvents'
import { expandEvents } from '../lib/recurrence'
import { findConflict } from '../lib/conflicts'
import {
  STORAGE_KEY as WORKING_HOURS_KEY,
  getWorkingHours,
  saveWorkingHours as storageSaveWorkingHours,
} from '../lib/availability'

// Fuente de datos propia de CESI (localStorage).
export function useLocalCalendar(range) {
  const [rawEvents, setRawEvents] = useState(() => getAllEvents())
  const [workingHours, setWorkingHoursState] = useState(() => getWorkingHours())

  const refresh = useCallback(() => setRawEvents(getAllEvents()), [])

  // Relee todo desde localStorage (p. ej. tras importar una copia de seguridad).
  const reloadAll = useCallback(() => {
    setRawEvents(getAllEvents())
    setWorkingHoursState(getWorkingHours())
  }, [])

  // Si la app está abierta en otra pestaña y allí cambian los datos, se actualizan aquí.
  useEffect(() => {
    const handleStorage = (e) => {
      if (e.key === null || e.key === EVENTS_KEY) setRawEvents(getAllEvents())
      if (e.key === null || e.key === WORKING_HOURS_KEY) setWorkingHoursState(getWorkingHours())
    }
    window.addEventListener('storage', handleStorage)
    return () => window.removeEventListener('storage', handleStorage)
  }, [])

  const events = useMemo(() => expandEvents(rawEvents, range.start, range.end), [rawEvents, range])

  // excludeSeriesId: al mover/editar un evento, ignora su propia serie al comprobar solapamientos.
  const checkConflict = useCallback(
    (start, end, { excludeSeriesId } = {}) => {
      const occurrences = expandEvents(rawEvents, start, end)
      return findConflict(occurrences, start, end, { excludeSeriesId })
    },
    [rawEvents],
  )

  const addEvent = useCallback(
    (data) => {
      const event = storageCreateEvent(data)
      refresh()
      return event
    },
    [refresh],
  )

  const editEvent = useCallback(
    (id, patch) => {
      const event = storageUpdateEvent(id, patch)
      refresh()
      return event
    },
    [refresh],
  )

  const removeEvent = useCallback(
    (id) => {
      storageDeleteEvent(id)
      refresh()
    },
    [refresh],
  )

  const setWorkingHours = useCallback((wh) => {
    storageSaveWorkingHours(wh)
    setWorkingHoursState(wh)
  }, [])

  return {
    rawEvents,
    events,
    workingHours,
    setWorkingHours,
    checkConflict,
    addEvent,
    editEvent,
    removeEvent,
    refresh,
    reloadAll,
  }
}
