import { useCallback, useMemo, useState } from 'react'
import {
  getAllEvents,
  createEvent as storageCreateEvent,
  updateEvent as storageUpdateEvent,
  deleteEvent as storageDeleteEvent,
} from '../lib/localEvents'
import { expandEvents } from '../lib/recurrence'
import { findConflict } from '../lib/conflicts'
import { getWorkingHours, saveWorkingHours as storageSaveWorkingHours } from '../lib/availability'

// Fuente de datos propia de CESI (localStorage), independiente de Google Calendar.
export function useLocalCalendar(range) {
  const [rawEvents, setRawEvents] = useState(() => getAllEvents())
  const [workingHours, setWorkingHoursState] = useState(() => getWorkingHours())

  const refresh = useCallback(() => setRawEvents(getAllEvents()), [])

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
  }
}
