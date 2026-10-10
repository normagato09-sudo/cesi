import { useState } from 'react'
import { format, addDays, addMonths } from 'date-fns'
import { es } from 'date-fns/locale'
import { X, CalendarPlus, Ban, Search } from 'lucide-react'
import FindSlotModal from './FindSlotModal.jsx'
import ParticipantPicker from './ParticipantPicker.jsx'
import { participantFields, participantsOf } from '../lib/contacts'
import { MeetingWarningError } from '../lib/meetingWarnings'
import { SCOPES } from '../lib/seriesEdits'
import { hasCandidateParticipant, isInterview } from '../lib/vacancies'
import { UNAVAILABLE_KINDS, allDaySpanDays, cleanNote, unavailableKindOf, unavailableNoteOf, unavailableTitle } from '../lib/unavailableKinds'
import MeetingWarning from './MeetingWarning.jsx'
import MeetLinkField from './MeetLinkField.jsx'
import './EventFormModal.css'


const DURATION_OPTIONS = [
  { value: '30', label: '30 minutos' },
  { value: '45', label: '45 minutos' },
  { value: '60', label: '1 hora' },
  { value: '90', label: '1 hora 30 minutos' },
  { value: '120', label: '2 horas' },
  { value: 'custom', label: 'Personalizada' },
]

const REPEAT_OPTIONS = [
  { value: '', label: 'No repetir' },
  { value: 'daily', label: 'Cada día' },
  { value: 'weekly', label: 'Cada semana' },
  { value: 'monthly', label: 'Cada mes' },
  { value: 'yearly', label: 'Cada año' },
]

function toDateInputValue(date) {
  return format(date, 'yyyy-MM-dd')
}

function toTimeInputValue(date) {
  return format(date, 'HH:mm')
}

function combineDateAndTime(dateStr, timeStr) {
  const [year, month, day] = dateStr.split('-').map(Number)
  const [hours, minutes] = timeStr.split(':').map(Number)
  return new Date(year, month - 1, day, hours, minutes, 0, 0)
}

function startOfDateInput(dateStr) {
  const [year, month, day] = dateStr.split('-').map(Number)
  return new Date(year, month - 1, day, 0, 0, 0, 0)
}

function addMinutesToTime(timeStr, minutes) {
  const [h, m] = timeStr.split(':').map(Number)
  const total = ((h * 60 + m + minutes) % 1440 + 1440) % 1440
  return `${String(Math.floor(total / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`
}

function diffMinutes(startTime, endTime) {
  const [sh, sm] = startTime.split(':').map(Number)
  const [eh, em] = endTime.split(':').map(Number)
  return eh * 60 + em - (sh * 60 + sm)
}

