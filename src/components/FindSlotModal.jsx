import { useMemo, useState } from 'react'
import { format, addDays } from 'date-fns'
import { es } from 'date-fns/locale'
import { X, Search, CalendarClock, ListChecks, Send, ArrowLeft, CircleCheck } from 'lucide-react'
import TagInput from './TagInput.jsx'
import ParticipantPicker from './ParticipantPicker.jsx'
import ProposalShare from './ProposalShare.jsx'
import { MAX_OPTIONS, MIN_OPTIONS, proposalShareData } from '../lib/proposals'
import { explainNoSlots, findFirstSlot, findBestSlot, findMultipleSlots, rulesExceededByDuration } from '../lib/findSlots'
import { hasAvailability, slotLocalNotes } from '../lib/contactAvailability'
import { CATEGORY_OPTIONS } from '../lib/eventStyle'
import { describeRule, formatMinutes, ruleTargetLabel, rulesForType } from '../lib/rules'
import { allTags } from '../lib/tags'
import { useScheduling } from '../lib/schedulingContext'
import { scheduleSourceText } from '../lib/weeklyAvailability'
import './FindSlotModal.css'

function toDateInputValue(date) {
  return format(date, 'yyyy-MM-dd')
}

function ruleSummary(rule) {
  return `${rule.target}: ${describeRule(rule)}`
}

function firstName(contact) {
  return contact.name.split(' ')[0] || contact.name
}

// Hora local de los participantes de otras zonas y avisos de horas poco razonables para ellos.
function SlotNotes({ slot, people }) {
  const { times, warnings } = slotLocalNotes(slot.start, slot.end, people)
  return (
    <>
      {times.length > 0 && <span className="find-slot-result-zone">{times.join(' · ')}</span>}
      {warnings.length > 0 && <span className="find-slot-result-warning">{warnings.join(' · ')}</span>}
    </>
  )
}

const slotKey = (slot) => slot.start.toISOString()

function slotLabel(slot) {
  return `${format(slot.start, "EEEE d 'de' MMMM", { locale: es })} · ${format(slot.start, 'HH:mm')}–${format(slot.end, 'HH:mm')}`
}

