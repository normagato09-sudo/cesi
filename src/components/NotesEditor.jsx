import { useEffect, useImperativeHandle, useLayoutEffect, useRef, useState } from 'react'
import { Check, Gavel, IndentDecrease, IndentIncrease, List, ListOrdered, ListTodo } from 'lucide-react'
import { enter, indent, lineAt, lineContent, toggleList } from '../lib/noteLists'
import './NotesEditor.css'

const MOBILE_QUERY = '(max-width: 640px), (pointer: coarse)'

function useMediaQuery(query) {
  const [matches, setMatches] = useState(() => window.matchMedia?.(query).matches ?? false)
  useEffect(() => {
    const mq = window.matchMedia?.(query)
    if (!mq) return
    const onChange = () => setMatches(mq.matches)
    mq.addEventListener('change', onChange)
    return () => mq.removeEventListener('change', onChange)
  }, [query])
  return matches
}

// Distancia desde abajo de la pantalla hasta el teclado del móvil (0 si no hay teclado).
function useKeyboardOffset(active) {
  const [offset, setOffset] = useState(0)
  useEffect(() => {
    const vv = window.visualViewport
    if (!active || !vv) return
    const update = () => setOffset(Math.max(0, window.innerHeight - vv.height - vv.offsetTop))
    update()
    vv.addEventListener('resize', update)
    vv.addEventListener('scroll', update)
    return () => {
      vv.removeEventListener('resize', update)
      vv.removeEventListener('scroll', update)
    }
  }, [active])
  return active ? offset : 0
}

const MIRROR_STYLES = [
  'boxSizing', 'width', 'paddingTop', 'paddingRight', 'paddingBottom', 'paddingLeft',
  'borderTopWidth', 'borderRightWidth', 'borderBottomWidth', 'borderLeftWidth',
  'fontFamily', 'fontSize', 'fontWeight', 'lineHeight', 'letterSpacing', 'tabSize',
]

// Posición (px desde arriba del textarea) de la línea que empieza en `lineStart`.
function lineTop(textarea, lineStart) {
  const mirror = document.createElement('div')
  const style = window.getComputedStyle(textarea)
  for (const key of MIRROR_STYLES) mirror.style[key] = style[key]
  Object.assign(mirror.style, { position: 'absolute', visibility: 'hidden', whiteSpace: 'pre-wrap', overflowWrap: 'break-word', top: '0', left: '-9999px' })
  mirror.textContent = textarea.value.slice(0, lineStart)
  const marker = document.createElement('span')
  marker.textContent = '​'
  mirror.appendChild(marker)
  document.body.appendChild(mirror)
  const top = marker.offsetTop
  document.body.removeChild(mirror)
  return top - textarea.scrollTop
}

/**
 * Notas del acta con listas automáticas ("- " y "1. ", Enter, Tab y Shift+Tab) y, en la línea del
 * cursor, botones para apuntarla como decisión o convertirla en tarea. En el móvil, los botones
 * van en una barra encima del teclado. El texto sigue siendo texto plano.
 * `isDecision(text)`: si esa línea ya está en Decisiones.
 */
