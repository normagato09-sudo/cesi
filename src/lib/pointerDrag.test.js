import { afterEach, describe, expect, it, vi } from 'vitest'
import { createLongPress } from './longPress'
import { canStartDrag, swallowNextClick, trackDrag, trackPointer } from './pointerDrag'

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

// Evento de ratón o dedo con posición y botones pulsados.
function input(type, { pointerId = 1, pointerType = 'mouse', x = 100, y = 100, button = 0, buttons = 1 } = {}) {
  const e = new Event(type, { cancelable: true })
  Object.assign(e, { pointerId, pointerType, clientX: x, clientY: y, button, buttons })
  return e
}

describe('arrastrar o hacer clic en una reunión (trackDrag)', () => {
  function setup(downOptions) {
    const win = new EventTarget()
    const calls = { engage: 0, moves: [], end: [] }
    const stop = trackDrag(input('pointerdown', downOptions), {
      threshold: 4,
      target: win,
      onEngage: () => calls.engage++,
      onMove: (e) => calls.moves.push(e.clientY),
      onEnd: (r) => calls.end.push({ engaged: r.engaged, cancel: r.cancel }),
    })
    return { win, calls, stop }
  }

  it('clic con ratón sin mover: no se mueve nada, termina al soltar y el clic abre la reunión', () => {
    const { win, calls } = setup()
    win.dispatchEvent(input('pointermove', { x: 101, y: 102 })) // temblor por debajo del umbral
    win.dispatchEvent(input('pointerup', { x: 101, y: 102, buttons: 0 }))
    expect(calls.engage).toBe(0)
    expect(calls.moves).toEqual([])
    expect(calls.end).toEqual([{ engaged: false, cancel: false }])

    const click = new Event('click', { cancelable: true })
    win.dispatchEvent(click)
    expect(click.defaultPrevented).toBe(false)
  })

  it('arrastre con ratón: sigue al puntero y termina al soltar; después el ratón ya no mueve nada', () => {
    const { win, calls } = setup()
    win.dispatchEvent(input('pointermove', { y: 110 }))
    win.dispatchEvent(input('pointermove', { y: 150 }))
    win.dispatchEvent(input('pointerup', { y: 150, buttons: 0 }))
    expect(calls.engage).toBe(1)
    expect(calls.moves).toEqual([110, 150])
    expect(calls.end).toEqual([{ engaged: true, cancel: false }])

    win.dispatchEvent(input('pointermove', { y: 40, buttons: 0 })) // pasar el ratón por encima
    win.dispatchEvent(input('pointerup', { y: 40, buttons: 0 }))
    expect(calls.moves).toEqual([110, 150])
    expect(calls.end).toHaveLength(1)
  })

  it('si se pierde el pointerup (ratón sin el botón pulsado), termina cancelando y no se mueve más', () => {
    const { win, calls } = setup()
    win.dispatchEvent(input('pointermove', { y: 150 }))
    win.dispatchEvent(input('pointermove', { y: 60, buttons: 0 })) // ya se había soltado
    win.dispatchEvent(input('pointermove', { y: 20, buttons: 0 }))
    expect(calls.moves).toEqual([150])
    expect(calls.end).toEqual([{ engaged: true, cancel: true }])
  })

  it('con el dedo sigue igual: umbral mayor y termina al levantarlo', () => {
    const win = new EventTarget()
    const onMove = vi.fn()
    const onEnd = vi.fn()
    trackDrag(input('pointerdown', { pointerType: 'touch' }), { threshold: 10, target: win, onMove, onEnd })
    win.dispatchEvent(input('pointermove', { pointerType: 'touch', y: 106 }))
    expect(onMove).not.toHaveBeenCalled()
    win.dispatchEvent(input('pointermove', { pointerType: 'touch', y: 130 }))
    win.dispatchEvent(input('pointerup', { pointerType: 'touch', y: 130, buttons: 0 }))
    expect(onMove).toHaveBeenCalledTimes(1)
    expect(onEnd).toHaveBeenCalledWith(expect.objectContaining({ engaged: true, cancel: false }))
  })

  it('el pointerup no se pierde aunque haya una pulsación larga en marcha', () => {
    vi.useFakeTimers()
    try {
      const win = new EventTarget()
      const onEnd = vi.fn()
      const down = input('pointerdown', { pointerType: 'touch' })
      trackDrag(down, { threshold: 10, target: win, onEnd })
      const press = createLongPress({ target: win })
      const show = vi.fn()
      press.start(down, show)

      const up = input('pointerup', { pointerType: 'touch', buttons: 0 })
      win.dispatchEvent(up)
      expect(onEnd).toHaveBeenCalledTimes(1)
      expect(up.defaultPrevented).toBe(false)
      expect(up.cancelBubble).toBe(false)
      vi.advanceTimersByTime(1000)
      expect(show).not.toHaveBeenCalled() // soltó antes de tiempo: era un toque
    } finally {
      vi.useRealTimers()
    }
  })

  it('stop() deja de escuchar sin terminar (al desmontar)', () => {
    const { win, calls, stop } = setup()
    stop()
    win.dispatchEvent(input('pointermove', { y: 150 }))
    win.dispatchEvent(input('pointerup', { buttons: 0 }))
    expect(calls.moves).toEqual([])
    expect(calls.end).toEqual([])
  })
})

describe('qué botón empieza un arrastre (canStartDrag)', () => {
  it('con ratón solo el principal; el dedo y el lápiz siempre', () => {
    expect(canStartDrag({ pointerType: 'mouse', button: 0 })).toBe(true)
    expect(canStartDrag({ pointerType: 'mouse', button: 2 })).toBe(false) // derecho
    expect(canStartDrag({ pointerType: 'mouse', button: 1 })).toBe(false) // rueda
    expect(canStartDrag({ pointerType: 'touch', button: 0 })).toBe(true)
    expect(canStartDrag({ pointerType: 'pen', button: 0 })).toBe(true)
  })
})