export default function EventFormModal({
  mode,
  initialEvent,
  // En una reunión que se repite: a qué días se aplica el cambio (SCOPES).
  scope = null,
  prefill,
  defaultDate,
  contacts,
  onCreateContact,
  onClose,
  onSubmit,
}) {
  const isEditing = !!initialEvent
  // Solo se duplica si el prefill es un evento existente (no un hueco o un participante preseleccionado).
  const isDuplicating = !isEditing && !!prefill?.id
  const seed = initialEvent || prefill || {}

  const [formType, setFormType] = useState(seed.isUnavailable ? 'unavailable' : mode || 'meeting')
  const isUnavailable = formType === 'unavailable'

  const baseStart = seed.start ? new Date(seed.start) : defaultDate
  const baseEnd = seed.end ? new Date(seed.end) : new Date(baseStart.getTime() + 60 * 60 * 1000)

  // Franja de todo el día: Vacaciones, Festivo u Otro (las antiguas, Otro). Todas con su nota (en
  // las antiguas, su motivo; ver unavailableNoteOf).
  const initialKind = seed.isUnavailable ? unavailableKindOf(seed) : 'other'

  const [title, setTitle] = useState(!isUnavailable ? seed.title || '' : '')
  // "Entrevista de candidato" (ver isInterview): la reunión cuenta en Vacantes y en el Inicio.
  const initialInterview = !seed.isUnavailable && isInterview(seed)
  const [interview, setInterview] = useState(initialInterview)
  const [description, setDescription] = useState(seed.description || '')
  const [participantSelection, setParticipantSelection] = useState(() => {
    const resolved = participantsOf(seed, contacts)
    return { participantIds: resolved.contacts.map((c) => c.id), guests: resolved.guests }
  })
  const [meetLink, setMeetLink] = useState(seed.meetLink || '')
  // "Yo no asisto": la organizo para otras personas (no es tiempo mío). Es de toda la serie.
  const [notAttending, setNotAttending] = useState(!!seed.notAttending)
  const [allDay, setAllDay] = useState(!!seed.allDay)
  const [date, setDate] = useState(toDateInputValue(baseStart))
  // Último día (incluido) de una franja de todo el día de varios días.
  const [endDate, setEndDate] = useState(
    toDateInputValue(seed.allDay && seed.end ? addDays(baseStart, allDaySpanDays(seed) - 1) : baseStart),
  )
  const [kind, setKind] = useState(initialKind)
  const [note, setNote] = useState(seed.isUnavailable ? unavailableNoteOf(seed) : '')
  const [startTime, setStartTime] = useState(toTimeInputValue(baseStart))
  const [endTime, setEndTime] = useState(toTimeInputValue(baseEnd))

  const initialDiff = diffMinutes(toTimeInputValue(baseStart), toTimeInputValue(baseEnd))
  const presetMatch = DURATION_OPTIONS.find((o) => o.value !== 'custom' && Number(o.value) === initialDiff)
  const [durationChoice, setDurationChoice] = useState(presetMatch ? presetMatch.value : 'custom')
  const [customDuration, setCustomDuration] = useState(initialDiff > 0 ? initialDiff : 60)

  const [repeatFreq, setRepeatFreq] = useState(initialEvent?.recurrence?.freq || '')
  const [repeatUntil, setRepeatUntil] = useState(
    initialEvent?.recurrence?.until
      ? toDateInputValue(new Date(initialEvent.recurrence.until))
      : toDateInputValue(addMonths(baseStart, 3)),
  )

  const [slotFinderOpen, setSlotFinderOpen] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [formError, setFormError] = useState(null)
  const [saveWarning, setSaveWarning] = useState(null)

  const applyDuration = (minutes) => {
    if (Number.isFinite(minutes) && minutes > 0) setEndTime(addMinutesToTime(startTime, minutes))
  }

  const handleDurationChange = (value) => {
    setDurationChoice(value)
    applyDuration(value === 'custom' ? Number(customDuration) : Number(value))
  }

  const handleCustomDurationChange = (value) => {
    setCustomDuration(value)
    if (durationChoice === 'custom') applyDuration(Number(value))
  }

  const handleStartTimeChange = (value) => {
    setStartTime(value)
    const minutes = durationChoice === 'custom' ? Number(customDuration) : Number(durationChoice)
    if (Number.isFinite(minutes) && minutes > 0) {
      setEndTime(addMinutesToTime(value, minutes))
    }
  }

  // La casilla se ofrece si participa algún candidato (o si ya estaba marcada, para poder quitarla).
  const showInterview =
    !isUnavailable && (initialInterview || interview || hasCandidateParticipant(participantSelection.participantIds, contacts))
  // Al editar solo se guarda si cambia: así un día de una serie no queda "cambiado" sin motivo.
  const interviewField = showInterview && (!isEditing || interview !== initialInterview) ? { interview } : {}

  const handleSlotPicked = (slot, participants, options = {}) => {
    if (participants) setParticipantSelection(participants)
    if ('notAttending' in options) setNotAttending(!!options.notAttending)
    if ('interview' in options) setInterview(!!options.interview)
    setDate(toDateInputValue(slot.start))
    setStartTime(toTimeInputValue(slot.start))
    setEndTime(toTimeInputValue(slot.end))
    setSlotFinderOpen(false)
  }

  const effectiveDurationMinutes = durationChoice === 'custom' ? Number(customDuration) : Number(durationChoice)

  // Hora de la reunión tal como está en el formulario: los participantes dicen si pueden y su
  // hora local, y se actualizan al cambiar la fecha o la hora.
  const liveTimes = (() => {
    if (!date || !startTime || !endTime) return { start: null, end: null }
    const s = combineDateAndTime(date, startTime)
    const e = combineDateAndTime(date, endTime)
    return Number.isNaN(s.getTime()) || e <= s ? { start: null, end: null } : { start: s, end: e }
  })()

  // Qué días cambian, en una reunión que se repite.
  const occurrenceDay = initialEvent?.isRecurringInstance
    ? format(new Date(initialEvent.originalStart || initialEvent.start), "EEEE d 'de' MMMM", { locale: es })
    : null
  const scopeNote =
    scope === SCOPES.THIS
      ? `Solo cambia el ${occurrenceDay}. El resto de la serie no cambia.`
      : scope === SCOPES.FOLLOWING
        ? `Cambia el ${occurrenceDay} y los días siguientes. Los anteriores no cambian.`
        : scope === SCOPES.ALL
          ? 'Cambia toda la serie.'
          : null

  const isDayOff = isUnavailable && allDay && kind !== 'other'

  const heading = isEditing
    ? isUnavailable
      ? 'Editar franja no disponible'
      : 'Editar reunión'
    : isDuplicating
      ? isUnavailable
        ? 'Duplicar franja no disponible'
        : 'Duplicar reunión'
      : isUnavailable
        ? 'Marcar como no disponible'
        : 'Nueva reunión'

  const handleSubmit = async (e) => {
    e.preventDefault()
    setFormError(null)

    if (!isUnavailable && !title.trim()) {
      setFormError('El título es obligatorio.')
      return
    }
    if (repeatFreq && !repeatUntil) {
      setFormError('Indica hasta cuándo se repite.')
      return
    }

    let start
    let end
    if (allDay) {
      if (isUnavailable && endDate && endDate < date) {
        setFormError('El último día es anterior al primero.')
        return
      }
      start = startOfDateInput(date)
      end = addDays(isUnavailable && endDate ? startOfDateInput(endDate) : start, 1)
    } else {
      start = combineDateAndTime(date, startTime)
      end = combineDateAndTime(date, endTime)
    }
    if (end <= start) {
      setFormError('La hora de finalización debe ser posterior a la de inicio.')
      return
    }

    const payload = {
      title: isUnavailable ? unavailableTitle(isDayOff ? kind : 'other', note) : title.trim(),
      description: isUnavailable ? '' : description.trim(),
      ...(isUnavailable
        ? participantFields([], [])
        : participantFields(
            // Se ignoran los ids de contactos que ya no existen.
            participantSelection.participantIds.map((id) => contacts.find((c) => c.id === id)).filter(Boolean),
            participantSelection.guests,
          )),
      meetLink: isUnavailable ? '' : meetLink.trim(),
      notAttending: !isUnavailable && notAttending,
      // category, tags y projectId ya no se editan: lo guardado en la reunión se conserva.
      ...interviewField,
      isUnavailable,
      allDay: isUnavailable ? allDay : false,
      // Tipo de la franja de todo el día y nota de cualquier franja (ver unavailableKinds.js).
      ...(isUnavailable ? { unavailableNote: cleanNote(note), ...(allDay ? { unavailableKind: kind } : {}) } : {}),
      start,
      end,
      recurrence: repeatFreq ? { freq: repeatFreq, until: new Date(`${repeatUntil}T23:59:59`).toISOString() } : null,
    }

    await save(payload)
  }

  // Si algún participante no puede, se muestra el aviso y se puede guardar igualmente.
  const save = async (payload, options) => {
    setSubmitting(true)
    setSaveWarning(null)
    try {
      await onSubmit(payload, options)
      onClose()
    } catch (err) {
      if (err instanceof MeetingWarningError) setSaveWarning({ violations: err.violations, payload })
      else setFormError(err.message || 'No se pudo guardar. Inténtalo de nuevo.')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="event-form-backdrop" onClick={onClose}>
      <form className="event-form" onClick={(e) => e.stopPropagation()} onSubmit={handleSubmit}>
        <div className="event-form-header">
          <h2>
            {isUnavailable ? <Ban size={17} strokeWidth={1.75} /> : <CalendarPlus size={17} strokeWidth={1.75} />}
            {heading}
          </h2>
          <button type="button" className="event-form-close" onClick={onClose} aria-label="Cerrar">
            <X size={18} strokeWidth={1.75} />
          </button>
        </div>

        <div className="event-form-body">
          {scopeNote && <p className="event-form-scope-note">{scopeNote}</p>}

          {!isEditing && (
            <div className="event-form-type-switch">
              <button
                type="button"
                className={formType === 'meeting' ? 'active' : ''}
                onClick={() => setFormType('meeting')}
              >
                Reunión
              </button>
              <button
                type="button"
                className={formType === 'unavailable' ? 'active' : ''}
                onClick={() => setFormType('unavailable')}
              >
                No disponible
              </button>
            </div>
          )}

          {!isUnavailable && (
            <label className="event-form-field">
              <span>Título</span>
              <input
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="Reunión con..."
                autoFocus
              />
            </label>
          )}

          {!isUnavailable && scope !== SCOPES.THIS && (
            <label className="not-attending-option">
              <input type="checkbox" checked={notAttending} onChange={(e) => setNotAttending(e.target.checked)} />
              <span>
                <strong>Yo no asisto</strong>
                <span>
                  La organizas para que se reúnan entre ellos: se queda en tu calendario como «Organizada por mí», sin
                  ocupar tu tiempo, y podrás enviarles la convocatoria.
                </span>
              </span>
            </label>
          )}

          {isUnavailable && (
            <label className="event-form-checkbox">
              <input type="checkbox" checked={allDay} onChange={(e) => setAllDay(e.target.checked)} />
              <span>Todo el día</span>
            </label>
          )}

          {isUnavailable && allDay && (
            <label className="event-form-field">
              <span>Tipo</span>
              <select value={kind} onChange={(e) => setKind(e.target.value)}>
                {UNAVAILABLE_KINDS.map((k) => (
                  <option key={k.value} value={k.value}>
                    {k.label}
                  </option>
                ))}
              </select>
            </label>
          )}

          {isUnavailable && (
            <label className="event-form-field">
              <span>Nota (opcional)</span>
              <input
                type="text"
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder={isDayOff ? 'Navidad' : 'Comida, médico…'}
                maxLength={80}
              />
              <em className="event-form-hint">
                {isDayOff
                  ? `Solo la ves tú: en tu enlace de reservas sale «${kind === 'vacation' ? 'No disponible: vacaciones' : 'Festivo'}».`
                  : 'Solo la ves tú: en tu enlace de reservas, ese tiempo simplemente no tiene huecos.'}
              </em>
            </label>
          )}

          {isUnavailable && allDay ? (
            <div className="event-form-row">
              <label className="event-form-field">
                <span>Desde</span>
                <input
                  type="date"
                  value={date}
                  onChange={(e) => {
                    const value = e.target.value
                    // Si el fin queda antes del inicio, se mueve con él.
                    if (value && endDate < value) setEndDate(value)
                    setDate(value)
                  }}
                />
              </label>
              <label className="event-form-field">
                <span>Hasta (incluido)</span>
                <input type="date" value={endDate} min={date} onChange={(e) => setEndDate(e.target.value)} />
              </label>
            </div>
          ) : (
            <label className="event-form-field">
              <span>Fecha</span>
              <input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
            </label>
          )}

          {!allDay && (
            <>
              <div className="event-form-row">
                <label className="event-form-field">
                  <span>Hora de inicio</span>
                  <input type="time" value={startTime} onChange={(e) => handleStartTimeChange(e.target.value)} />
                </label>
                <label className="event-form-field">
                  <span>Duración</span>
                  <select value={durationChoice} onChange={(e) => handleDurationChange(e.target.value)}>
                    {DURATION_OPTIONS.map((o) => (
                      <option key={o.value} value={o.value}>
                        {o.label}
                      </option>
                    ))}
                  </select>
                </label>
              </div>

              {durationChoice === 'custom' && (
                <label className="event-form-field">
                  <span>Duración personalizada (minutos)</span>
                  <input
                    type="number"
                    min="5"
                    step="5"
                    value={customDuration}
                    onChange={(e) => handleCustomDurationChange(e.target.value)}
                  />
                </label>
              )}

              <label className="event-form-field">
                <span>Hora de fin</span>
                <input type="time" value={endTime} onChange={(e) => setEndTime(e.target.value)} />
              </label>

              {!isUnavailable && (
                <button
                  type="button"
                  className="event-form-find-slot-btn"
                  onClick={() => setSlotFinderOpen(true)}
                >
                  <Search size={14} strokeWidth={1.75} />
                  Buscar hueco para esta reunión
                </button>
              )}
            </>
          )}

          <div className="event-form-row" hidden={scope === SCOPES.THIS}>
            <label className="event-form-field">
              <span>Repetir</span>
              <select value={repeatFreq} onChange={(e) => setRepeatFreq(e.target.value)}>
                {REPEAT_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
            </label>
            {repeatFreq && (
              <label className="event-form-field">
                <span>Hasta</span>
                <input type="date" value={repeatUntil} min={date} onChange={(e) => setRepeatUntil(e.target.value)} />
              </label>
            )}
          </div>

          {!isUnavailable && (
            <div className="event-form-field">
              <span id="event-form-participants-label">Participantes</span>
              <ParticipantPicker
                labelId="event-form-participants-label"
                contacts={contacts}
                participantIds={participantSelection.participantIds}
                guests={participantSelection.guests}
                onChange={setParticipantSelection}
                onCreateContact={onCreateContact}
                start={liveTimes.start}
                end={liveTimes.end}
              />
            </div>
          )}

          {showInterview && (
            <label className="event-form-checkbox">
              <input type="checkbox" checked={interview} onChange={(e) => setInterview(e.target.checked)} />
              <span>Entrevista de candidato</span>
            </label>
          )}

          {!isUnavailable && (
            <MeetLinkField value={meetLink} onChange={setMeetLink} />
          )}

          {!isUnavailable && (
            <label className="event-form-field">
              <span>Descripción (opcional)</span>
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                rows={3}
                placeholder="Detalles de la reunión..."
              />
            </label>
          )}

          {formError && <div className="event-form-error">{formError}</div>}

          {saveWarning && (
            <MeetingWarning
              violations={saveWarning.violations}
              onFind={() => {
                setSaveWarning(null)
                setSlotFinderOpen(true)
              }}
              onReview={() => setSaveWarning(null)}
              onSave={() => save(saveWarning.payload, { ignoreWarnings: true })}
              saving={submitting}
            />
          )}
        </div>

        <div className="event-form-footer">
          <button type="button" className="event-form-cancel" onClick={onClose} disabled={submitting}>
            Cancelar
          </button>
          <button type="submit" className="event-form-submit" disabled={submitting}>
            {submitting ? 'Guardando...' : isEditing ? 'Guardar cambios' : 'Crear'}
          </button>
        </div>
      </form>

      {slotFinderOpen && (
        <FindSlotModal
          initialDurationMinutes={effectiveDurationMinutes}
          initialInterview={showInterview && interview}
          initialParticipants={participantSelection}
          initialNotAttending={!isUnavailable && notAttending}
          onPick={handleSlotPicked}
          onClose={() => setSlotFinderOpen(false)}
        />
      )}
    </div>
  )
}
