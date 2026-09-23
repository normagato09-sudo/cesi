import { useMemo, useState } from 'react'
import { format, addDays } from 'date-fns'
import { es } from 'date-fns/locale'
import { X, Search, CalendarClock, ListChecks } from 'lucide-react'
import TagInput from './TagInput.jsx'
import { findFirstSlot, findBestSlot, findMultipleSlots, rulesExceededByDuration } from '../lib/findSlots'
import { CATEGORY_OPTIONS } from '../lib/eventStyle'
import { describeRule, formatMinutes, ruleTargetLabel, rulesForType } from '../lib/rules'
import { allTags } from '../lib/tags'
import { useScheduling } from '../lib/schedulingContext'
import './FindSlotModal.css'

function toDateInputValue(date) {
  return format(date, 'yyyy-MM-dd')
}

function ruleSummary(rule) {
  return `${rule.target}: ${describeRule(rule)}`
}

export default function FindSlotModal({ initialDurationMinutes, initialMeetingType, onPick, onClose }) {
  const { rawEvents, preferences, workingHours, rules } = useScheduling()
  const now = new Date()
  const [durationMinutes, setDurationMinutes] = useState(initialDurationMinutes || 60)
  const [fromDate, setFromDate] = useState(toDateInputValue(now))
  const [toDate, setToDate] = useState(toDateInputValue(addDays(now, 7)))
  // Filtro horario opcional, además del horario habitual.
  const [minTime, setMinTime] = useState('')
  const [maxTime, setMaxTime] = useState('')
  // Tipo de reunión: activa las reglas de esa categoría y etiquetas.
  const [category, setCategory] = useState(initialMeetingType?.category || '')
  const [tags, setTags] = useState(initialMeetingType?.tags || [])
  const [results, setResults] = useState(null)
  const [searchError, setSearchError] = useState(null)

  const tagSuggestions = useMemo(() => allTags(rawEvents), [rawEvents])
  const meetingType = category || tags.length ? { category: category || null, tags } : null
  const activeRules = meetingType ? rulesForType(rules, meetingType) : []

  const buildParams = () => ({
    durationMinutes,
    fromDate: new Date(`${fromDate}T00:00:00`),
    toDate: new Date(`${toDate}T00:00:00`),
    minTime: minTime || '00:00',
    maxTime: maxTime || '24:00',
    events: rawEvents,
    workingHours,
    bufferMinutes: preferences.bufferMinutes,
    rules,
    meetingType,
    now,
  })

  const emptyMessage = () => {
    const tooLong = rulesExceededByDuration(activeRules, meetingType, durationMinutes)
    if (tooLong.length > 0) {
      return tooLong
        .map((r) => `Las reuniones ${ruleTargetLabel(r)} duran como máximo ${formatMinutes(r.maxDurationMinutes)}. Reduce la duración.`)
        .join(' ')
    }
    if (activeRules.length > 0) {
      return 'No hay huecos libres dentro de tu horario que cumplan las reglas de este tipo de reunión. Prueba con otras fechas.'
    }
    return 'No hay huecos libres dentro de tu horario habitual con esos criterios. Prueba con otras fechas o una duración menor.'
  }

  const runSearch = (mode) => {
    setSearchError(null)
    if (minTime && maxTime && maxTime <= minTime) {
      setSearchError('La hora máxima debe ser posterior a la mínima.')
      setResults(null)
      return
    }
    const params = buildParams()
    let found
    if (mode === 'first') {
      const slot = findFirstSlot(params)
      found = slot ? [slot] : []
    } else if (mode === 'best') {
      const slot = findBestSlot(params)
      found = slot ? [slot] : []
    } else {
      found = findMultipleSlots(params, 5)
    }
    setResults({ mode, slots: found, empty: found.length === 0 ? emptyMessage() : null })
  }

  return (
    <div className="find-slot-backdrop" onClick={onClose}>
      <div className="find-slot-modal" onClick={(e) => e.stopPropagation()}>
        <div className="find-slot-header">
          <h2>
            <Search size={17} strokeWidth={1.75} />
            Buscar hueco
          </h2>
          <button type="button" className="find-slot-close" onClick={onClose} aria-label="Cerrar">
            <X size={18} strokeWidth={1.75} />
          </button>
        </div>

        <div className="find-slot-body">
          <label className="find-slot-field">
            <span>Duración necesaria</span>
            <select value={durationMinutes} onChange={(e) => setDurationMinutes(Number(e.target.value))}>
              <option value={30}>30 minutos</option>
              <option value={45}>45 minutos</option>
              <option value={60}>1 hora</option>
              <option value={90}>1 hora 30 minutos</option>
              <option value={120}>2 horas</option>
            </select>
          </label>

          <div className="find-slot-row">
            <label className="find-slot-field">
              <span>Desde</span>
              <input type="date" value={fromDate} onChange={(e) => setFromDate(e.target.value)} />
            </label>
            <label className="find-slot-field">
              <span>Hasta</span>
              <input type="date" value={toDate} min={fromDate} onChange={(e) => setToDate(e.target.value)} />
            </label>
          </div>

          <div className="find-slot-row">
            <label className="find-slot-field">
              <span>Solo desde (opcional)</span>
              <input type="time" value={minTime} onChange={(e) => setMinTime(e.target.value)} />
            </label>
            <label className="find-slot-field">
              <span>Hasta (opcional)</span>
              <input type="time" value={maxTime} onChange={(e) => setMaxTime(e.target.value)} />
            </label>
          </div>

          <fieldset className="find-slot-type">
            <legend>Tipo de reunión (opcional)</legend>
            <label className="find-slot-field">
              <span>Categoría</span>
              <select value={category} onChange={(e) => setCategory(e.target.value)}>
                <option value="">Sin especificar</option>
                {CATEGORY_OPTIONS.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </label>
            <div className="find-slot-field">
              <span id="find-slot-tags-label">Etiquetas</span>
              <TagInput labelId="find-slot-tags-label" value={tags} onChange={setTags} suggestions={tagSuggestions} />
            </div>
            {activeRules.length > 0 && (
              <ul className="find-slot-rules">
                {activeRules.map((r) => (
                  <li key={r.id}>
                    <ListChecks size={13} strokeWidth={1.75} />
                    Regla: {ruleSummary(r)}
                  </li>
                ))}
              </ul>
            )}
          </fieldset>

          <p className="find-slot-hint">
            Solo se proponen huecos dentro de tu horario habitual
            {preferences.bufferMinutes > 0 ? `, dejando ${preferences.bufferMinutes} min de margen entre reuniones` : ''}
            {activeRules.length > 0 ? ' y cumpliendo las reglas de este tipo de reunión' : ''}. Puedes cambiarlo en
            "Horario y preferencias".
          </p>

          {searchError && <div className="find-slot-error">{searchError}</div>}

          <div className="find-slot-actions">
            <button type="button" className="find-slot-action-btn" onClick={() => runSearch('first')}>
              Primer hueco
            </button>
            <button type="button" className="find-slot-action-btn primary" onClick={() => runSearch('best')}>
              Mejor hueco
            </button>
            <button type="button" className="find-slot-action-btn" onClick={() => runSearch('multiple')}>
              Varios huecos
            </button>
          </div>

          {results && (
            <div className="find-slot-results">
              {results.slots.length === 0 ? (
                <p className="find-slot-empty">{results.empty}</p>
              ) : (
                <ul>
                  {results.slots.map((slot) => (
                    <li key={slot.start.toISOString()}>
                      <button type="button" className="find-slot-result-btn" onClick={() => onPick(slot, meetingType)}>
                        <CalendarClock size={15} strokeWidth={1.75} />
                        <span className="find-slot-result-main">
                          <span className="find-slot-result-text">
                            {format(slot.start, "EEEE d 'de' MMMM", { locale: es })}
                            {' · '}
                            {format(slot.start, 'HH:mm')}–{format(slot.end, 'HH:mm')}
                          </span>
                          {slot.rules?.length > 0 && (
                            <span className="find-slot-result-rule">
                              Cumple: {slot.rules.map((r) => `regla de «${r.target}»`).join(', ')}
                            </span>
                          )}
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
