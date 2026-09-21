export const CESI_UNAVAILABLE_KEY = 'cesiType'
export const CESI_UNAVAILABLE_VALUE = 'unavailable'

function getMeetLink(rawEvent) {
  if (rawEvent.hangoutLink) return rawEvent.hangoutLink
  const entryPoints = rawEvent.conferenceData?.entryPoints || []
  const video = entryPoints.find((entry) => entry.entryPointType === 'video')
  return video?.uri || null
}

export function normalizeEvent(rawEvent, calendar) {
  const allDay = !rawEvent.start?.dateTime
  const start = new Date(rawEvent.start?.dateTime || rawEvent.start?.date)
  const end = new Date(rawEvent.end?.dateTime || rawEvent.end?.date)
  const isUnavailable =
    rawEvent.extendedProperties?.private?.[CESI_UNAVAILABLE_KEY] === CESI_UNAVAILABLE_VALUE

  return {
    id: `${calendar.id}::${rawEvent.id}`,
    googleEventId: rawEvent.id,
    calendarId: calendar.id,
    calendarName: calendar.summary,
    calendarColor: calendar.backgroundColor,
    editable: !!calendar.editable,
    title: rawEvent.summary || '(Sin título)',
    description: rawEvent.description || '',
    location: rawEvent.location || '',
    start,
    end,
    allDay,
    attendees: rawEvent.attendees || [],
    meetLink: getMeetLink(rawEvent),
    htmlLink: rawEvent.htmlLink,
    status: rawEvent.status,
    isUnavailable,
  }
}
