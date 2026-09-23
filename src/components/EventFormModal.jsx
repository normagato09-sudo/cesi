import { useMemo, useState } from 'react'
import { format, addDays, addMonths } from 'date-fns'
import { X, CalendarPlus, Ban, Search, TriangleAlert } from 'lucide-react'
import FindSlotModal from './FindSlotModal.jsx'
import ParticipantPicker from './ParticipantPicker.jsx'
import TagInput from './TagInput.jsx'
import { CATEGORY_OPTIONS } from '../lib/eventStyle'
import { participantFields, participantsOf } from '../lib/contacts'
import { allTags } from '../lib/tags'
import { RuleWarning } from '../lib/rules'
import { useScheduling } from '../lib/schedulingContext'
import './EventFormModal.css'

const UNAVAILABLE_REASONS = ['No disponible', 'Comida', 'Asunto personal', 'Estudio', 'Fuera de horario', 'Otro']

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
  prefill,
  defaultDate,
  contacts,
  onCreateContact,
  onClose,
  onSubmit,
}) {
  const { rawEvents } = useScheduling()
  const tagSuggestions = useMemo(() => allTags(rawEvents), [rawEvents])
  const isEditing = !!initialEvent
  // Solo se duplica si el prefill es un evento existente (no un hueco o un participante preseleccionado).
  const isDuplicating = !isEditing && !!prefill?.id
  const seed = initialEvent || prefill || {}

  const [formType, setFormType] = useState(seed.isUnavailable ? 'unavailable' : mode || 'meeting')
  const isUnavailable = formType === 'unavailable'

  const baseStart = seed.start ? new Date(seed.start) : defaultDate
  const baseEnd = seed.end ? new Date(seed.end) : new Date(baseStart.getTime() + 60 * 60 * 1000)

  const initialReason = isUnavailable
    ? UNAVAILABLE_REASONS.find((r) => seed.title === `No disponible: ${r}`) ||
      (seed.title && seed.title !== 'No disponible' ? 'Otro' : 'No disponible')
    : UNAVAILABLE_REASONS[0]
  const initialCustomReason =
    isUnavailable && initialReason === 'Otro' && seed.title ? seed.title.replace(/^No disponible: /, '') : ''

  const [title, setTitle] = useState(!isUnavailable ? seed.title || '' : '')
  const [category, setCategory] = useState(seed.category || CATEGORY_OPTIONS[0])
  const [tags, setTags] = useState(Array.isArray(seed.tags) ? seed.tags : [])
  const [reason, setReason] = useState(initialReason)
  const [customReason, setCustomReason] = useState(initialCustomReason)
  const [description, setDescription] = useState(seed.description || '')
  const [participantSelection, setParticipantSelection] = useState(() => {
    const resolved = participantsOf(seed, contacts)
    return { participantIds: resolved.contacts.map((c) => c.id), guests: resolved.guests }
  })
  const [meetLink, setMeetLink] = useState(seed.meetLink || '')
  const [allDay, setAllDay] = useState(!!seed.allDay)
  const [date, setDate] = useState(toDateInputValue(baseStart))
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
  const [ruleWarning, setRuleWarning] = useState(null)

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

  const handleSlotPicked = (slot, _meetingType, participants) => {
    if (participants) setParticipantSelection(participants)
    setDate(toDateInputValue(slot.start))
    setStartTime(toTimeInputValue(slot.start))
    setEndTime(toTimeInputValue(slot.end))
    setSlotFinderOpen(false)
  }

  const effectiveDurationMinutes = durationChoice === 'custom' ? Number(customDuration) : Number(durationChoice)

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
    if (isUnavailable && reason === 'Otro' && !customReason.trim()) {
      setFormError('Indica un motivo.')
      return
    }
    if (repeatFreq && !repeatUntil) {
      setFormError('Indica hasta cuándo se repite.')
      return
    }

    let start
    let end
    if (allDay) {
      start = startOfDateInput(date)
      end = addDays(start, 1)
    } else {
      start = combineDateAndTime(date, startTime)
      end = combineDateAndTime(date, endTime)
    }
    if (end <= start) {
      setFormError('La hora de finalización debe ser posterior a la de inicio.')
      return
    }

    const payload = {
      title: isUnavailable
        ? reason === 'No disponible'
          ? 'No disponible'
          : `No disponible: ${reason === 'Otro' ? customReason.trim() : reason}`
        : title.trim(),
      description: isUnavailable ? '' : description.trim(),
      ...(isUnavailable
        ? participantFields([], [])
        : participantFields(
            // Se ignoran los ids de contactos que ya no existen.
            participantSelection.participantIds.map((id) => contacts.find((c) => c.id === id)).filter(Boolean),
            participantSelection.guests,
          )),
      meetLink: isUnavailable ? '' : meetLink.trim(),
      category: isUnavailable ? 'No disponible' : category,
      tags: isUnavailable ? [] : tags,
      isUnavailable,
      allDay: isUnavailable ? allDay : false,
      start,
      end,
      recurrence: repeatFreq ? { freq: repeatFreq, until: new Date(`${repeatUntil}T23:59:59`).toISOString() } : null,
    }

    await save(payload)
  }

  // Si la reunión incumple alguna regla por tipo, se muestra el aviso y se puede guardar igualmente.
  const save = async (payload, options) => {
    setSubmitting(true)
    setRuleWarning(null)
    try {
      await onSubmit(payload, options)
      onClose()
    } catch (err) {
      if (err instanceof RuleWarning) setRuleWarning({ violations: err.violations, payload })
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

          {!isUnavailable && (
            <label className="event-form-field">
              <span>Categoría</span>
              <select value={category} onChange={(e) => setCategory(e.target.value)}>
                {CATEGORY_OPTIONS.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </label>
          )}

          {!isUnavailable && (
            <div className="event-form-field">
              <span id="event-form-tags-label">Etiquetas (opcional)</span>
              <TagInput labelId="event-form-tags-label" value={tags} onChange={setTags} suggestions={tagSuggestions} />
            </div>
          )}

          {isUnavailable && (
            <label className="event-form-field">
              <span>Motivo</span>
              <select value={reason} onChange={(e) => setReason(e.target.value)}>
                {UNAVAILABLE_REASONS.map((r) => (
                  <option key={r} value={r}>
                    {r}
                  </option>
                ))}
              </select>
            </label>
          )}

          {isUnavailable && reason === 'Otro' && (
            <label className="event-form-field">
              <span>Especifica el motivo</span>
              <input type="text" value={customReason} onChange={(e) => setCustomReason(e.target.value)} placeholder="Motivo" />
            </label>
          )}

          {isUnavailable && (
            <label className="event-form-checkbox">
              <input type="checkbox" checked={allDay} onChange={(e) => setAllDay(e.target.checked)} />
              <span>Todo el día</span>
            </label>
          )}

          <label className="event-form-field">
            <span>Fecha</span>
            <input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          </label>

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

          <div className="event-form-row">
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
              />
            </div>
          )}

          {!isUnavailable && (
            <label className="event-form-field">
              <span>Enlace de la reunión (opcional)</span>
              <input
                type="text"
                value={meetLink}
                onChange={(e) => setMeetLink(e.target.value)}
                placeholder="https://meet.google.com/..."
              />
            </label>
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

          {ruleWarning && (
            <div className="event-form-warning" role="alert">
              <p className="event-form-warning-title">
                <TriangleAlert size={15} strokeWidth={1.75} />
                Esta reunión no cumple tus reglas
              </p>
              <ul>
                {ruleWarning.violations.map((v, i) => (
                  <li key={i}>{v.message}</li>
                ))}
              </ul>
              <div className="event-form-warning-actions">
                <button type="button" className="event-form-cancel" onClick={() => setRuleWarning(null)}>
                  Revisar
                </button>
                <button
                  type="button"
                  className="event-form-submit"
                  onClick={() => save(ruleWarning.payload, { ignoreRules: true })}
                  disabled={submitting}
                >
                  Guardar igualmente
                </button>
              </div>
            </div>
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
          initialMeetingType={{ category, tags }}
          initialParticipants={participantSelection}
          onPick={handleSlotPicked}
          onClose={() => setSlotFinderOpen(false)}
        />
      )}
    </div>
  )
}
