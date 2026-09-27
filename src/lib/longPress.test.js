import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { LONG_PRESS_MS, VISIBLE_MS, createLongPress } from './longPress'

// Evento de puntero mínimo (Node no tiene PointerEvent).
function pointer(type, pointerId = 1, pointerType = 'touch') {
  const e = new Event(type, { cancelable: true })
  e.pointerId = pointerId
  e.pointerType = pointerType
  return e
}
function click() {
  return { preventDefault: vi.fn(), stopPropagation: vi.fn() }
}

describe('vista previa al mantener pulsada una reunión (createLongPress)', () => {
  let win, onHide, show, press
  beforeEach(() => {
    vi.useFakeTimers()
    win = new EventTarget()
    onHide = vi.fn()
    show = vi.fn()
    press = createLongPress({ onHide, target: win })
  })
  afterEach(() => vi.useRealTimers())

  it('un toque corto no la muestra y deja pasar el clic (abre la reunión)', () => {
    press.start(pointer('pointerdown'), show)
    vi.advanceTimersByTime(LONG_PRESS_MS - 100)
    win.dispatchEvent(pointer('pointerup'))
    vi.advanceTimersByTime(LONG_PRESS_MS)
    expect(show).not.toHaveBeenCalled()
    const c = click()
    expect(press.consumeClick(c)).toBe(false)
    expect(c.stopPropagation).not.toHaveBeenCalled()
  })

  it('al mantener pulsado la muestra, sigue un momento tras soltar y no abre la reunión', () => {
    press.start(pointer('pointerdown'), show)
    vi.advanceTimersByTime(LONG_PRESS_MS)
    expect(show).toHaveBeenCalledTimes(1)
    expect(press.isPressing()).toBe(true)

    win.dispatchEvent(pointer('pointerup'))
    const c = click()
    expect(press.consumeClick(c)).toBe(true)
    expect(c.stopPropagation).toHaveBeenCalled()
    expect(onHide).not.toHaveBeenCalled()

    vi.advanceTimersByTime(VISIBLE_MS)
    expect(onHide).toHaveBeenCalledTimes(1)
  })

  it('no interfiere con arrastrar: al empezar el arrastre se oculta y no se muestra', () => {
    press.start(pointer('pointerdown'), show)
    vi.advanceTimersByTime(100)
    press.hide() // la vista empieza a arrastrar
    vi.advanceTimersByTime(LONG_PRESS_MS)
    win.dispatchEvent(pointer('pointerup'))
    expect(show).not.toHaveBeenCalled()
    expect(press.consumeClick(click())).toBe(false)
  })

  it('arrastrar después de verla la oculta', () => {
    press.start(pointer('pointerdown'), show)
    vi.advanceTimersByTime(LONG_PRESS_MS)
    press.hide()
    expect(onHide).toHaveBeenCalled()
    expect(press.isPressing()).toBe(false)
  })

  it('tocar en otro sitio la oculta', () => {
    press.start(pointer('pointerdown'), show)
    vi.advanceTimersByTime(LONG_PRESS_MS)
    win.dispatchEvent(pointer('pointerup'))
    onHide.mockClear()
    win.dispatchEvent(pointer('pointerdown', 2))
    expect(onHide).toHaveBeenCalledTimes(1)
  })

  it('si el navegador cancela el puntero (p. ej. al desplazar), no se muestra', () => {
    press.start(pointer('pointerdown'), show)
    win.dispatchEvent(pointer('pointercancel'))
    vi.advanceTimersByTime(LONG_PRESS_MS)
    expect(show).not.toHaveBeenCalled()
  })

  it('solo descarta el clic de la pulsación larga: el siguiente toque corto abre la reunión', () => {
    press.start(pointer('pointerdown'), show)
    vi.advanceTimersByTime(LONG_PRESS_MS)
    win.dispatchEvent(pointer('pointerup'))
    expect(press.consumeClick(click())).toBe(true)

    win.dispatchEvent(pointer('pointerdown', 2)) // el toque siguiente cierra la vista previa…
    press.start(pointer('pointerdown', 2), show)
    win.dispatchEvent(pointer('pointerup', 2))
    expect(press.consumeClick(click())).toBe(false) // …y su clic abre la reunión
  })

  it('desplazar la oculta', () => {
    press.start(pointer('pointerdown'), show)
    vi.advanceTimersByTime(LONG_PRESS_MS)
    win.dispatchEvent(pointer('pointerup'))
    onHide.mockClear()
    win.dispatchEvent(new Event('scroll'))
    expect(onHide).toHaveBeenCalledTimes(1)
  })

  it('con ratón no hace nada (allí se usa pasar por encima)', () => {
    press.start(pointer('pointerdown', 1, 'mouse'), show)
    vi.advanceTimersByTime(LONG_PRESS_MS * 2)
    expect(show).not.toHaveBeenCalled()
    expect(press.isPressing()).toBe(false)
  })
})