export default function NotesEditor({ ref: outerRef, id, value, onChange, placeholder, className = '', onDecision, onTask, isDecision }) {
  const ref = useRef(null)
  const pendingSelection = useRef(null)
  const [focused, setFocused] = useState(false)
  const [caret, setCaret] = useState(0)
  const [top, setTop] = useState(null)
  const mobile = useMediaQuery(MOBILE_QUERY)
  const keyboard = mobile && focused
  const keyboardOffset = useKeyboardOffset(keyboard)

  useImperativeHandle(outerRef, () => ref.current, [])

  useLayoutEffect(() => {
    const el = ref.current
    const sel = pendingSelection.current
    if (!el || !sel) return
    pendingSelection.current = null
    el.setSelectionRange(sel[0], sel[1])
    setCaret(sel[0])
  }, [value])

  const line = lineAt(value, Math.min(caret, value.length))
  const content = lineContent(line.text)

  // Posición de los botones de la línea (en el ordenador, a la derecha de la línea); null si la
  // línea no se ve.
  const placeLineActions = () => {
    const el = ref.current
    if (!el) return
    const y = lineTop(el, line.start)
    setTop(y >= 0 && y < el.clientHeight - 8 ? y : null)
  }

  useLayoutEffect(() => {
    if (mobile || !focused) return
    placeLineActions()
  })

  const apply = (result) => {
    if (!result) return false
    pendingSelection.current = [result.start, result.end]
    onChange(result.text)
    return true
  }

  const current = () => {
    const el = ref.current
    return { text: el.value, start: el.selectionStart, end: el.selectionEnd }
  }

  // En algunos teclados de móvil Enter no llega como tecla: se recoge el salto de línea antes de
  // que se escriba.
  useEffect(() => {
    const el = ref.current
    if (!el) return
    const onBeforeInput = (e) => {
      if ((e.inputType === 'insertLineBreak' || e.inputType === 'insertParagraph') && !e.isComposing) {
        if (apply(enter(current()))) e.preventDefault()
      }
    }
    el.addEventListener('beforeinput', onBeforeInput)
    return () => el.removeEventListener('beforeinput', onBeforeInput)
  })

  const handleKeyDown = (e) => {
    if (e.nativeEvent.isComposing) return
    if (e.key === 'Enter' && !e.shiftKey && !e.altKey && !e.ctrlKey && !e.metaKey) {
      if (apply(enter(current()))) e.preventDefault()
    } else if (e.key === 'Tab' && !e.altKey && !e.ctrlKey && !e.metaKey) {
      if (apply(indent(current(), e.shiftKey ? -1 : 1))) e.preventDefault()
    }
  }

  const trackCaret = (e) => setCaret(e.currentTarget.selectionStart)

  // Los botones no quitan el foco de las notas (si no, en el móvil se cerraría el teclado).
  const keepFocus = (e) => e.preventDefault()

  const decided = !!content && !!isDecision?.(content)
  const lineActions = (
    <>
      <button
        type="button"
        className={`notes-tool notes-line-action${decided ? ' done' : ''}`}
        onPointerDown={keepFocus}
        onClick={() => !decided && onDecision?.(content)}
        disabled={!content}
        aria-pressed={decided}
        title={decided ? 'Ya está en Decisiones' : 'Apuntar esta línea como decisión'}
        aria-label={decided ? 'Esta línea ya está en Decisiones' : 'Apuntar esta línea como decisión'}
      >
        {decided ? <Check size={16} strokeWidth={2.25} /> : <Gavel size={16} strokeWidth={1.9} />}
        <span>Decisión</span>
      </button>
      <button
        type="button"
        className="notes-tool notes-line-action"
        onPointerDown={keepFocus}
        onClick={() => onTask?.(content)}
        disabled={!content}
        title="Convertir esta línea en tarea"
        aria-label="Convertir esta línea en tarea"
      >
        <ListTodo size={16} strokeWidth={1.9} />
        <span>Tarea</span>
      </button>
    </>
  )

  const runFormat = (fn) => {
    ref.current?.focus()
    apply(fn(current()))
  }

  return (
    <div className={`notes-editor${focused ? ' focused' : ''} ${className}`}>
      <div
        className={`notes-toolbar${keyboard ? ' keyboard' : ''}`}
        role="toolbar"
        aria-label="Formato de las notas"
        hidden={mobile && !focused}
        style={keyboard ? { bottom: keyboardOffset } : undefined}
      >
        <button type="button" className="notes-tool" onPointerDown={keepFocus} onClick={() => runFormat((s) => toggleList(s, 'bullet'))} title="Lista con viñetas (escribe «- »)" aria-label="Lista con viñetas">
          <List size={18} strokeWidth={1.9} />
        </button>
        <button type="button" className="notes-tool" onPointerDown={keepFocus} onClick={() => runFormat((s) => toggleList(s, 'number'))} title="Lista numerada (escribe «1. »)" aria-label="Lista numerada">
          <ListOrdered size={18} strokeWidth={1.9} />
        </button>
        <button type="button" className="notes-tool" onPointerDown={keepFocus} onClick={() => runFormat((s) => indent(s, -1))} title="Menos sangría (Mayús+Tab)" aria-label="Menos sangría">
          <IndentDecrease size={18} strokeWidth={1.9} />
        </button>
        <button type="button" className="notes-tool" onPointerDown={keepFocus} onClick={() => runFormat((s) => indent(s, 1))} title="Más sangría (Tab)" aria-label="Más sangría">
          <IndentIncrease size={18} strokeWidth={1.9} />
        </button>
        {mobile ? (
          <>
            <span className="notes-toolbar-sep" aria-hidden="true" />
            {lineActions}
          </>
        ) : (
          <span className="notes-toolbar-hint">Escribe «- » o «1. » para empezar una lista</span>
        )}
      </div>
      <div className="notes-field">
        <textarea
          id={id}
          ref={ref}
          className="notes-textarea"
          value={value}
          onChange={(e) => {
            onChange(e.target.value)
            setCaret(e.target.selectionStart)
          }}
          onKeyDown={handleKeyDown}
          onSelect={trackCaret}
          onClick={trackCaret}
          onScroll={() => !mobile && placeLineActions()}
          onFocus={(e) => {
            setFocused(true)
            setCaret(e.currentTarget.selectionStart)
          }}
          onBlur={() => setFocused(false)}
          placeholder={placeholder}
          spellCheck
        />
        {!mobile && focused && content && top !== null && (
          <div className="notes-line-actions" style={{ top }}>
            {lineActions}
          </div>
        )}
      </div>
    </div>
  )
}
