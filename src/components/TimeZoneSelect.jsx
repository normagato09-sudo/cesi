import { useEffect, useId, useMemo, useRef, useState } from 'react'
import { Check, ChevronDown, Search } from 'lucide-react'
import { COUNTRIES } from '../lib/countries'
import { findCountry } from '../lib/timezones'
import './TimeZoneSelect.css'

function normalize(text) {
  return (text || '')
    .toLocaleLowerCase('es')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
}

// Lista desplegable de países con buscador.
function CountryCombobox({ labelId, value, onChange, allowEmpty, emptyLabel }) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [active, setActive] = useState(0)
  const rootRef = useRef(null)
  const searchRef = useRef(null)
  const listRef = useRef(null)
  const baseId = useId()
  const listboxId = `${baseId}-list`

  const options = useMemo(() => {
    const q = normalize(query)
    const list = COUNTRIES.filter(
      (c) => !q || normalize(c.name).includes(q) || c.zones.some((z) => normalize(z.place).includes(q)) || c.code.toLowerCase() === q,
    )
    return allowEmpty && !q ? [null, ...list] : list
  }, [query, allowEmpty])

  const safeActive = Math.min(active, Math.max(options.length - 1, 0))
  const selected = value ? findCountry(value) : null

  useEffect(() => {
    if (!open) return
    const onPointerDown = (e) => {
      if (rootRef.current && !rootRef.current.contains(e.target)) setOpen(false)
    }
    document.addEventListener('pointerdown', onPointerDown)
    return () => document.removeEventListener('pointerdown', onPointerDown)
  }, [open])

  useEffect(() => {
    if (open) searchRef.current?.focus()
  }, [open])

  useEffect(() => {
    if (!open || !listRef.current) return
    listRef.current.querySelector(`[data-index="${safeActive}"]`)?.scrollIntoView({ block: 'nearest' })
  }, [open, safeActive])

  const openList = () => {
    const idx = options.findIndex((c) => (c ? c.code : null) === (value || null))
    setQuery('')
    setActive(Math.max(idx, 0))
    setOpen(true)
  }

  const choose = (country) => {
    onChange(country ? country.code : null)
    setOpen(false)
    setQuery('')
  }

  const handleKeyDown = (e) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setActive(options.length ? (safeActive + 1) % options.length : 0)
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setActive(options.length ? (safeActive - 1 + options.length) % options.length : 0)
    } else if (e.key === 'Enter') {
      e.preventDefault()
      if (options[safeActive] !== undefined) choose(options[safeActive])
    } else if (e.key === 'Escape') {
      e.preventDefault()
      e.stopPropagation()
      setOpen(false)
    }
  }

  return (
    <div className="tz-country" ref={rootRef}>
      <button
        type="button"
        className="tz-country-button"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-labelledby={labelId ? `${labelId} ${baseId}-value` : undefined}
        onClick={() => (open ? setOpen(false) : openList())}
      >
        <span id={`${baseId}-value`} className={selected ? '' : 'tz-placeholder'}>{selected ? selected.name : emptyLabel}</span>
        <ChevronDown size={16} strokeWidth={1.75} />
      </button>

      {open && (
        <div className="tz-country-panel">
          <label className="tz-country-search">
            <Search size={14} strokeWidth={1.75} />
            <input
              ref={searchRef}
              type="text"
              role="combobox"
              aria-expanded="true"
              aria-controls={listboxId}
              aria-autocomplete="list"
              aria-activedescendant={options.length ? `${baseId}-opt-${safeActive}` : undefined}
              aria-label="Buscar país o ciudad"
              placeholder="Buscar país o ciudad..."
              value={query}
              onChange={(e) => {
                setQuery(e.target.value)
                setActive(0)
              }}
              onKeyDown={handleKeyDown}
              autoComplete="off"
            />
          </label>
          <ul className="tz-country-list" role="listbox" id={listboxId} ref={listRef}>
            {options.length === 0 && (
              <li className="tz-country-empty" role="presentation">
                No hay ningún país que coincida.
              </li>
            )}
            {options.map((country, index) => {
              const isSelected = (country ? country.code : null) === (value || null)
              return (
                <li
                  key={country ? country.code : '__none'}
                  id={`${baseId}-opt-${index}`}
                  data-index={index}
                  role="option"
                  aria-selected={isSelected}
                  className={`tz-country-option${index === safeActive ? ' active' : ''}`}
                  onMouseDown={(e) => e.preventDefault()}
                  onMouseEnter={() => setActive(index)}
                  onClick={() => choose(country)}
                >
                  <span>{country ? country.name : emptyLabel}</span>
                  {country && country.zones.length > 1 && (
                    <span className="tz-country-zones">{country.zones.length} zonas</span>
                  )}
                  {isSelected && <Check size={14} strokeWidth={2} />}
                </li>
              )
            })}
          </ul>
        </div>
      )}
    </div>
  )
}

/**
 * Selector de país y zona horaria. value = { country, timeZone } (o null si allowEmpty).
 * Si el país tiene varias zonas aparece un segundo desplegable con las ciudades.
 */
export default function TimeZoneSelect({
  label,
  value,
  onChange,
  allowEmpty = false,
  emptyLabel = 'Sin país',
  requireZoneChoice = false,
}) {
  const labelId = useId()
  const country = value?.country ? findCountry(value.country) : null

  // Con requireZoneChoice, al elegir un país con varias zonas hay que escoger la ciudad a mano.
  const handleCountry = (code) => {
    if (!code) {
      onChange(null)
      return
    }
    const next = findCountry(code)
    const timeZone = requireZoneChoice && next.zones.length > 1 ? '' : next.zones[0].id
    onChange({ country: code, timeZone })
  }

  return (
    <div className="tz-select">
      {label && (
        <span className="tz-select-label" id={labelId}>
          {label}
        </span>
      )}
      <CountryCombobox
        labelId={label ? labelId : undefined}
        value={value?.country || null}
        onChange={handleCountry}
        allowEmpty={allowEmpty}
        emptyLabel={emptyLabel}
      />
      {country && country.zones.length > 1 && (
        <select
          className={`tz-zone-select${value.timeZone ? '' : ' missing'}`}
          aria-label={`Zona horaria de ${country.name}`}
          aria-invalid={!value.timeZone}
          value={value.timeZone}
          onChange={(e) => onChange({ country: country.code, timeZone: e.target.value })}
        >
          {!value.timeZone && (
            <option value="" disabled>
              Elige la ciudad o zona horaria
            </option>
          )}
          {country.zones.map((z) => (
            <option key={z.id} value={z.id}>
              {country.code === 'ES' ? z.label : z.place}
            </option>
          ))}
        </select>
      )}
    </div>
  )
}

