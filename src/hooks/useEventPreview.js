import { useEffect, useRef, useState } from 'react'

const DELAY_MS = 350

// Vista previa de una reunión al pasar el ratón por encima en el calendario (solo con ratón:
// en pantallas táctiles se abre la reunión al tocarla). `bind(event)` da los manejadores para el
// elemento de la reunión; `hide()` la oculta (p. ej. al empezar a arrastrar).
export function useEventPreview() {
  const [preview, setPreview] = useState(null) // { event, rect }
  const timer = useRef(null)

  useEffect(() => () => clearTimeout(timer.current), [])

  const hide = () => {
    clearTimeout(timer.current)
    setPreview(null)
  }

  const bind = (event) => ({
    onPointerEnter: (e) => {
      if (e.pointerType !== 'mouse' || e.buttons) return
      const rect = e.currentTarget.getBoundingClientRect()
      clearTimeout(timer.current)
      timer.current = setTimeout(() => setPreview({ event, rect }), DELAY_MS)
    },
    onPointerLeave: hide,
  })

  return { preview, bind, hide }
}
