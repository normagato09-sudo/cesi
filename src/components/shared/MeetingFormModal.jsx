import { useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { Ban, CalendarDays, Check, ChevronDown, ChevronLeft, ChevronRight, Search, Wand2, X } from 'lucide-react'
import PlaceIcon from '../PlaceIcon.jsx'
import { getVideoRooms, linkChoices, meetingLinkFor } from '../../lib/videoCall'
import { MeetingWarningError } from '../../lib/meetingWarnings'
import { isActiveMember } from '../../lib/team'
import { hasCandidateParticipant, isCandidateOnly } from '../../lib/vacancies'
import { UNAVAILABLE_KINDS } from '../../lib/unavailableKinds'
import { SCOPES } from '../../lib/seriesEdits'
import { ordinal, recurrenceLabel, unitLabel, weekdayName, weekdayPosition } from '../../lib/recurrence'
import { zoneShort } from '../../lib/studentPortal'
import { pad2 } from '../../lib/timezones'
import { addDaysKey, daysRange, errorText, fetchFreeBusy, hhmmOf, keyOf, listInvitablePeopleWithArea, mondayOf, saveMeeting, weekKeys, weekLabel } from '../../lib/sharedCalendar'
import {
  AVAILABILITY_LABELS,
  DURATION_OPTIONS,
  availabilityAt,
  MAX_MINUTES,
  busyDuring,
  chosenTimes,
  externalLocalTime,
  firstUsefulHour,
  hourCells,
  initialForm,
  initials,
  localPayload,
  sharedDescription,
  withoutInterval,
} from '../../lib/meetingForm'
import './MeetingForm.css'

const ROLE_LABELS = { ceo: 'Dirección', equipo: 'Equipo', alumno: 'Alumno' }
const REPEAT_OPTIONS = [
  { value: '', label: 'No repetir' },
  { value: 'daily', label: 'Por días' },
  { value: 'weekly', label: 'Por semanas' },
  { value: 'monthly', label: 'Por meses' },
  { value: 'yearly', label: 'Por años' },
]
const DAY_SHORT = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb']
const FREE_BUSY_DELAY_MS = 300
const MAX_LIST = 60
// Disponibilidad en la lista: como mucho para tantas personas a la vez (lo que admite cesi_free_busy).
const MAX_AVAILABILITY = 50

const plain = (text) =>
  (text || '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()

function durationLabel(minutes) {
  if (minutes < 60) return `${minutes} min`
  const h = Math.floor(minutes / 60)
  const m = minutes % 60
  return m ? `${h} h ${m} min` : `${h} h`
}

// «Lun 2» de un día 'AAAA-MM-DD'.
function dayHead(key) {
  const [y, m, d] = key.split('-').map(Number)
  return `${DAY_SHORT[new Date(Date.UTC(y, m - 1, d)).getUTCDay()]} ${d}`
}

// «Jueves 5 nov · 18:00–19:00» en la zona.
function whenText(start, end, zone) {
  const day = start.toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'short', timeZone: zone }).replace(',', '').replace('.', '')
  return `${day.charAt(0).toUpperCase()}${day.slice(1)} · ${hhmmOf(start, zone)}–${hhmmOf(end, zone)}`
}

function monthlyOptions(key) {
  const day = new Date(`${key}T12:00:00`)
  if (Number.isNaN(day.getTime())) return []
  const { nth, isLast } = weekdayPosition(day)
  const weekday = weekdayName(day)
  return [
    { value: 'date', label: `El día ${day.getDate()}` },
    ...(nth <= 4 ? [{ value: 'nth', label: `El ${ordinal(nth)} ${weekday}` }] : []),
    ...(isLast ? [{ value: 'last', label: `El último ${weekday}` }] : []),
  ]
}

/**
 * «Nueva reunión»: el único formulario de reuniones, para la ceo, el equipo y los alumnos. Ventana
 * grande de dos columnas: a la izquierda título, participantes, enlace y «Más opciones»; a la
 * derecha «¿Cuándo les va bien?» (la tabla de la semana con quién puede a cada hora).
 *
 * Con alguien con cuenta se guarda como reunión compartida (los que no tienen cuenta y los
 * contactos externos van en la descripción). Solo la ceo (isCeo): si no hay nadie con cuenta, se
 * guarda como evento suyo (onSaveLocal), y también «No disponible», repetir, «Yo no asisto» y
 * entrevista. Edita una reunión compartida mía (`meeting`) o un evento mío (`event`, con `scope`
 * si es de una serie).
 */
