import { afterEach, describe, expect, it, vi } from 'vitest'
import { swallowNextClick, trackPointer } from './pointerDrag'

// Evento de puntero mínimo (Node no tiene PointerEvent).
function pointer(type, pointerId, clientY = 0) {
  const e = new Event(type, { cancelable: true })
  e.pointerId = pointerId
  e.clientY = clientY
  return e
}

describe('arrastrar una reunión (trackPointer)', () => {
  it('sigue el arrastre y lo suelta aunque el elemento arrastrado ya no reciba los eventos', () => {
    // Lo que pasa al pasar por encima de otra reunión: React recoloca el botón y pierde la
    // captura del puntero; los movimientos y el soltar solo llegan a window.
    const win = new EventTarget()
    const button = new EventTarget()
    const onButton = vi.fn()
    button.addEventListener('pointermove', onButton)
    button.addEventListener('pointerup', onButton)

    const moves = []
    const onEnd = vi.fn()
    trackPointer({ pointerId: 1, onMove: (e) => moves.push(e.clientY), onEnd, target: win })

    win.dispatchEvent(pointer('pointermove', 1, 20))
    win.dispatchEvent(pointer('pointermove', 1, 90)) // ya encima de la otra reunión
    win.dispatchEvent(pointer('pointerup', 1, 90))

    expect(moves).toEqual([20, 90])
    expect(onEnd).toHaveBeenCalledTimes(1)
    expect(onEnd.mock.calls[0][0].clientY).toBe(90)
    expect(onButton).not.toHaveBeenCalled()
  })

  it('deja de escuchar al soltar, y no hace caso de otros punteros', () => {
    const win = new EventTarget()
    const onMove = vi.fn()
    const onEnd = vi.fn()
    trackPointer({ pointerId: 7, onMove, onEnd, target: win })

    win.dispatchEvent(pointer('pointermove', 8))
    win.dispatchEvent(pointer('pointerup', 8)) // otro dedo
    expect(onMove).not.toHaveBeenCalled()
    expect(onEnd).not.toHaveBeenCalled()

    win.dispatchEvent(pointer('pointerup', 7))
    win.dispatchEvent(pointer('pointermove', 7))
    win.dispatchEvent(pointer('pointerup', 7))
    expect(onEnd).toHaveBeenCalledTimes(1)
    expect(onMove).not.toHaveBeenCalled()
  })

  it('si el navegador cancela el puntero, avisa con onCancel y no con onEnd', () => {
    const win = new EventTarget()
    const onEnd = vi.fn()
    const onCancel = vi.fn()
    trackPointer({ pointerId: 1, onEnd, onCancel, target: win })
    win.dispatchEvent(pointer('pointercancel', 1))
    win.dispatchEvent(pointer('pointerup', 1))
    expect(onCancel).toHaveBeenCalledTimes(1)
    expect(onEnd).not.toHaveBeenCalled()
  })

  it('stop() deja de escuchar antes de soltar (al desmontar)', () => {
    const win = new EventTarget()
    const onMove = vi.fn()
    const stop = trackPointer({ pointerId: 1, onMove, target: win })
    stop()
    win.dispatchEvent(pointer('pointermove', 1))
    expect(onMove).not.toHaveBeenCalled()
  })
})

describe('el clic después de soltar (swallowNextClick)', () => {
  afterEach(() => vi.useRealTimers())

  it('descarta solo el siguiente clic, caiga donde caiga', () => {
    // En el navegador se escucha en window en fase de captura: detenerlo ahí hace que el clic no
    // llegue a la reunión ni al hueco de debajo.
    const win = new EventTarget()
    swallowNextClick(win)

    const first = new Event('click', { cancelable: true })
    win.dispatchEvent(first)
    expect(first.cancelBubble).toBe(true)
    expect(first.defaultPrevented).toBe(true)

    const second = new Event('click', { cancelable: true })
    win.dispatchEvent(second)
    expect(second.cancelBubble).toBe(false)
    expect(second.defaultPrevented).toBe(false)
  })

  it('si el clic no llega enseguida, no descarta el siguiente', () => {
    vi.useFakeTimers()
    const win = new EventTarget()
    swallowNextClick(win)
    vi.advanceTimersByTime(1000)
    const late = new Event('click', { cancelable: true })
    win.dispatchEvent(late)
    expect(late.cancelBubble).toBe(false)
  })
})