export default function FindSlotModal({
  initialDurationMinutes,
  initialMeetingType,
  initialParticipants,
  onPick,
  onCreateProposal,
  onClose,
}) {
  const { rawEvents, preferences, workingHours, weeklyAvailability, rules, contacts, addContact } = useScheduling()
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
  const [participantSelection, setParticipantSelection] = useState(
    initialParticipants || { participantIds: [], guests: [] },
  )
  // Contactos cuya disponibilidad se ignora en esta búsqueda ("Ignorar la disponibilidad de Ana").
  const [ignoredIds, setIgnoredIds] = useState([])
  const [results, setResults] = useState(null)
  const [searchError, setSearchError] = useState(null)
  // Proponer varias opciones: 'search' → 'propose' (título, participantes, tipo) → 'share' (mensaje).
  const [step, setStep] = useState('search')
  const [picked, setPicked] = useState([])
  const [proposalTitle, setProposalTitle] = useState('')
  const [proposalError, setProposalError] = useState(null)
  const [created, setCreated] = useState(null)

  const tagSuggestions = useMemo(() => allTags(rawEvents), [rawEvents])
  const meetingType = category || tags.length ? { category: category || null, tags } : null
  const activeRules = meetingType ? rulesForType(rules, meetingType) : []
  const people = participantSelection.participantIds.map((id) => contacts.find((c) => c.id === id)).filter(Boolean)
  // ¿Alguna semana del rango tiene la disponibilidad declarada?
  const scheduleNote =
    fromDate && toDate && toDate >= fromDate
      ? scheduleSourceText(new Date(`${fromDate}T00:00:00`), new Date(`${toDate}T00:00:00`), weeklyAvailability)
      : null
  const constrainedBy = people.filter((c) => hasAvailability(c) && !ignoredIds.includes(c.id))

  const buildParams = (ignored = ignoredIds) => ({
    durationMinutes,
    fromDate: new Date(`${fromDate}T00:00:00`),
    toDate: new Date(`${toDate}T00:00:00`),
    minTime: minTime || '00:00',
    maxTime: maxTime || '24:00',
    events: rawEvents,
    workingHours,
    weeklyAvailability,
    bufferMinutes: preferences.bufferMinutes,
    rules,
    meetingType,
    participants: people.filter((c) => !ignored.includes(c.id)),
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
    return 'No hay huecos libres dentro de tu horario con esos criterios. Prueba con otras fechas o una duración menor.'
  }

  const runSearch = (mode, ignored = ignoredIds) => {
    setSearchError(null)
    if (minTime && maxTime && maxTime <= minTime) {
      setSearchError('La hora máxima debe ser posterior a la mínima.')
      setResults(null)
      return
    }
    const params = buildParams(ignored)
    let found
    if (mode === 'first') {
      const slot = findFirstSlot(params)
      found = slot ? [slot] : []
    } else if (mode === 'best') {
      const slot = findBestSlot(params)
      found = slot ? [slot] : []
    } else {
      found = findMultipleSlots(params, 8)
    }
    const explanation = found.length === 0 ? explainNoSlots(params) : null
    setResults({ mode, slots: found, empty: found.length === 0 ? emptyMessage() : null, explanation })
    setPicked([])
  }

  const togglePicked = (slot) => {
    const key = slotKey(slot)
    setPicked((prev) => (prev.includes(key) ? prev.filter((k) => k !== key) : prev.length >= MAX_OPTIONS ? prev : [...prev, key]))
  }

  const pickedSlots = results ? results.slots.filter((s) => picked.includes(slotKey(s))) : []
  const canPropose = !!onCreateProposal && results?.mode === 'multiple' && results.slots.length >= MIN_OPTIONS

  const handleCreateProposal = () => {
    if (!proposalTitle.trim()) {
      setProposalError('Ponle un título a la reunión.')
      return
    }
    const result = onCreateProposal({
      title: proposalTitle.trim(),
      durationMinutes,
      category: category || CATEGORY_OPTIONS[0],
      tags,
      participantIds: participantSelection.participantIds,
      guests: participantSelection.guests,
      slots: pickedSlots,
    })
    setCreated(result)
    setStep('share')
  }

  const ignoreAvailability = (contact) => {
    const next = [...ignoredIds, contact.id]
    setIgnoredIds(next)
    runSearch(results?.mode || 'multiple', next)
  }

  return (
    <div className="find-slot-backdrop" onClick={onClose}>
      <div className="find-slot-modal" onClick={(e) => e.stopPropagation()}>
        <div className="find-slot-header">
          <h2>
            {step === 'search' ? <Search size={17} strokeWidth={1.75} /> : <Send size={17} strokeWidth={1.75} />}
            {step === 'search' ? 'Buscar hueco' : step === 'propose' ? 'Proponer opciones' : 'Propuesta creada'}
          </h2>
          <button type="button" className="find-slot-close" onClick={onClose} aria-label="Cerrar">
            <X size={18} strokeWidth={1.75} />
          </button>
        </div>

        {step === 'propose' && (
          <div className="find-slot-body">
            <p className="find-slot-hint">
              Cada opción se guarda como reunión provisional: ocupa su hueco hasta que confirmes una o canceles la
              propuesta.
            </p>
            <ul className="find-slot-picked">
              {pickedSlots.map((slot) => (
                <li key={slotKey(slot)}>
                  <CalendarClock size={14} strokeWidth={1.75} />
                  <span className="find-slot-picked-text">
                    <span>{slotLabel(slot)}</span>
                    <SlotNotes slot={slot} people={people} />
                  </span>
                </li>
              ))}
            </ul>
            <label className="find-slot-field">
              <span>Título</span>
              <input
                type="text"
                value={proposalTitle}
                onChange={(e) => setProposalTitle(e.target.value)}
                placeholder="Reunión con..."
                autoFocus
              />
            </label>
            <div className="find-slot-field">
              <span id="find-slot-proposal-participants">Participantes</span>
              <ParticipantPicker
                labelId="find-slot-proposal-participants"
                contacts={contacts}
                participantIds={participantSelection.participantIds}
                guests={participantSelection.guests}
                onChange={setParticipantSelection}
                onCreateContact={addContact}
              />
            </div>
            <div className="find-slot-row">
              <label className="find-slot-field">
                <span>Categoría</span>
                <select value={category || CATEGORY_OPTIONS[0]} onChange={(e) => setCategory(e.target.value)}>
                  {CATEGORY_OPTIONS.map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            <div className="find-slot-field">
              <span id="find-slot-proposal-tags">Etiquetas</span>
              <TagInput labelId="find-slot-proposal-tags" value={tags} onChange={setTags} suggestions={tagSuggestions} />
            </div>
            {proposalError && <div className="find-slot-error">{proposalError}</div>}
            <div className="find-slot-actions">
              <button type="button" className="find-slot-action-btn" onClick={() => setStep('search')}>
                <ArrowLeft size={14} strokeWidth={1.75} /> Volver
              </button>
              <button type="button" className="find-slot-action-btn primary" onClick={handleCreateProposal}>
                Crear propuesta
              </button>
            </div>
          </div>
        )}

        {step === 'share' && created && (
          <div className="find-slot-body">
            <p className="find-slot-success">
              <CircleCheck size={16} strokeWidth={1.75} />
              Has reservado {created.options.length} opciones provisionales para «{created.proposal.title}». Envía el
              mensaje y, cuando te respondan, confirma la opción elegida desde "Propuestas pendientes".
            </p>
            <ProposalShare {...proposalShareData(created.proposal, created.options, contacts)} />
            <div className="find-slot-actions">
              <button type="button" className="find-slot-action-btn primary" onClick={onClose}>
                Hecho
              </button>
            </div>
          </div>
        )}

        <div className="find-slot-body" hidden={step !== 'search'}>
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

          <div className="find-slot-field">
            <span id="find-slot-participants-label">Participantes (opcional)</span>
            <ParticipantPicker
              labelId="find-slot-participants-label"
              contacts={contacts}
              participantIds={participantSelection.participantIds}
              guests={participantSelection.guests}
              onChange={setParticipantSelection}
              onCreateContact={addContact}
            />
            {constrainedBy.length > 0 && (
              <p className="find-slot-note">
                Se tiene en cuenta la disponibilidad de {constrainedBy.map(firstName).join(', ')}.
              </p>
            )}
            {ignoredIds.length > 0 && (
              <p className="find-slot-note">
                Ignorando la disponibilidad de{' '}
                {people.filter((c) => ignoredIds.includes(c.id)).map(firstName).join(', ')}.{' '}
                <button type="button" className="find-slot-link" onClick={() => setIgnoredIds([])}>
                  Volver a tenerla en cuenta
                </button>
              </p>
            )}
          </div>

          {scheduleNote && <p className="find-slot-schedule-note">{scheduleNote}</p>}

          <p className="find-slot-hint">
            Solo se proponen huecos dentro de tu horario{scheduleNote ? '' : ' habitual'}
            {preferences.bufferMinutes > 0 ? `, dejando ${preferences.bufferMinutes} min de margen entre reuniones` : ''}
            {activeRules.length > 0 ? ' y cumpliendo las reglas de este tipo de reunión' : ''}. Puedes cambiarlo en
            "Horario y preferencias" o en "Disponibilidad de la semana".
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
                results.explanation?.blockers.length > 0 || results.explanation?.combined ? (
                  <div className="find-slot-blockers">
                    {results.explanation.blockers.map(({ contact, message }) => (
                      <div key={contact.id} className="find-slot-blocker">
                        <p>{message}</p>
                        <button type="button" className="find-slot-action-btn" onClick={() => ignoreAvailability(contact)}>
                          Ignorar la disponibilidad de {firstName(contact)}
                        </button>
                      </div>
                    ))}
                    {results.explanation.combined && (
                      <div className="find-slot-blocker">
                        <p>No hay ningún momento en que podáis todos a la vez. Prueba a ignorar la disponibilidad de alguien:</p>
                        {constrainedBy.map((contact) => (
                          <button key={contact.id} type="button" className="find-slot-action-btn" onClick={() => ignoreAvailability(contact)}>
                            Ignorar la disponibilidad de {firstName(contact)}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                ) : (
                  <p className="find-slot-empty">{results.empty}</p>
                )
              ) : (
                <ul>
                  {results.slots.map((slot) => (
                    <li key={slot.start.toISOString()} className={canPropose ? 'selectable' : ''}>
                      {canPropose && (
                        <label className="find-slot-pick" title="Marcar para proponer">
                          <input
                            type="checkbox"
                            checked={picked.includes(slotKey(slot))}
                            onChange={() => togglePicked(slot)}
                            disabled={!picked.includes(slotKey(slot)) && picked.length >= MAX_OPTIONS}
                            aria-label={`Proponer ${slotLabel(slot)}`}
                          />
                        </label>
                      )}
                      <button
                        type="button"
                        className="find-slot-result-btn"
                        onClick={() => onPick(slot, meetingType, participantSelection)}
                      >
                        <CalendarClock size={15} strokeWidth={1.75} />
                        <span className="find-slot-result-main">
                          <span className="find-slot-result-text">
                            {format(slot.start, "EEEE d 'de' MMMM", { locale: es })}
                            {' · '}
                            {format(slot.start, 'HH:mm')}–{format(slot.end, 'HH:mm')}
                          </span>
                          <SlotNotes slot={slot} people={people} />
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
              {canPropose && (
                <div className="find-slot-propose-bar">
                  <span>
                    {picked.length < MIN_OPTIONS
                      ? `Marca de ${MIN_OPTIONS} a ${MAX_OPTIONS} huecos para proponerlos a alguien.`
                      : `${picked.length} opciones marcadas.`}
                  </span>
                  <button
                    type="button"
                    className="find-slot-action-btn primary"
                    disabled={picked.length < MIN_OPTIONS}
                    onClick={() => {
                      setProposalError(null)
                      setStep('propose')
                    }}
                  >
                    <Send size={14} strokeWidth={1.75} /> Proponer estas opciones
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
