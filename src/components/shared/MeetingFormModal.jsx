import { useEffect, useMemo, useState } from 'react'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import Modal from './Modal.jsx'
import { MeetingWarningError } from '../../lib/meetingWarnings'
import { isActiveMember } from '../../lib/team'
import {
  DURATIONS,
  addDaysKey,
  busyByHour,
  dayLabel,
  daysRange,
  emptyMeetingForm,
  errorText,
  fetchFreeBusy,
  formFromMeeting,
  freeHours,
  hhmmOf,
  keyOf,
  listInvitablePeople,
  meetingTimes,
  mondayOf,
  saveMeeting,
  validateMeetingForm,
  weekKeys,
  weekLabel,
  withExternals,
} from '../../lib/sharedCalendar'
import { pad2, zoneLabel } from '../../lib/timezones'

const ROLE_LABELS = { ceo: 'Dirección', equipo: 'Equipo', alumno: 'Alumno' }
const FREE_BUSY_DELAY_MS = 300

function durationLabel(minutes) {
  if (minutes < 60) return `${minutes} min`
  const h = Math.floor(minutes / 60)
  const m = minutes % 60
  return m ? `${h} h ${m} min` : `${h} h`
}

// Texto de búsqueda sin mayúsculas ni acentos.
const plain = (text) =>
  (text || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()

// «Nueva reunión» (o editar una reunión compartida mía): título, día, hora y duración (en mi zona),
// enlace, descripción y participantes con cuenta (solo a quien puedo invitar). Con participantes,
// la tabla de la semana marca en verde las horas en que estamos todos libres (al pulsar una, se pone
// ese día y esa hora; al pulsar una ocupada, se ve quién no puede, sin detalles).
// Solo la ceo (externalContacts y onSaveLocal): también contactos externos, que no cuentan en la
// tabla. Si hay alguien con cuenta, se guarda como reunión compartida (los externos van en la
// descripción); si no, como evento suyo (onSaveLocal), y «Más opciones» abre su formulario de
// eventos de siempre.
// prefill: { date, time, externalIds, interview } de una reunión nueva.
export default function MeetingFormModal({
  client,
  meId,
  zone,
  meeting = null,
  prefill = null,
  externalContacts = null,
  onSaveLocal = null,
  onMoreOptions = null,
  onClose,
  onSaved,
}) {
  const [form, setForm] = useState(() => {
    if (meeting) return formFromMeeting(meeting, zone)
    const empty = emptyMeetingForm(zone)
    return { ...empty, ...(prefill?.date ? { date: prefill.date } : {}), ...(prefill?.time ? { time: prefill.time } : {}) }
  })
  const [externalIds, setExternalIds] = useState(() => (meeting ? [] : prefill?.externalIds || []))
  const [externalQuery, setExternalQuery] = useState('')
  const [busyAt, setBusyAt] = useState(null) // hora ocupada pulsada: 'AAAA-MM-DD_h'
  const [warning, setWarning] = useState(null) // avisos de mis reglas al guardar como evento mío
  const [people, setPeople] = useState(null)
  const [peopleError, setPeopleError] = useState(null)
  const [query, setQuery] = useState('')
  const [gridMonday, setGridMonday] = useState(() => mondayOf(form.date))
  const [busyRows, setBusyRows] = useState(null)
  const [busyError, setBusyError] = useState(null)
  const [tried, setTried] = useState(false)
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState(null)

  const canLocal = !!onSaveLocal && !meeting
  const validation = { allowNoParticipants: canLocal }
  const errors = useMemo(() => (tried ? validateMeetingForm(form, zone, { allowNoParticipants: canLocal }) : {}), [tried, form, zone, canLocal])
  const set = (patch) => setForm((f) => ({ ...f, ...patch }))

  useEffect(() => {
    let active = true
    listInvitablePeople(client).then(
      (rows) => active && setPeople(rows || []),
      (err) => active && setPeopleError(errorText(err)),
    )
    return () => {
      active = false
    }
  }, [client])

  // Contactos que llegan ya añadidos («Nueva reunión con esta persona»): si tienen cuenta unida
  // (Accesos › Unida a), también como participantes.
  useEffect(() => {
    const ids = prefill?.externalIds || []
    if (meeting || ids.length === 0 || !client) return
    let active = true
    client
      .from('profiles')
      .select('id, linked_team_id, linked_student_id')
      .then(({ data }) => {
        if (!active || !data) return
        const linked = data.filter((r) => r.id !== meId && (ids.includes(r.linked_team_id) || ids.includes(r.linked_student_id))).map((r) => r.id)
        if (linked.length > 0) setForm((f) => ({ ...f, participants: [...new Set([...f.participants, ...linked])] }))
      })
    return () => {
      active = false
    }
  }, [client, meId, meeting, prefill])

  // Quien ya estaba en la reunión aunque ahora no se le pueda invitar (se puede quitar).
  const options = useMemo(() => {
    const list = [...(people || [])]
    for (const p of meeting?.participants || []) {
      if (p.id !== meId && !list.some((x) => x.id === p.id)) list.push({ id: p.id, name: p.name, role: '' })
    }
    return list
  }, [people, meeting, meId])

  const shown = options.filter((p) => !query.trim() || p.name.toLowerCase().includes(query.trim().toLowerCase()) || form.participants.includes(p.id))

  const days = useMemo(() => weekKeys(gridMonday), [gridMonday])
  const participantsKey = form.participants.join(',')

  useEffect(() => {
    if (!participantsKey) return
    let active = true
    const timer = setTimeout(() => {
      const { start, end } = daysRange(gridMonday, 7, zone)
      fetchFreeBusy(client, [meId, ...participantsKey.split(',')], start, end, meeting?.id || null).then(
        (rows) => {
          if (!active) return
          setBusyRows(rows || [])
          setBusyError(null)
        },
        (err) => active && setBusyError(errorText(err)),
      )
    }, FREE_BUSY_DELAY_MS)
    return () => {
      active = false
      clearTimeout(timer)
    }
  }, [client, meId, participantsKey, gridMonday, zone, meeting])

  const grid = useMemo(() => (busyRows ? freeHours(busyRows, days, zone) : null), [busyRows, days, zone])
  const busyPeople = useMemo(() => (busyRows ? busyByHour(busyRows, days, zone) : new Map()), [busyRows, days, zone])
  const nameOf = (id) => (id === meId ? 'Tú' : options.find((p) => p.id === id)?.name || 'Alguien')

  // Contactos externos (no del equipo activo ni archivados), por nombre.
  const externals = useMemo(
    () =>
      (externalContacts || [])
        .filter((c) => !c.archived && (!isActiveMember(c) || externalIds.includes(c.id)))
        .sort((a, b) => (a.name || '').localeCompare(b.name || '', 'es')),
    [externalContacts, externalIds],
  )
  const chosenExternals = externalIds.map((id) => (externalContacts || []).find((c) => c.id === id)).filter(Boolean)
  const shownExternals = externalQuery.trim()
    ? externals.filter((c) => plain(`${c.name} ${c.email || ''}`).includes(plain(externalQuery.trim())) && !externalIds.includes(c.id)).slice(0, 8)
    : []

  // Horas que ocupa la reunión elegida (para marcarlas en la tabla).
  const selected = useMemo(() => {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(form.date) || !/^\d{2}:\d{2}$/.test(form.time)) return new Set()
    const { start, end, exists } = meetingTimes(form, zone)
    if (!exists) return new Set()
    const out = new Set()
    for (let t = start.getTime(); t < end.getTime(); t += 15 * 60000) {
      const d = new Date(t)
      out.add(`${keyOf(d, zone)}_${Number(hhmmOf(d, zone).slice(0, 2))}`)
    }
    return out
  }, [form, zone])

  const allFreeAtChosen = useMemo(() => {
    if (!grid || selected.size === 0) return null
    for (const cell of selected) {
      const [key, hour] = cell.split('_')
      const hours = grid.get(key)
      if (!hours) return null
      if (hours[Number(hour)] !== 'free') return false
    }
    return true
  }, [grid, selected])

  const toggle = (id) => set({ participants: form.participants.includes(id) ? form.participants.filter((x) => x !== id) : [...form.participants, id] })

  // Lo escrito, para guardarlo como evento mío o abrir «Más opciones».
  const localData = () => {
    const ok = Object.keys(validateMeetingForm(form, zone, validation)).filter((k) => k !== 'title').length === 0
    const times = ok ? meetingTimes(form, zone) : null
    return {
      title: form.title.trim(),
      description: form.description.trim(),
      link: form.link.trim(),
      start: times?.start,
      end: times?.end,
      externalIds,
      interview: !!prefill?.interview,
    }
  }

  const save = async ({ ignoreWarnings = false } = {}) => {
    setTried(true)
    if (Object.keys(validateMeetingForm(form, zone, validation)).length > 0) return
    setSaving(true)
    setSaveError(null)
    setWarning(null)
    try {
      if (form.participants.length > 0 || !canLocal) {
        // Con alguien con cuenta: reunión compartida (los externos, en la descripción).
        await saveMeeting(client, meeting?.id || null, { ...form, description: withExternals(form.description, chosenExternals) }, zone)
      } else {
        // Solo externos o nadie: evento mío.
        await onSaveLocal(localData(), { ignoreWarnings })
      }
      onSaved()
    } catch (err) {
      if (err instanceof MeetingWarningError) setWarning(err.violations.map((v) => v.message).join(' '))
      else setSaveError(err?.code ? errorText(err) : err?.message || errorText(err))
      setSaving(false)
    }
  }

  const handleSubmit = (e) => {
    e.preventDefault()
    save()
  }

  const field = (name) => `sc-field${errors[name] ? ' invalid' : ''}`

  return (
    <Modal title={meeting ? 'Editar reunión' : 'Nueva reunión'} wide onClose={onClose}>
      <form className="sc-form" onSubmit={handleSubmit} noValidate>
        <label className={field('title')}>
          <span>Título</span>
          <input type="text" value={form.title} maxLength={200} onChange={(e) => set({ title: e.target.value })} autoFocus />
          {errors.title && <span className="sc-error">{errors.title}</span>}
        </label>

        <div className="sc-row">
          <label className={field('date')}>
            <span>Día</span>
            <input
              type="date"
              value={form.date}
              onChange={(e) => {
                set({ date: e.target.value })
                if (/^\d{4}-\d{2}-\d{2}$/.test(e.target.value)) setGridMonday(mondayOf(e.target.value))
              }}
            />
            {errors.date && <span className="sc-error">{errors.date}</span>}
          </label>
          <label className={field('time')}>
            <span>Hora</span>
            <input type="time" step={900} value={form.time} onChange={(e) => set({ time: e.target.value })} />
            {errors.time && <span className="sc-error">{errors.time}</span>}
          </label>
          <label className={field('minutes')}>
            <span>Duración</span>
            <select value={form.minutes} onChange={(e) => set({ minutes: Number(e.target.value) })}>
              {[...new Set([...DURATIONS, Number(form.minutes)])]
                .sort((a, b) => a - b)
                .map((m) => (
                  <option key={m} value={m}>
                    {durationLabel(m)}
                  </option>
                ))}
            </select>
          </label>
        </div>
        <p className="sc-zone">Horas en tu zona: {zoneLabel(zone)}</p>

        <div className={field('participants')}>
          <span>Participantes</span>
          {peopleError ? (
            <p className="sc-message error">{peopleError}</p>
          ) : people === null ? (
            <p className="sc-message">Cargando…</p>
          ) : options.length === 0 ? (
            <p className="sc-message">No hay nadie a quien puedas invitar todavía.</p>
          ) : (
            <>
              <input type="search" placeholder="Buscar por nombre" value={query} onChange={(e) => setQuery(e.target.value)} aria-label="Buscar participante" />
              <div className="sc-picker">
                {shown.map((p) => (
                  <label key={p.id}>
                    <input type="checkbox" checked={form.participants.includes(p.id)} onChange={() => toggle(p.id)} />
                    <span>{p.name}</span>
                    <span className="sc-picker-role">{ROLE_LABELS[p.role] || ''}</span>
                  </label>
                ))}
              </div>
            </>
          )}
          {errors.participants && <span className="sc-error">{errors.participants}</span>}
        </div>

        {externalContacts && (
          <div className="sc-field">
            <span>Contactos externos (no cuentan en la tabla)</span>
            {chosenExternals.length > 0 && (
              <div className="sc-chips">
                {chosenExternals.map((c) => (
                  <span key={c.id} className="sc-chip">
                    {c.name || c.email}
                    <button type="button" onClick={() => setExternalIds((ids) => ids.filter((x) => x !== c.id))} aria-label={`Quitar a ${c.name}`}>
                      ×
                    </button>
                  </span>
                ))}
              </div>
            )}
            <input
              type="search"
              placeholder="Buscar en Contactos externos"
              value={externalQuery}
              onChange={(e) => setExternalQuery(e.target.value)}
              aria-label="Buscar contacto externo"
            />
            {shownExternals.length > 0 && (
              <div className="sc-picker">
                {shownExternals.map((c) => (
                  <button
                    key={c.id}
                    type="button"
                    className="sc-picker-add"
                    onClick={() => {
                      setExternalIds((ids) => [...ids, c.id])
                      setExternalQuery('')
                    }}
                  >
                    <span>{c.name || c.email}</span>
                    {c.email && <span className="sc-picker-role">{c.email}</span>}
                  </button>
                ))}
              </div>
            )}
            {canLocal && (
              <span className="sc-hint">
                {form.participants.length > 0
                  ? 'Se guardará como reunión compartida; los externos irán en la descripción.'
                  : 'Sin nadie con cuenta, se guardará como evento tuyo.'}
              </span>
            )}
          </div>
        )}

        {form.participants.length > 0 && (
          <div className="sc-field">
            <span>¿Cuándo estáis todos libres?</span>
            <div className="sc-toolbar">
              <button type="button" className="sc-btn sc-icon-btn" onClick={() => setGridMonday(addDaysKey(gridMonday, -7))} aria-label="Semana anterior">
                <ChevronLeft size={16} />
              </button>
              <span className="sc-week-label">{weekLabel(gridMonday)}</span>
              <button type="button" className="sc-btn sc-icon-btn" onClick={() => setGridMonday(addDaysKey(gridMonday, 7))} aria-label="Semana siguiente">
                <ChevronRight size={16} />
              </button>
            </div>
            {busyError ? (
              <p className="sc-message error">{busyError}</p>
            ) : !grid ? (
              <p className="sc-message">Calculando…</p>
            ) : (
              <>
                <div className="sc-grid-wrap">
                  <table className="sc-grid">
                    <thead>
                      <tr>
                        <th scope="col" aria-label="Hora" />
                        {days.map((k) => (
                          <th key={k} scope="col">
                            {dayLabel(k)}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {Array.from({ length: 24 }, (_, h) => (
                        <tr key={h}>
                          <td>{`${pad2(h)}:00`}</td>
                          {days.map((k) => {
                            const state = grid.get(k)?.[h] || 'busy'
                            const isSelected = selected.has(`${k}_${h}`)
                            const who = (busyPeople.get(`${k}_${h}`) || []).map(nameOf).join(', ')
                            return (
                              <td key={k}>
                                <button
                                  type="button"
                                  className={`sc-cell ${state}${isSelected ? ' selected' : ''}${busyAt === `${k}_${h}` ? ' picked' : ''}`}
                                  disabled={state === 'past' || state === 'none'}
                                  title={state === 'busy' && who ? `Ocupado: ${who}` : undefined}
                                  aria-label={`${dayLabel(k)} ${pad2(h)}:00 · ${state === 'free' ? 'todos libres' : `ocupado${who ? `: ${who}` : ''}`}`}
                                  onClick={() => {
                                    if (state === 'free') {
                                      setBusyAt(null)
                                      set({ date: k, time: `${pad2(h)}:00` })
                                    } else setBusyAt(`${k}_${h}`)
                                  }}
                                />
                              </td>
                            )
                          })}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <p className="sc-legend">
                  <span className="free">Todos libres (pulsa para elegir)</span>
                  <span>Alguien ocupado (pulsa para ver quién)</span>
                </p>
                {busyAt && (
                  <p className="sc-busy-who">
                    {dayLabel(busyAt.split('_')[0])} a las {pad2(Number(busyAt.split('_')[1]))}:00, ocupado:{' '}
                    {(busyPeople.get(busyAt) || []).map(nameOf).join(', ') || 'nadie'}
                  </p>
                )}
              </>
            )}
            {allFreeAtChosen === false && <p className="sc-warning">A esa hora no estáis todos libres.</p>}
          </div>
        )}

        <label className="sc-field">
          <span>Enlace (opcional)</span>
          <input type="url" placeholder="Discord, Meet…" value={form.link} maxLength={500} onChange={(e) => set({ link: e.target.value })} />
        </label>
        <label className="sc-field">
          <span>Descripción (opcional)</span>
          <textarea value={form.description} maxLength={4000} onChange={(e) => set({ description: e.target.value })} />
        </label>

        {saveError && <p className="sc-message error">{saveError}</p>}
        {warning && (
          <div className="sc-warning">
            {warning}{' '}
            <button type="button" className="sc-btn" disabled={saving} onClick={() => save({ ignoreWarnings: true })}>
              Guardar igualmente
            </button>
          </div>
        )}

        <div className="sc-actions">
          {canLocal && onMoreOptions && form.participants.length === 0 && (
            <button type="button" className="sc-btn sc-more" onClick={() => onMoreOptions(localData())}>
              Más opciones…
            </button>
          )}
          <button type="button" className="sc-btn" onClick={onClose}>
            Cancelar
          </button>
          <button type="submit" className="sc-btn-primary" disabled={saving}>
            {saving ? 'Guardando…' : meeting ? 'Guardar cambios' : 'Crear reunión'}
          </button>
        </div>
      </form>
    </Modal>
  )
}
