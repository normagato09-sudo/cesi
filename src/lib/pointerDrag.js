// Seguimiento de un arrastre con el puntero en window (o en `target`), no en el elemento que se
// arrastra: si React lo recoloca en el DOM (p. ej. al pasar por encima de otra reunión o a otro
// día), el navegador le quita la captura del puntero y dejaría de recibir los movimientos y el
// momento de soltar.

/**
 * Llama a onMove(e) con cada movimiento del puntero `pointerId`, y a onEnd(e) al soltarlo o a
 * onCancel(e) si el navegador lo cancela; después deja de escuchar. Devuelve stop() para dejar de
 * escuchar antes (p. ej. al desmontar).
 */
export function trackPointer({ pointerId, onMove, onEnd, onCancel, target = globalThis.window }) {
  const mine = (e) => e.pointerId === pointerId
  const move = (e) => mine(e) && onMove?.(e)
  const up = (e) => {
    if (!mine(e)) return
    stop()
    onEnd?.(e)
  }
  const cancel = (e) => {
    if (!mine(e)) return
    stop()
    onCancel?.(e)
  }
  function stop() {
    target.removeEventListener('pointermove', move)
    target.removeEventListener('pointerup', up)
    target.removeEventListener('pointercancel', cancel)
  }
  target.addEventListener('pointermove', move)
  target.addEventListener('pointerup', up)
  target.addEventListener('pointercancel', cancel)
  return stop
}

// Tras soltar un arrastre, el navegador lanza un clic donde se levanta el puntero (que puede ser
// otra reunión o un hueco vacío). Se descarta ese clic, y solo ese; si no llega enseguida, se deja.
const SWALLOW_MS = 400

export function swallowNextClick(target = globalThis.window) {
  if (!target) return
  let timer = null
  const swallow = (e) => {
    e.stopPropagation()
    e.preventDefault()
    stop()
  }
  function stop() {
    clearTimeout(timer)
    target.removeEventListener('click', swallow, { capture: true })
  }
  target.addEventListener('click', swallow, { capture: true })
  timer = setTimeout(stop, SWALLOW_MS)
}
