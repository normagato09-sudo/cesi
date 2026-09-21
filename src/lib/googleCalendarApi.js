const API_BASE = 'https://www.googleapis.com/calendar/v3'

async function googleRequest(path, accessToken, { method = 'GET', params = {}, body } = {}) {
  const url = new URL(`${API_BASE}${path}`)
  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== null) url.searchParams.set(key, value)
  })

  const res = await fetch(url, {
    method,
    headers: {
      Authorization: `Bearer ${accessToken}`,
      ...(body ? { 'Content-Type': 'application/json' } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  })

  if (!res.ok) {
    const responseBody = await res.json().catch(() => null)
    const message = responseBody?.error?.message || `Error ${res.status} al llamar a Google Calendar`
    const error = new Error(message)
    error.status = res.status
    throw error
  }

  if (res.status === 204) return null
  return res.json()
}

async function googleFetch(path, accessToken, params = {}) {
  return googleRequest(path, accessToken, { params })
}

export async function fetchCalendarList(accessToken) {
  const items = []
  let pageToken
  do {
    const data = await googleFetch('/users/me/calendarList', accessToken, {
      minAccessRole: 'reader',
      pageToken,
    })
    items.push(...(data.items || []))
    pageToken = data.nextPageToken
  } while (pageToken)

  return items.map((cal) => ({
    id: cal.id,
    summary: cal.summaryOverride || cal.summary,
    backgroundColor: cal.backgroundColor || '#2563eb',
    foregroundColor: cal.foregroundColor || '#ffffff',
    primary: !!cal.primary,
    accessRole: cal.accessRole,
    editable: cal.accessRole === 'owner' || cal.accessRole === 'writer',
    selected: cal.selected !== false,
  }))
}

export async function fetchEventsForCalendar(accessToken, calendarId, timeMin, timeMax) {
  const items = []
  let pageToken
  do {
    const data = await googleFetch(`/calendars/${encodeURIComponent(calendarId)}/events`, accessToken, {
      timeMin,
      timeMax,
      singleEvents: true,
      orderBy: 'startTime',
      maxResults: 2500,
      pageToken,
    })
    items.push(...(data.items || []))
    pageToken = data.nextPageToken
  } while (pageToken)

  return items
}

export async function createCalendarEvent(accessToken, calendarId, eventBody) {
  return googleRequest(`/calendars/${encodeURIComponent(calendarId)}/events`, accessToken, {
    method: 'POST',
    body: eventBody,
  })
}

export async function updateCalendarEvent(accessToken, calendarId, eventId, eventBody) {
  return googleRequest(
    `/calendars/${encodeURIComponent(calendarId)}/events/${encodeURIComponent(eventId)}`,
    accessToken,
    { method: 'PATCH', body: eventBody },
  )
}

export async function deleteCalendarEvent(accessToken, calendarId, eventId) {
  return googleRequest(
    `/calendars/${encodeURIComponent(calendarId)}/events/${encodeURIComponent(eventId)}`,
    accessToken,
    { method: 'DELETE' },
  )
}
