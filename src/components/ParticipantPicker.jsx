import { useEffect, useId, useMemo, useRef, useState } from 'react'
import { Check, ChevronDown, UserPlus, UserRound, X } from 'lucide-react'
import ContactAvatar from './ContactAvatar.jsx'
import { contactDataFromText, contactMatches } from '../lib/contacts'
import './ParticipantPicker.css'

function sameText(a, b) {
  return (a || '').trim().toLocaleLowerCase('es') === (b || '').trim().toLocaleLowerCase('es')
}

// Combobox multiselección de participantes: contactos (por id) e invitados sueltos (texto).
export default function ParticipantPicker({ labelId, contacts, participantIds, guests, onChange, onCreateContact }) {
  const [query, setQuery] = useState('')
  const [open, setOpen] = useState(false)
  const [activeIndex, setActiveIndex] = useState(0)
  const rootRef = useRef(null)
  const inputRef = useRef(null)
  const listRef = useRef(null)
  const baseId = useId()
  const listboxId = `${baseId}-listbox`

  const byId = useMemo(() => new Map(contacts.map((c) => [c.id, c])), [contacts])
  const selectedContacts = participantIds.map((id) => byId.get(id)).filter(Boolean)
  const trimmed = query.trim()

  const options = useMemo(() => {
    const list = contacts
      .filter((c) => contactMatches(c, trimmed))
      .map((c) => ({ type: 'contact', key: c.id, contact: c }))
    const exact = contacts.some((c) => sameText(c.name, trimmed) || (c.email && sameText(c.email, trimmed)))
    if (trimmed && !exact) {
      list.push({ type: 'create', key: '__create' })
      if (!guests.some((g) => sameText(g, trimmed))) list.push({ type: 'guest', key: '__guest' })
    }
    return list
  }, [contacts, trimmed, guests])

  const safeActive = Math.min(activeIndex, Math.max(options.length - 1, 0))

  useEffect(() => {
    if (!open) return
    const handlePointerDown = (e) => {
      if (rootRef.current && !rootRef.current.contains(e.target)) setOpen(false)
    }
    document.addEventListener('pointerdown', handlePointerDown)
    return () => document.removeEventListener('pointerdown', handlePointerDown)
  }, [open])

  useEffect(() => {
    if (!open || !listRef.current) return
    const el = listRef.current.querySelector(`[data-index="${safeActive}"]`)
    el?.scrollIntoView({ block: 'nearest' })
  }, [open, safeActive])

  const emit = (ids, guestList) => onChange({ participantIds: ids, guests: guestList })

  const toggleContact = (contact) => {
    if (participantIds.includes(contact.id)) {
      emit(participantIds.filter((id) => id !== contact.id), guests)
    } else {
      emit([...participantIds, contact.id], guests)
    }
  }

  const removeGuest = (guest) => emit(participantIds, guests.filter((g) => g !== guest))

  const chooseOption = (option) => {
    if (!option) return
    if (option.type === 'contact') {
      toggleContact(option.contact)
      return
    }
    if (option.type === 'create') {
      const created = onCreateContact(contactDataFromText(trimmed))
      emit([...participantIds, created.id], guests)
    } else if (option.type === 'guest') {
      emit(participantIds, [...guests, trimmed])
    }
    setQuery('')
    setActiveIndex(0)
  }

  const removeLastChip = () => {
    if (guests.length > 0) {
      emit(participantIds, guests.slice(0, -1))
    } else if (selectedContacts.length > 0) {
      const last = selectedContacts[selectedContacts.length - 1]
      emit(participantIds.filter((id) => id !== last.id), guests)
    }
  }

  const handleKeyDown = (e) => {
    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault()
        if (!open) setOpen(true)
        else setActiveIndex(options.length ? (safeActive + 1) % options.length : 0)
        break
      case 'ArrowUp':
        e.preventDefault()
        if (!open) setOpen(true)
        else setActiveIndex(options.length ? (safeActive - 1 + options.length) % options.length : 0)
        break
      case 'Enter':
        // Nunca enviar el formulario desde este input.
        e.preventDefault()
        if (open) chooseOption(options[safeActive])
        else setOpen(true)
        break
      case 'Escape':
        if (open) {
          e.preventDefault()
          e.stopPropagation()
          setOpen(false)
        }
        break
      case 'Backspace':
        if (query === '') removeLastChip()
        break
      default:
    }
  }

  const activeOption = open ? options[safeActive] : null

  return (
    <div className={`participant-picker${open ? ' open' : ''}`} ref={rootRef}>
      <div className="participant-picker-control" onClick={() => inputRef.current?.focus()}>
        {selectedContacts.map((c) => (
          <span key={c.id} className="participant-chip">
            <ContactAvatar name={c.name} size="xs" />
            <span className="participant-chip-name">{c.name}</span>
            <button
              type="button"
              className="participant-chip-remove"
              onClick={(e) => {
                e.stopPropagation()
                toggleContact(c)
              }}
              aria-label={`Quitar a ${c.name}`}
            >
              <X size={12} strokeWidth={2} />
            </button>
          </span>
        ))}
        {guests.map((g) => (
          <span key={`guest-${g}`} className="participant-chip guest" title="Invitado solo en esta reunión">
            <span className="participant-chip-guest-icon" aria-hidden="true">
              <UserRound size={12} strokeWidth={1.75} />
            </span>
            <span className="participant-chip-name">{g}</span>
            <button
              type="button"
              className="participant-chip-remove"
              onClick={(e) => {
                e.stopPropagation()
                removeGuest(g)
              }}
              aria-label={`Quitar a ${g}`}
            >
              <X size={12} strokeWidth={2} />
            </button>
          </span>
        ))}

        <input
          ref={inputRef}
          type="text"
          className="participant-picker-input"
          role="combobox"
          aria-labelledby={labelId}
          aria-expanded={open}
          aria-controls={listboxId}
          aria-autocomplete="list"
          aria-activedescendant={activeOption ? `${baseId}-opt-${safeActive}` : undefined}
          value={query}
          onChange={(e) => {
            setQuery(e.target.value)
            setActiveIndex(0)
            setOpen(true)
          }}
          onFocus={() => setOpen(true)}
          onBlur={(e) => {
            if (!rootRef.current?.contains(e.relatedTarget)) setOpen(false)
          }}
          onKeyDown={handleKeyDown}
          placeholder={selectedContacts.length || guests.length ? '' : 'Buscar o añadir participantes...'}
          autoComplete="off"
        />

        <button
          type="button"
          className="participant-picker-toggle"
          onClick={(e) => {
            e.stopPropagation()
            setOpen((o) => !o)
            inputRef.current?.focus()
          }}
          aria-label={open ? 'Cerrar lista de contactos' : 'Abrir lista de contactos'}
          tabIndex={-1}
        >
          <ChevronDown size={16} strokeWidth={1.75} />
        </button>
      </div>

      {open && (
        <ul className="participant-picker-list" id={listboxId} role="listbox" aria-multiselectable="true" ref={listRef}>
          {contacts.length === 0 && !trimmed && (
            <li className="participant-picker-hint" role="presentation">
              Todavía no tienes contactos. Escribe un nombre o un email para crear el primero.
            </li>
          )}
          {contacts.length > 0 && options.length === 0 && (
            <li className="participant-picker-hint" role="presentation">
              No hay contactos que coincidan.
            </li>
          )}
          {options.map((option, index) => {
            const isActive = index === safeActive
            const common = {
              id: `${baseId}-opt-${index}`,
              'data-index': index,
              role: 'option',
              className: `participant-option${isActive ? ' active' : ''}`,
              onMouseDown: (e) => e.preventDefault(),
              onMouseEnter: () => setActiveIndex(index),
              onClick: () => chooseOption(option),
            }
            if (option.type === 'contact') {
              const c = option.contact
              const selected = participantIds.includes(c.id)
              const secondary = c.email || c.organization
              return (
                <li key={option.key} {...common} aria-selected={selected}>
                  <ContactAvatar name={c.name} size="sm" />
                  <span className="participant-option-text">
                    <span className="participant-option-name">{c.name}</span>
                    {secondary && <span className="participant-option-sub">{secondary}</span>}
                  </span>
                  <span className={`participant-option-check${selected ? ' on' : ''}`} aria-hidden="true">
                    {selected && <Check size={14} strokeWidth={2.25} />}
                  </span>
                </li>
              )
            }
            return (
              <li key={option.key} {...common} aria-selected={false} className={`${common.className} extra`}>
                <span className="participant-option-icon" aria-hidden="true">
                  {option.type === 'create' ? <UserPlus size={15} strokeWidth={1.75} /> : <UserRound size={15} strokeWidth={1.75} />}
                </span>
                <span className="participant-option-text">
                  <span className="participant-option-name">
                    {option.type === 'create' ? `Crear contacto «${trimmed}»` : `Añadir «${trimmed}» solo a esta reunión`}
                  </span>
                </span>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}