export default function MeetingFormModal({
  client,
  meId,
  zone,
  isCeo = false,
  meeting = null,
  event = null,
  scope = null,
  prefill = null,
  contacts = [],
  groups = [],
  students = [],
  onSaveLocal = null,
  onClose,
  onSaved,
}) {
  const editingLocal = !!event
  const editing = !!meeting || editingLocal
  const [form, setForm] = useState(() => initialForm({ meeting, event, prefill, contacts, zone }))
  const set = (patch) => setForm((f) => ({ ...f, ...patch }))
  const [people, setPeople] = useState(() => (client ? null : [])) // personas con cuenta a las que puedo invitar
  const [peopleError, setPeopleError] = useState(null)
  const [links, setLinks] = useState(null) // a quién está unida cada cuenta (solo la ceo)
  const [query, setQuery] = useState('')
  const [moreOpen, setMoreOpen] = useState(() => !!(form.place || form.description || form.repeatFreq || form.notAttending))
  const [gridMonday, setGridMonday] = useState(() => mondayOf(form.date))
  const [busyRows, setBusyRows] = useState(null)
  const [busyError, setBusyError] = useState(null)
  const [hover, setHover] = useState(null) // 'AAAA-MM-DD_h'
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)
  const [warning, setWarning] = useState(null)
  const [linkMenu, setLinkMenu] = useState(false)
  const [linkChoicesList] = useState(() => linkChoices(getVideoRooms()))
  const linkRef = useRef(null)
  const gridRef = useRef(null)
  const scrolledFor = useRef(null)

  const isUnavailable = form.mode === 'unavailable'

  useEffect(() => {
    const onKey = (e) => e.key === 'Escape' && onClose()
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose])

  // El menú de «Generar enlace» se cierra al pulsar fuera o con Escape.
  useEffect(() => {
    if (!linkMenu) return
    const close = (e) => {
      if (e.type === 'keydown' ? e.key === 'Escape' : !linkRef.current?.contains(e.target)) setLinkMenu(false)
    }
    document.addEventListener('pointerdown', close)
    document.addEventListener('keydown', close)
    return () => {
      document.removeEventListener('pointerdown', close)
      document.removeEventListener('keydown', close)
    }
  }, [linkMenu])

  // Personas con cuenta (y, la ceo, a quién está unida cada cuenta).
  useEffect(() => {
    if (!client) return
    let active = true
    listInvitablePeopleWithArea(client).then(
      (rows) => active && setPeople((rows || []).filter((p) => p.id !== meId)),
      (err) => active && setPeopleError(errorText(err)),
    )
    if (isCeo) {
      client
        .from('profiles')
        .select('id, linked_team_id, linked_student_id')
        .then(({ data }) => {
          if (!active) return
          setLinks(data || [])
          // «Nueva reunión con esta persona»: si el contacto tiene cuenta, va como participante.
          const accountOf = new Map((data || []).filter((l) => l.linked_team_id).map((l) => [l.linked_team_id, l.id]))
          if (event || accountOf.size === 0) return
          setForm((f) => {
            const moved = f.contactIds.filter((id) => accountOf.has(id))
            if (moved.length === 0) return f
            return { ...f, contactIds: f.contactIds.filter((id) => !accountOf.has(id)), accounts: [...new Set([...f.accounts, ...moved.map((id) => accountOf.get(id))])] }
          })
        })
    }
    return () => {
      active = false
    }
    // Solo al abrir el formulario.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [client, meId, isCeo])

  const linkedTeam = useMemo(() => new Map((links || []).filter((l) => l.linked_team_id).map((l) => [l.linked_team_id, l.id])), [links])
  const linkedStudents = useMemo(() => new Set((links || []).map((l) => l.linked_student_id).filter(Boolean)), [links])

  // Filas de la lista: primero con cuenta; luego, sin cuenta (equipo y alumnos de la ceo).
  const baseRows = useMemo(() => {
    // noProfile: aún no ha completado su perfil (parte 22; sin ese dato, no se sabe y no se marca).
    const accounts = (people || []).map((p) => ({
      key: `a:${p.id}`,
      type: 'account',
      id: p.id,
      name: p.name || 'Sin nombre',
      tag: p.area_name || ROLE_LABELS[p.role] || '',
      noProfile: p.profile_done === false,
    }))
    if (!isCeo || meeting) return accounts
    const team = contacts
      .filter((c) => isActiveMember(c) && !linkedTeam.has(c.id))
      .map((c) => ({ key: `c:${c.id}`, type: 'contact', id: c.id, name: c.name || c.email || 'Sin nombre', tag: c.teamProfile?.area || 'Equipo', noAccount: true }))
    const studentRows = students
      .filter((s) => !linkedStudents.has(s.id) && s.name)
      .map((s) => ({ key: `s:${s.id}`, type: 'guest', id: s.name, name: s.name, tag: 'Alumno', noAccount: true }))
    const byName = (a, b) => a.name.localeCompare(b.name, 'es')
    return [...accounts, ...[...team, ...studentRows].sort(byName)]
  }, [people, isCeo, meeting, contacts, students, linkedTeam, linkedStudents])

  const rows = useMemo(() => {
    const q = plain(query.trim())
    if (!q) return baseRows
    const match = (text) => plain(text).includes(q)
    const found = baseRows.filter((r) => match(`${r.name} ${r.tag}`))
    if (!isCeo || meeting) return found
    // La ceo busca también en Contactos externos y en sus grupos.
    const externalRows = contacts
      .filter((c) => !c.archived && !isActiveMember(c) && !isCandidateOnly(c) && match(`${c.name} ${c.email || ''} ${c.organization || ''}`))
      .map((c) => ({ key: `e:${c.id}`, type: 'contact', id: c.id, name: c.name || c.email, tag: 'Externo', external: true }))
    const groupRows = groups
      .filter((g) => match(g.name))
      .map((g) => ({ key: `g:${g.id}`, type: 'group', id: g.id, name: g.name, tag: 'Grupo', members: contacts.filter((c) => (c.groupIds || []).includes(g.id)).map((c) => c.id) }))
    const exact = [...found, ...externalRows].some((r) => plain(r.name) === q)
    const guestRow = exact ? [] : [{ key: `t:${query.trim()}`, type: 'guest', id: query.trim(), name: query.trim(), tag: 'Invitado', noAccount: true, typed: true }]
    return [...groupRows, ...found, ...externalRows, ...guestRow]
  }, [query, baseRows, isCeo, meeting, contacts, groups])

  const isChosen = (r) =>
    r.type === 'account' ? form.accounts.includes(r.id) : r.type === 'contact' ? form.contactIds.includes(r.id) : r.type === 'guest' ? form.guests.includes(r.id) : false

  const toggle = (r) => {
    if (r.type === 'group') {
      set({ contactIds: [...new Set([...form.contactIds, ...r.members])] })
      setQuery('')
      return
    }
    const field = r.type === 'account' ? 'accounts' : r.type === 'contact' ? 'contactIds' : 'guests'
    const list = form[field]
    set({ [field]: list.includes(r.id) ? list.filter((x) => x !== r.id) : [...list, r.id] })
    if (r.typed || r.external) setQuery('')
  }

  const nameOfAccount = (id) => (id === meId ? 'Tú' : people?.find((p) => p.id === id)?.name || 'Alguien')
  const chips = [
    ...form.accounts.map((id) => ({ key: `a:${id}`, name: nameOfAccount(id), remove: () => set({ accounts: form.accounts.filter((x) => x !== id) }) })),
    ...form.contactIds.map((id) => {
      const c = contacts.find((x) => x.id === id)
      return { key: `c:${id}`, contact: c, name: c?.name || c?.email || 'Contacto', external: true, remove: () => set({ contactIds: form.contactIds.filter((x) => x !== id) }) }
    }),
    ...form.guests.map((g) => ({ key: `g:${g}`, name: g, external: true, remove: () => set({ guests: form.guests.filter((x) => x !== g) }) })),
  ]
  const externals = [...form.contactIds.map((id) => contacts.find((c) => c.id === id)).filter(Boolean), ...form.guests.map((name) => ({ name }))]

  // ¿Cómo se guarda? Reunión compartida (alguien con cuenta) o evento mío (la ceo, sin nadie con
  // cuenta, o «No disponible»).
  const asLocal = isCeo && !meeting && (isUnavailable || form.accounts.length === 0)
  const showInterview = isCeo && !isUnavailable && (form.interview || hasCandidateParticipant(form.contactIds, contacts))

  // Quién cuenta en la tabla: los participantes con cuenta y yo (salvo «Yo no asisto»).
  const gridPeople = useMemo(() => {
    const ids = isUnavailable ? [] : [...form.accounts]
    if (!(asLocal && form.notAttending)) ids.unshift(meId)
    return [...new Set(ids)]
  }, [form.accounts, isUnavailable, asLocal, form.notAttending, meId])
  const peopleKey = gridPeople.join(',')

  const days = useMemo(() => weekKeys(gridMonday), [gridMonday])
  const eventStart = event?.start ? new Date(event.start).getTime() : null
  const eventEnd = event?.end ? new Date(event.end).getTime() : null

  useEffect(() => {
    if (!client || !peopleKey) return
    let active = true
    const timer = setTimeout(() => {
      const { start, end } = daysRange(gridMonday, 7, zone)
      fetchFreeBusy(client, peopleKey.split(','), start, end, meeting?.id || null).then(
        (data) => {
          if (!active) return
          // Al editar un evento mío, su propio rato no cuenta como ocupado.
          setBusyRows(eventStart !== null ? withoutInterval(data || [], meId, new Date(eventStart), new Date(eventEnd)) : data || [])
          setBusyError(null)
        },
        (err) => active && setBusyError(errorText(err)),
      )
    }, FREE_BUSY_DELAY_MS)
    return () => {
      active = false
      clearTimeout(timer)
    }
  }, [client, peopleKey, gridMonday, zone, meeting, eventStart, eventEnd, meId])

  const cells = useMemo(() => (busyRows ? hourCells(busyRows, gridPeople, days, zone) : null), [busyRows, gridPeople, days, zone])

  // La tabla empieza en la primera hora en que a alguien le va bien (una vez por semana).
  useEffect(() => {
    if (!cells || !gridRef.current || scrolledFor.current === gridMonday) return
    scrolledFor.current = gridMonday
    const row = gridRef.current.querySelector(`[data-hour="${firstUsefulHour(cells)}"]`)
    if (row) gridRef.current.scrollTop = row.offsetTop - 34
  }, [cells, gridMonday])

  const times = chosenTimes(form, zone)
  const fullDay = isUnavailable && form.allDay
  const chosenCells = new Set()
  if (times?.exists && !fullDay) {
    for (let t = times.start.getTime(); t < times.end.getTime(); t += 15 * 60000) {
      const d = new Date(t)
      chosenCells.add(`${keyOf(d, zone)}_${Number(hhmmOf(d, zone).slice(0, 2))}`)
    }
  }
  const chosenBusy = busyRows && times?.exists ? busyDuring(busyRows, gridPeople, times.start, times.end) : null

  // Disponibilidad de las personas de la lista a la hora elegida (se actualiza al cambiar la hora).
  const startMs = times?.exists && !fullDay ? times.start.getTime() : null
  const endMs = startMs !== null ? times.end.getTime() : null
  const listIds = rows
    .slice(0, MAX_LIST)
    .filter((r) => r.type === 'account')
    .map((r) => r.id)
  const availKey = [...new Set([...form.accounts, ...listIds])].slice(0, MAX_AVAILABILITY).join(',')
  const noProfileKey = baseRows
    .filter((r) => r.noProfile)
    .map((r) => r.id)
    .join(',')
  const [avail, setAvail] = useState(() => new Map())
  useEffect(() => {
    if (!client || !availKey || startMs === null || isUnavailable) return
    let active = true
    const timer = setTimeout(() => {
      const ids = availKey.split(',')
      const noProfile = new Set(noProfileKey ? noProfileKey.split(',') : [])
      fetchFreeBusy(client, ids, new Date(startMs), new Date(endMs), meeting?.id || null).then(
        (data) => active && setAvail(availabilityAt(data || [], ids, new Date(startMs), new Date(endMs), noProfile)),
        () => active && setAvail(new Map()),
      )
    }, FREE_BUSY_DELAY_MS)
    return () => {
      active = false
      clearTimeout(timer)
    }
  }, [client, availKey, noProfileKey, startMs, endMs, isUnavailable, meeting])
  const availOf = (id) => (startMs === null || isUnavailable ? null : avail.get(id) || null)
  const hoverCell = hover ? cells?.get(hover.split('_')[0])?.[Number(hover.split('_')[1])] : null

  const repeatOptions = monthlyOptions(form.date)
  const intervalOk = /^\d{1,2}$/.test(form.repeatInterval) && Number(form.repeatInterval) > 0
  const repeatSummary =
    form.repeatFreq && intervalOk
      ? `${recurrenceLabel({ freq: form.repeatFreq, interval: Number(form.repeatInterval), monthlyBy: form.monthlyBy }, new Date(`${form.date}T12:00:00`))}${
          form.repeatUntil ? ` hasta el ${form.repeatUntil.split('-').reverse().join('/')}` : ''
        }`
      : ''
  const canRepeat = asLocal && !isUnavailable && scope !== SCOPES.THIS

  const save = async ({ ignoreWarnings = false } = {}) => {
    setError(null)
    setWarning(null)
    if (asLocal) {
      const { payload, error: problem } = localPayload(isUnavailable || canRepeat || scope === SCOPES.THIS ? form : { ...form, repeatFreq: '' }, zone, {
        contacts,
        original: event,
        showInterview,
      })
      if (problem) return setError(problem)
      setSaving(true)
      try {
        await onSaveLocal(payload, { ignoreWarnings })
        onSaved()
      } catch (err) {
        if (err instanceof MeetingWarningError) setWarning(err.violations.map((v) => v.message).join(' '))
        else setError(err?.message || 'No se pudo guardar. Inténtalo de nuevo.')
        setSaving(false)
      }
      return
    }
    if (!form.title.trim()) return setError('Escribe un título.')
    if (form.accounts.length === 0) return setError('Añade al menos un participante con cuenta.')
    if (!times?.exists) return setError(times ? 'Esa hora no existe ese día (cambio de hora).' : 'Elige el día y la hora.')
    if (!(Number(form.minutes) > 0 && Number(form.minutes) <= MAX_MINUTES)) return setError('Elige la duración.')
    setSaving(true)
    try {
      await saveMeeting(
        client,
        meeting?.id || null,
        { title: form.title, description: sharedDescription(form, externals), link: form.link, date: form.date, time: form.time, minutes: form.minutes, participants: form.accounts },
        zone,
      )
      onSaved()
    } catch (err) {
      setError(errorText(err))
      setSaving(false)
    }
  }

  const externalNames = externals.map((x) => x.name || x.email).join(', ')
  const footNote = isUnavailable
    ? 'Bloquea este rato en tu calendario: para los demás cuenta como ocupado.'
    : asLocal
      ? 'Sin nadie con cuenta: se guarda como evento tuyo.'
      : `Los invitados la recibirán como Pendiente hasta que la acepten.${externals.length > 0 ? ` Externos: ${externalNames} irán en la descripción.` : ''}`

  const heading = isUnavailable ? (editing ? 'Editar «No disponible»' : 'No disponible') : editing ? 'Editar reunión' : 'Nueva reunión'
  const scopeNote =
    scope === SCOPES.THIS
      ? 'Solo cambia este día; el resto de la serie no cambia.'
      : scope === SCOPES.FOLLOWING
        ? 'Cambia este día y los siguientes; los anteriores no cambian.'
        : scope === SCOPES.ALL
          ? 'Cambia toda la serie.'
          : null
  const submitLabel = saving ? 'Guardando…' : editing ? 'Guardar cambios' : isUnavailable ? 'Bloquear este rato' : 'Crear reunión'

  return createPortal(
    <div className="mf-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <form
        className="mf-modal"
        role="dialog"
        aria-modal="true"
        aria-label={heading}
        onSubmit={(e) => {
          e.preventDefault()
          save()
        }}
        noValidate
      >
        <header className="mf-head">
          <span className="mf-head-icon" aria-hidden="true">
            {isUnavailable ? <Ban size={20} strokeWidth={1.75} /> : <CalendarDays size={20} strokeWidth={1.75} />}
          </span>
          <div className="mf-head-text">
            <h2>{heading}</h2>
            <p>Horas en tu zona: {zoneShort(zone)}</p>
          </div>
          {isCeo && !editing && (
            <div className="mf-switch" role="group" aria-label="Tipo">
              <button type="button" className={!isUnavailable ? 'on' : ''} aria-pressed={!isUnavailable} onClick={() => set({ mode: 'meeting' })}>
                Reunión
              </button>
              <button type="button" className={isUnavailable ? 'on' : ''} aria-pressed={isUnavailable} onClick={() => set({ mode: 'unavailable' })}>
                No disponible
              </button>
            </div>
          )}
          <button type="button" className="mf-close" onClick={onClose} aria-label="Cerrar">
            <X size={18} strokeWidth={1.75} />
          </button>
        </header>

        <div className="mf-body">
          <section className="mf-left">
            {scopeNote && <p className="mf-note">{scopeNote}</p>}

            {!isUnavailable && (
              <label className="mf-field">
                <span>Título</span>
                <input type="text" value={form.title} maxLength={200} onChange={(e) => set({ title: e.target.value })} placeholder="Reunión de…" autoFocus />
              </label>
            )}

            {isUnavailable && (
              <>
                <label className="mf-check">
                  <input type="checkbox" checked={form.allDay} onChange={(e) => set({ allDay: e.target.checked })} />
                  <span>Todo el día</span>
                </label>
                {form.allDay && (
                  <>
                    <label className="mf-field">
                      <span>Tipo</span>
                      <select value={form.kind} onChange={(e) => set({ kind: e.target.value })}>
                        {UNAVAILABLE_KINDS.map((k) => (
                          <option key={k.value} value={k.value}>
                            {k.label}
                          </option>
                        ))}
                      </select>
                    </label>
                    <div className="mf-row">
                      <label className="mf-field">
                        <span>Desde</span>
                        <input
                          type="date"
                          value={form.date}
                          onChange={(e) => {
                            const v = e.target.value
                            set({ date: v, endDate: form.endDate < v ? v : form.endDate })
                            if (/^\d{4}-\d{2}-\d{2}$/.test(v)) setGridMonday(mondayOf(v))
                          }}
                        />
                      </label>
                      <label className="mf-field">
                        <span>Hasta (incluido)</span>
                        <input type="date" value={form.endDate} min={form.date} onChange={(e) => set({ endDate: e.target.value })} />
                      </label>
                    </div>
                  </>
                )}
                <p className="mf-hint">Para los demás, ese tiempo sale como ocupado (sin detalles).</p>
              </>
            )}

            {!isUnavailable && (
              <div className="mf-field">
                <span className="mf-label-row">
                  Participantes {chips.length > 0 && <em className="mf-count">{chips.length === 1 ? '1 elegida' : `${chips.length} elegidas`}</em>}
                </span>
                {chips.length > 0 && (
                  <div className="mf-chips">
                    {chips.map((c) => {
                      // Hora de la reunión allí (contactos externos con zona) y si le cae fuera de su horario.
                      const local = c.contact && times?.exists && !fullDay ? externalLocalTime(c.contact, times.start, times.end) : null
                      return (
                        <span
                          key={c.key}
                          className={`mf-chip${c.external ? ' external' : ''}${local?.outside ? ' outside' : ''}`}
                          title={local?.outside ? 'A esa hora está fuera de su horario' : undefined}
                        >
                          <span className="mf-avatar small">{initials(c.name)}</span>
                          {c.name}
                          {local && <span className="mf-chip-time">· {local.time} allí</span>}
                          <button type="button" onClick={c.remove} aria-label={`Quitar a ${c.name}`}>
                            <X size={13} strokeWidth={2} />
                          </button>
                        </span>
                      )
                    })}
                  </div>
                )}
                <label className="mf-search">
                  <Search size={15} strokeWidth={1.75} aria-hidden="true" />
                  <input
                    type="search"
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    placeholder={isCeo && !meeting ? 'Buscar personas, contactos externos o grupos' : 'Buscar por nombre'}
                    aria-label="Buscar participantes"
                  />
                </label>
                {peopleError ? (
                  <p className="mf-msg error">{peopleError}</p>
                ) : people === null ? (
                  <p className="mf-msg">Cargando…</p>
                ) : rows.length === 0 ? (
                  <p className="mf-msg">{query ? 'Nadie con ese nombre.' : 'No hay nadie a quien puedas invitar todavía.'}</p>
                ) : (
                  <ul className="mf-list">
                    {rows.slice(0, MAX_LIST).map((r) => {
                      const locked = r.type === 'account' && editingLocal
                      const chosen = isChosen(r)
                      const state = r.type === 'account' ? availOf(r.id) : null
                      return (
                        <li key={r.key}>
                          <label className={`mf-person${locked ? ' locked' : ''}${chosen ? ' chosen' : ''}`}>
                            <input className="mf-person-check" type="checkbox" checked={chosen} disabled={locked} onChange={() => toggle(r)} />
                            <span className={`mf-avatar${r.noAccount || r.external ? ' muted' : ''}`} aria-hidden="true">
                              {chosen ? <Check size={15} strokeWidth={2.5} /> : r.type === 'group' ? '#' : initials(r.name)}
                            </span>
                            <span className="mf-person-text">
                              <span className="mf-person-name">{r.typed ? `Añadir «${r.name}» como invitado` : r.name}</span>
                              {r.tag && !r.typed && <span className="mf-person-sub">{r.tag}</span>}
                            </span>
                            {r.noAccount && !r.typed && <span className="mf-tag warn">Sin cuenta</span>}
                            {state && (
                              <span className={`mf-avail ${state}`}>
                                <i aria-hidden="true" />
                                {AVAILABILITY_LABELS[state]}
                              </span>
                            )}
                          </label>
                        </li>
                      )
                    })}
                  </ul>
                )}
                <p className="mf-hint">
                  Los que aún no tienen cuenta se añaden como externos: no salen en la tabla de horas.
                  {editingLocal && ' Para invitar a personas con cuenta, crea una reunión nueva.'}
                </p>
              </div>
            )}

            {showInterview && (
              <label className="mf-check">
                <input type="checkbox" checked={form.interview} onChange={(e) => set({ interview: e.target.checked })} />
                <span>Entrevista de candidato</span>
              </label>
            )}

            {!isUnavailable && (
              <div className="mf-field">
                <label htmlFor="mf-link">Enlace</label>
                <div className="mf-link-row" ref={linkRef}>
                  <input id="mf-link" type="url" value={form.link} maxLength={500} onChange={(e) => set({ link: e.target.value })} placeholder="Discord, Meet…" />
                  <button type="button" className="mf-link-gen" onClick={() => setLinkMenu((o) => !o)} aria-expanded={linkMenu} aria-haspopup="menu" title="Generar enlace">
                    <Wand2 size={15} strokeWidth={1.75} />
                    Generar
                  </button>
                  {linkMenu && (
                    <div className="mf-link-menu" role="menu">
                      {linkChoicesList.map((p) => (
                        <button
                          key={p.id}
                          type="button"
                          role="menuitem"
                          onClick={() => {
                            set({ link: meetingLinkFor(p.id) })
                            setLinkMenu(false)
                          }}
                        >
                          <PlaceIcon place={p.id} size={20} />
                          <span>
                            {p.label}
                            <em>{p.id === 'jitsi' ? 'Enlace nuevo solo para esta reunión' : 'Tu sala fija'}</em>
                          </span>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            )}

            {!isUnavailable && (
              <div className="mf-more">
                <button type="button" className="mf-more-toggle" aria-expanded={moreOpen} onClick={() => setMoreOpen((o) => !o)}>
                  <ChevronDown size={16} strokeWidth={1.75} className={moreOpen ? 'open' : ''} />
                  Más opciones
                </button>
                {moreOpen && (
                  <div className="mf-more-body">
                    {isCeo && scope !== SCOPES.THIS && (
                      <div className="mf-field">
                        <span>Repetir</span>
                        <div className="mf-row">
                          <select value={canRepeat ? form.repeatFreq : ''} disabled={!canRepeat} onChange={(e) => set({ repeatFreq: e.target.value })} aria-label="Repetir">
                            {REPEAT_OPTIONS.map((o) => (
                              <option key={o.value} value={o.value}>
                                {o.label}
                              </option>
                            ))}
                          </select>
                          {canRepeat && form.repeatFreq && (
                            <span className="mf-inline">
                              cada
                              <input type="number" min={1} max={99} value={form.repeatInterval} onChange={(e) => set({ repeatInterval: e.target.value })} aria-label="Cada" />
                              {unitLabel(form.repeatFreq, Number(form.repeatInterval) || 2)}
                            </span>
                          )}
                        </div>
                        {!canRepeat && <em className="mf-hint">Las reuniones compartidas aún no se repiten.</em>}
                        {canRepeat && form.repeatFreq && (
                          <div className="mf-row">
                            {form.repeatFreq === 'monthly' && (
                              <select value={form.monthlyBy} onChange={(e) => set({ monthlyBy: e.target.value })} aria-label="Qué día">
                                {repeatOptions.map((o) => (
                                  <option key={o.value} value={o.value}>
                                    {o.label}
                                  </option>
                                ))}
                              </select>
                            )}
                            <label className="mf-inline">
                              hasta
                              <input type="date" value={form.repeatUntil} min={form.date} onChange={(e) => set({ repeatUntil: e.target.value })} />
                            </label>
                          </div>
                        )}
                        {canRepeat && form.repeatFreq && <em className="mf-hint">{repeatSummary || 'Indica cada cuántas veces se repite: un número del 1 al 99.'}</em>}
                      </div>
                    )}
                    <label className="mf-field">
                      <span>Lugar</span>
                      <input type="text" value={form.place} maxLength={200} onChange={(e) => set({ place: e.target.value })} placeholder="Sala, dirección…" />
                    </label>
                    {isCeo && asLocal && scope !== SCOPES.THIS && (
                      <label className="mf-check">
                        <input type="checkbox" checked={form.notAttending} onChange={(e) => set({ notAttending: e.target.checked })} />
                        <span>
                          <strong>Yo no asisto</strong>
                          <em>
                            La organizas para que se reúnan entre ellos: se queda en tu calendario como «Organizada por mí», sin ocupar tu
                            tiempo, y podrás enviarles la convocatoria.
                          </em>
                        </span>
                      </label>
                    )}
                    <label className="mf-field">
                      <span>Descripción</span>
                      <textarea value={form.description} maxLength={4000} rows={3} onChange={(e) => set({ description: e.target.value })} placeholder="Orden del día, detalles…" />
                    </label>
                  </div>
                )}
              </div>
            )}
          </section>

          <section className="mf-right">
            <div className="mf-right-head">
              <h3>{isUnavailable ? '¿Qué rato bloqueas?' : '¿Cuándo les va bien?'}</h3>
              <div className="mf-week">
                <button type="button" onClick={() => setGridMonday(addDaysKey(gridMonday, -7))} aria-label="Semana anterior">
                  <ChevronLeft size={16} />
                </button>
                <span>{weekLabel(gridMonday)}</span>
                <button type="button" onClick={() => setGridMonday(addDaysKey(gridMonday, 7))} aria-label="Semana siguiente">
                  <ChevronRight size={16} />
                </button>
              </div>
            </div>

            {!fullDay && (
              <div className="mf-row mf-when">
                <label className="mf-field">
                  <span>Día</span>
                  <input
                    type="date"
                    value={form.date}
                    onChange={(e) => {
                      const v = e.target.value
                      set({ date: v, endDate: v })
                      if (/^\d{4}-\d{2}-\d{2}$/.test(v)) setGridMonday(mondayOf(v))
                    }}
                  />
                </label>
                <label className="mf-field">
                  <span>Hora</span>
                  <input type="time" step={900} value={form.time} onChange={(e) => set({ time: e.target.value })} />
                </label>
                <label className="mf-field">
                  <span>Duración</span>
                  <select value={form.minutes} onChange={(e) => set({ minutes: Number(e.target.value) })}>
                    {[...new Set([...DURATION_OPTIONS, Number(form.minutes)])]
                      .sort((a, b) => a - b)
                      .map((m) => (
                        <option key={m} value={m}>
                          {durationLabel(m)}
                        </option>
                      ))}
                  </select>
                </label>
              </div>
            )}

            {!client ? (
              <p className="mf-msg">La tabla de horas necesita la sincronización.</p>
            ) : busyError ? (
              <p className="mf-msg error">{busyError}</p>
            ) : !cells ? (
              <p className="mf-msg">Calculando…</p>
            ) : (
              <div className="mf-grid-wrap" ref={gridRef}>
                <table className="mf-grid">
                  <thead>
                    <tr>
                      <th scope="col" aria-label="Hora" />
                      {days.map((k) => (
                        <th key={k} scope="col">
                          {dayHead(k)}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {Array.from({ length: 24 }, (_, h) => (
                      <tr key={h} data-hour={h}>
                        <td className="mf-hour">{pad2(h)}</td>
                        {days.map((k) => {
                          const c = cells.get(k)?.[h]
                          const id = `${k}_${h}`
                          const who = (c?.busy || []).map(nameOfAccount).join(', ')
                          return (
                            <td key={k}>
                              <button
                                type="button"
                                className={`mf-cell ${c?.state || 'none'}${chosenCells.has(id) ? ' chosen' : ''}`}
                                disabled={!c || c.state === 'past' || c.state === 'none' || fullDay}
                                title={who ? `Ocupados: ${who}` : undefined}
                                aria-label={`${dayHead(k)} ${pad2(h)}:00${c?.state === 'all' ? ' · les va bien a todos' : who ? ` · ocupados: ${who}` : ''}`}
                                onMouseEnter={() => setHover(id)}
                                onMouseLeave={() => setHover((x) => (x === id ? null : x))}
                                onFocus={() => setHover(id)}
                                onClick={() => {
                                  setHover(id)
                                  set({ date: k, time: `${pad2(h)}:00`, endDate: k })
                                }}
                              >
                                {c?.state === 'some' ? `${c.free}/${c.total}` : ''}
                              </button>
                            </td>
                          )
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            <p className="mf-legend">
              <span className="all">Les va bien a todos</span>
              <span className="some">Solo a algunos</span>
              <span className="nobody">A nadie</span>
              <span className="chosen">Hora elegida</span>
            </p>
            <p className="mf-hover" aria-live="polite">
              {hoverCell && hoverCell.busy.length > 0
                ? `${dayHead(hover.split('_')[0])} · ${pad2(Number(hover.split('_')[1]))}:00 — ocupados: ${hoverCell.busy.map(nameOfAccount).join(', ')}`
                : ' '}
            </p>

            {times?.exists && !fullDay && (
              <div className={`mf-summary${chosenBusy?.length ? ' warn' : chosenBusy ? ' ok' : ''}`}>
                <strong>{whenText(times.start, times.end, zone)}</strong>
                {chosenBusy &&
                  (chosenBusy.length === 0 ? (
                    <span>{gridPeople.length > 1 ? `Les va bien a todos (${gridPeople.length} contigo)` : 'Estás libre'}</span>
                  ) : (
                    <span>Ocupados a esa hora: {chosenBusy.map(nameOfAccount).join(', ')}</span>
                  ))}
              </div>
            )}
          </section>
        </div>

        <footer className="mf-foot">
          <div className="mf-foot-text">
            <p className="mf-foot-note">{footNote}</p>
            {error && <p className="mf-msg error">{error}</p>}
            {warning && (
              <p className="mf-msg warn">
                {warning}{' '}
                <button type="button" className="mf-btn" disabled={saving} onClick={() => save({ ignoreWarnings: true })}>
                  Guardar igualmente
                </button>
              </p>
            )}
          </div>
          <div className="mf-actions">
            <button type="button" className="mf-btn" onClick={onClose}>
              Cancelar
            </button>
            <button type="submit" className="mf-btn primary" disabled={saving}>
              {submitLabel}
            </button>
          </div>
        </footer>
      </form>
    </div>,
    document.body,
  )
}
