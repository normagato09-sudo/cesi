import { useEffect, useRef, useState } from 'react'
import { createLongPress } from '../lib/longPress'

// Con ratón: tarda en salir SHOW_MS y se quita HIDE_MS después de apartarlo (lo justo para poder
// entrar en la tarjeta y pulsar su enlace).
const SHOW_MS = 250
const HIDE_MS = 150

// Tarjeta rápida de lo que hay en el calendario: al pasar el ratón por encima o, en pantallas
// táctiles, al tocarlo (con «Abrir» para ir al detalle) o mantenerlo pulsado. `bind(event)` da los
// manejadores para el elemento; si la vista pone su propio onPointerDown (p. ej. para arrastrar),
// llama también a `press(e, event)`. `hide()` la oculta (p. ej. al empezar a arrastrar).
// preview: { event, rect, touch, open (abrir el detalle), keep / leave (el ratón entra o sale de
// la tarjeta) } o null.
export function useEventPreview() {
  const [preview, setPreview] = useState(null)
  const showTimer = useRef(null)
  const hideTimer = useRef(null)
  const lastPointer = useRef('mouse')
  const allowClick = useRef(false)
  const [press] = useState(() => createLongPress({ onHide: () => setPreview(null) }))

  useEffect(
    () => () => {
      clearTimeout(showTimer.current)
      clearTimeout(hideTimer.current)
      press.hide()
    },
    [press],
  )

  // Abierta con el dedo: se cierra al tocar fuera de ella o al desplazar.
  const touchOpen = !!preview?.touch
  useEffect(() => {
    if (!touchOpen) return
    const away = (e) => {
      if (!(e.target instanceof Element) || !e.target.closest('.event-preview')) setPreview(null)
    }
    const scroll = () => setPreview(null)
    window.addEventListener('pointerdown', away, { capture: true })
    window.addEventListener('scroll', scroll, { capture: true })
    return () => {
      window.removeEventListener('pointerdown', away, { capture: true })
      window.removeEventListener('scroll', scroll, { capture: true })
    }
  }, [touchOpen])

  const hide = () => {
    clearTimeout(showTimer.current)
    clearTimeout(hideTimer.current)
    press.hide()
    setPreview(null)
  }

  const scheduleHide = () => {
    clearTimeout(showTimer.current)
    clearTimeout(hideTimer.current)
    hideTimer.current = setTimeout(() => setPreview((p) => (p && !p.touch ? null : p)), HIDE_MS)
  }

  // «Abrir» de la tarjeta: deja pasar un clic al elemento, que abre su detalle como siempre.
  const openFrom = (target) => () => {
    hide()
    allowClick.current = true
    target.click()
  }

  const show = (event, target, touch) =>
    setPreview({
      event,
      rect: target.getBoundingClientRect(),
      touch,
      open: openFrom(target),
      keep: () => clearTimeout(hideTimer.current),
      leave: scheduleHide,
    })

  const pressPreview = (e, event) => {
    lastPointer.current = e.pointerType || 'mouse'
    const target = e.currentTarget
    press.start(e, () => show(event, target, true))
  }

  const bind = (event) => ({
    onPointerEnter: (e) => {
      if (e.pointerType !== 'mouse' || e.buttons) return
      const target = e.currentTarget
      clearTimeout(hideTimer.current)
      clearTimeout(showTimer.current)
      showTimer.current = setTimeout(() => show(event, target, false), SHOW_MS)
    },
    onPointerLeave: (e) => {
      if (e.pointerType === 'mouse') scheduleHide()
    },
    onPointerDown: (e) => pressPreview(e, event),
    onClickCapture: (e) => {
      if (press.consumeClick(e)) return
      if (allowClick.current) {
        allowClick.current = false
        return
      }
      // Un toque con el dedo: primero la tarjeta (con «Abrir»), no el detalle.
      if (lastPointer.current !== 'mouse') {
        e.preventDefault()
        e.stopPropagation()
        show(event, e.currentTarget, true)
      }
    },
    onContextMenu: (e) => {
      if (press.isPressing()) e.preventDefault()
    },
  })

  return { preview, bind, press: pressPreview, hide }
}
