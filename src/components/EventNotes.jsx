import { useEffect, useRef, useState } from 'react'
import { Check, NotebookPen } from 'lucide-react'
import { notesOf } from '../lib/notes'
import './EventNotes.css'

const SAVE_DELAY_MS = 600

// Sección "Notas" de una reunión, con guardado automático mientras se escribe.
export default function EventNotes({ event, now, autoFocus = false, onSave }) {
  const [text, setText] = useState(() => notesOf(event))
  const [status, setStatus] = useState('idle') // 'idle' | 'pending' | 'saved'
  const [savedText, setSavedText] = useState(() => notesOf(event))
  const sectionRef = useRef(null)
  const textareaRef = useRef(null)
  const timerRef = useRef(null)
  const pendingRef = useRef(null)
  const onSaveRef = useRef(onSave)

  useEffect(() => {
    onSaveRef.current = onSave
  }, [onSave])

  // Si se cierra la reunión antes de que pase el retardo, se guarda lo que quede pendiente.
  useEffect(
    () => () => {
      clearTimeout(timerRef.current)
      if (pendingRef.current !== null) onSaveRef.current(pendingRef.current)
    },
    [],
  )

  useEffect(() => {
    if (!autoFocus) return
    sectionRef.current?.scrollIntoView({ block: 'center' })
    textareaRef.current?.focus({ preventScroll: true })
  }, [autoFocus])

  const handleChange = (value) => {
    setText(value)
    setStatus('pending')
    pendingRef.current = value
    clearTimeout(timerRef.current)
    timerRef.current = setTimeout(() => {
      onSaveRef.current(value)
      pendingRef.current = null
      setSavedText(value)
      setStatus('saved')
    }, SAVE_DELAY_MS)
  }

  const finished = new Date(event.end) <= now
  const highlight = finished && !savedText.trim() && !text.trim()

  return (
    <section ref={sectionRef} className={`event-notes${highlight ? ' highlight' : ''}`} aria-label="Notas">
      <div className="event-notes-head">
        <span className="event-notes-title">
          <NotebookPen size={15} strokeWidth={1.75} />
          Notas
        </span>
        <span className="event-notes-status" aria-live="polite">
          {status === 'pending' && 'Guardando…'}
          {status === 'saved' && (
            <>
              <Check size={13} strokeWidth={2} />
              Guardado
            </>
          )}
        </span>
      </div>
      {highlight && <p className="event-notes-prompt">¿Qué se habló en esta reunión?</p>}
      <textarea
        ref={textareaRef}
        value={text}
        onChange={(e) => handleChange(e.target.value)}
        rows={4}
        placeholder={event.recurrence ? 'Notas de este día…' : 'Acuerdos, próximos pasos, ideas…'}
        aria-label="Notas de la reunión"
      />
    </section>
  )
}
