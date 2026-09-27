import { trackPointer } from './pointerDrag'

// Mantener pulsado con el dedo (o el lápiz) para ver algo sin abrirlo, p. ej. la vista previa de
// una reunión en el móvil. Con ratón no hace nada (allí se usa pasar por encima).
// - Si el dedo se levanta antes de LONG_PRESS_MS es un toque normal: el clic sigue su curso.
// - Si se mantiene, se llama a show(); al soltar sigue visible VISIBLE_MS (o hasta tocar en otro
//   sitio o desplazar) y el clic que sigue a soltar se descarta, para no abrir lo que hay debajo.
// - Quien arrastra llama a hide() al empezar el arrastre, así que no interfiere con arrastrar.

export const LONG_PRESS_MS = 450
export const VISIBLE_MS = 3000

export function createLongPress({ onHide, delay = LONG_PRESS_MS, visibleMs = VISIBLE_MS, target = globalThis.window }) {
  let pressTimer = null
  let hideTimer = null
  let stopTracking = null
  let stopDismiss = null
  let longPressed = false

  function clear() {
    clearTimeout(pressTimer)
    clearTimeout(hideTimer)
    pressTimer = null
    stopTracking?.()
    stopTracking = null
    stopDismiss?.()
    stopDismiss = null
  }

  function hide() {
    clear()
    longPressed = false
    onHide?.()
  }

  // Tocar en otro sitio o desplazar la oculta.
  function listenDismiss() {
    const dismiss = () => hide()
    target.addEventListener('pointerdown', dismiss, { capture: true })
    target.addEventListener('scroll', dismiss, { capture: true })
    stopDismiss = () => {
      target.removeEventListener('pointerdown', dismiss, { capture: true })
      target.removeEventListener('scroll', dismiss, { capture: true })
    }
  }

  function start(e, show) {
    if (!target || e.pointerType === 'mouse') return
    clear()
    longPressed = false
    pressTimer = setTimeout(() => {
      pressTimer = null
      longPressed = true
      show()
      listenDismiss()
    }, delay)
    stopTracking = trackPointer({
      pointerId: e.pointerId,
      target,
      onEnd: () => {
        stopTracking = null
        clearTimeout(pressTimer)
        pressTimer = null
        if (longPressed) hideTimer = setTimeout(hide, visibleMs)
      },
      onCancel: () => {
        stopTracking = null
        hide()
      },
    })
  }

  // Para onClickCapture: descarta el clic que sigue a mantener pulsado. Devuelve si lo descartó.
  function consumeClick(e) {
    if (!longPressed) return false
    longPressed = false
    e.preventDefault()
    e.stopPropagation()
    return true
  }

  // Mientras se mantiene pulsado (o justo después) no sale el menú del navegador.
  const isPressing = () => pressTimer !== null || longPressed

  return { start, hide, consumeClick, isPressing }
}
