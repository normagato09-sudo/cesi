import { useState } from 'react'
import { Pencil, Plus, Trash2 } from 'lucide-react'
import { CATEGORY_OPTIONS } from '../lib/eventStyle'
import { ALL_DAYS, TIME_OF_DAY_LABELS, describeRule, formatMinutes, newRule, validateRule } from '../lib/rules'
import { makeId } from '../lib/store'
import { normalizeTag, sameTag } from '../lib/tags'
import './RulesEditor.css'

const DAY_BUTTONS = [
  { day: 1, short: 'L', label: 'lunes' },
  { day: 2, short: 'M', label: 'martes' },
  { day: 3, short: 'X', label: 'miércoles' },
  { day: 4, short: 'J', label: 'jueves' },
  { day: 5, short: 'V', label: 'viernes' },
  { day: 6, short: 'S', label: 'sábado' },
  { day: 0, short: 'D', label: 'domingo' },
]
const DURATIONS = [30, 45, 60, 90, 120]
const PER_DAY = [1, 2, 3, 4, 5, 6]
const NEW_TAG = '__new_tag'

function targetKey(rule) {
  return rule.target ? `${rule.targetType}:${rule.target}` : ''
}

function RuleForm({ initial, tags, onCancel, onSave }) {
  const [rule, setRule] = useState(initial)
  const [newTag, setNewTag] = useState('')
  const [choosingNewTag, setChoosingNewTag] = useState(false)
  const [error, setError] = useState(null)
  const update = (patch) => setRule((r) => ({ ...r, ...patch }))

  const knownTags = rule.targetType === 'tag' && rule.target && !tags.some((t) => sameTag(t, rule.target)) ? [...tags, rule.target] : tags

  const handleTarget = (value) => {
    if (value === NEW_TAG) {
      setChoosingNewTag(true)
      update({ targetType: 'tag', target: '' })
      return
    }
    setChoosingNewTag(false)
    const [type, ...rest] = value.split(':')
    update({ targetType: type, target: rest.join(':') })
  }

  const toggleDay = (day) =>
    setRule((r) => ({ ...r, days: r.days.includes(day) ? r.days.filter((d) => d !== day) : [...r.days, day].sort() }))

  const handleSave = () => {
    const final = choosingNewTag ? { ...rule, targetType: 'tag', target: normalizeTag(newTag) } : rule
    const problem = validateRule(final)
    if (problem) {
      setError(problem)
      return
    }
    onSave(final)
  }

  return (
    <div className="rule-form">
      <label className="rule-field">
        <span>Se aplica a</span>
        <select value={choosingNewTag ? NEW_TAG : targetKey(rule)} onChange={(e) => handleTarget(e.target.value)}>
          <option value="" disabled>
            Elige una categoría o etiqueta
          </option>
          <optgroup label="Categorías">
            {CATEGORY_OPTIONS.map((c) => (
              <option key={c} value={`category:${c}`}>
                {c}
              </option>
            ))}
          </optgroup>
          <optgroup label="Etiquetas">
            {knownTags.map((t) => (
              <option key={t} value={`tag:${t}`}>
                {t}
              </option>
            ))}
            <option value={NEW_TAG}>Otra etiqueta…</option>
          </optgroup>
        </select>
      </label>
      {choosingNewTag && (
        <label className="rule-field">
          <span>Nombre de la etiqueta</span>
          <input type="text" value={newTag} onChange={(e) => setNewTag(e.target.value)} placeholder="entrevista" autoFocus />
        </label>
      )}

      <div className="rule-field">
        <span id="rule-days-label">Días permitidos</span>
        <div className="rule-days" role="group" aria-labelledby="rule-days-label">
          {DAY_BUTTONS.map(({ day, short, label }) => (
            <button
              key={day}
              type="button"
              className={rule.days.includes(day) ? 'on' : ''}
              aria-pressed={rule.days.includes(day)}
              aria-label={label}
              title={label}
              onClick={() => toggleDay(day)}
            >
              {short}
            </button>
          ))}
        </div>
      </div>

      <label className="rule-field">
        <span>Momento del día</span>
        <select value={rule.timeOfDay} onChange={(e) => update({ timeOfDay: e.target.value })}>
          {Object.entries(TIME_OF_DAY_LABELS).map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>
      </label>
      {rule.timeOfDay === 'custom' && (
        <div className="rule-row">
          <label className="rule-field">
            <span>Desde</span>
            <input type="time" value={rule.customStart} onChange={(e) => update({ customStart: e.target.value })} />
          </label>
          <label className="rule-field">
            <span>Hasta</span>
            <input type="time" value={rule.customEnd} onChange={(e) => update({ customEnd: e.target.value })} />
          </label>
        </div>
      )}
      <p className="rule-note">Siempre dentro de tu horario habitual.</p>

      <div className="rule-row">
        <label className="rule-field">
          <span>Duración máxima</span>
          <select
            value={rule.maxDurationMinutes ?? ''}
            onChange={(e) => update({ maxDurationMinutes: e.target.value ? Number(e.target.value) : null })}
          >
            <option value="">Sin límite</option>
            {DURATIONS.map((m) => (
              <option key={m} value={m}>
                {formatMinutes(m)}
              </option>
            ))}
          </select>
        </label>
        <label className="rule-field">
          <span>Máximo por día</span>
          <select
            value={rule.maxPerDay ?? ''}
            onChange={(e) => update({ maxPerDay: e.target.value ? Number(e.target.value) : null })}
          >
            <option value="">Sin límite</option>
            {PER_DAY.map((n) => (
              <option key={n} value={n}>
                {n} {n === 1 ? 'reunión' : 'reuniones'}
              </option>
            ))}
          </select>
        </label>
      </div>

      {error && <div className="rule-error">{error}</div>}

      <div className="rule-form-actions">
        <button type="button" className="rule-btn" onClick={onCancel}>
          Cancelar
        </button>
        <button type="button" className="rule-btn primary" onClick={handleSave}>
          Guardar regla
        </button>
      </div>
    </div>
  )
}

// Lista editable de reglas por tipo de reunión (se guardan con el resto de "Horario y preferencias").
export default function RulesEditor({ rules, onChange, tags }) {
  const [editing, setEditing] = useState(null) // id de la regla o 'new'

  const saveRule = (rule) => {
    if (editing === 'new') {
      const now = new Date().toISOString()
      onChange([...rules, { ...rule, id: makeId('rule'), createdAt: now, updatedAt: now }])
    } else {
      onChange(rules.map((r) => (r.id === editing ? { ...rule, updatedAt: new Date().toISOString() } : r)))
    }
    setEditing(null)
  }

  const removeRule = (rule) => {
    if (!window.confirm(`¿Borrar la regla de ${rule.targetType === 'category' ? 'la categoría' : 'la etiqueta'} «${rule.target}»?`)) return
    onChange(rules.filter((r) => r.id !== rule.id))
  }

  const toggleRule = (rule) => onChange(rules.map((r) => (r.id === rule.id ? { ...r, enabled: !r.enabled } : r)))

  return (
    <div className="rules-editor">
      {rules.length === 0 && editing !== 'new' && (
        <p className="rules-empty">
          Aún no tienes reglas. Por ejemplo: las entrevistas solo por la mañana, como máximo 1 hora y 2 al día.
        </p>
      )}

      <ul className="rules-list">
        {rules.map((rule) =>
          editing === rule.id ? (
            <li key={rule.id}>
              <RuleForm initial={rule} tags={tags} onCancel={() => setEditing(null)} onSave={saveRule} />
            </li>
          ) : (
            <li key={rule.id} className={`rule-item${rule.enabled ? '' : ' off'}`}>
              <label className="rule-switch" title={rule.enabled ? 'Desactivar regla' : 'Activar regla'}>
                <input
                  type="checkbox"
                  role="switch"
                  checked={rule.enabled}
                  onChange={() => toggleRule(rule)}
                  aria-label={`Regla de «${rule.target}» ${rule.enabled ? 'activada' : 'desactivada'}`}
                />
                <span aria-hidden="true" />
              </label>
              <div className="rule-item-text">
                <span className="rule-item-target">
                  {rule.target}
                  <small>{rule.targetType === 'category' ? 'Categoría' : 'Etiqueta'}</small>
                </span>
                <span className="rule-item-summary">{describeRule(rule)}</span>
              </div>
              <button type="button" className="rule-icon-btn" onClick={() => setEditing(rule.id)} aria-label={`Editar la regla de «${rule.target}»`}>
                <Pencil size={14} strokeWidth={1.75} />
              </button>
              <button type="button" className="rule-icon-btn danger" onClick={() => removeRule(rule)} aria-label={`Borrar la regla de «${rule.target}»`}>
                <Trash2 size={14} strokeWidth={1.75} />
              </button>
            </li>
          ),
        )}
      </ul>

      {editing === 'new' ? (
        <RuleForm initial={newRule({ days: [...ALL_DAYS] })} tags={tags} onCancel={() => setEditing(null)} onSave={saveRule} />
      ) : (
        <button type="button" className="rules-add" onClick={() => setEditing('new')} disabled={editing !== null}>
          <Plus size={14} strokeWidth={2} />
          Nueva regla
        </button>
      )}
    </div>
  )
}
