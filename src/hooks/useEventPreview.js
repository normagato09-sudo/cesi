import { useEffect, useRef, useState } from 'react'
import { createLongPress } from '../lib/longPress'

const DELAY_MS = 350

// Vista previa de una reunión en el calendario: al pasar el ratón por encima o, en pantallas
// táctiles, al mantenerla pulsada (un toque corto la sigue abriendo). `bind(event)` da los
// manejadores para el elemento de la reunión; si la vista pone su propio onPointerDown (p. ej. para
// arrastrar), llama también a `press(e, event)`. `hide()` la oculta (p. ej. al empezar a arrastrar).
export function useEventPreview() {
  const [preview, setPreview] = useState(null) // { event, rect, touch }
  const timer = useRef(null)
  const [press] = useState(() => createLongPress({ onHide: () => setPreview(null) }))

  useEffect(
    () => () => {
      clearTimeout(timer.current)
      press.hide()
    },
    [press],
  )

  const hide = () => {
    clearTimeout(timer.current)
    press.hide()
  }

  const pressPreview = (e, event) => {
    const target = e.currentTarget
    press.start(e, () => setPreview({ event, rect: target.getBoundingClientRect(), touch: true }))
  }

  const bind = (event) => ({
    onPointerEnter: (e) => {
      if (e.pointerType !== 'mouse' || e.buttons) return
      const rect = e.currentTarget.getBoundingClientRect()
      clearTimeout(timer.current)
      timer.current = setTimeout(() => setPreview({ event, rect }), DELAY_MS)
    },
    // Con el dedo, pointerleave llega al levantarlo: la vista previa se queda un momento.
    onPointerLeave: (e) => {
      if (e.pointerType === 'mouse') hide()
    },
    onPointerDown: (e) => pressPreview(e, event),
    onClickCapture: (e) => press.consumeClick(e),
    onContextMenu: (e) => {
      if (press.isPressing()) e.preventDefault()
    },
  })

  return { preview, bind, press: pressPreview, hide }
}
