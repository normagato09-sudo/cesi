import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { onReturn, reloadWhenSafe, showUpdatedNotice, takeUpdatedNotice } from './appUpdates'

// Documento mínimo con visibilityState que se puede cambiar.
function fakeDoc(visibilityState = 'visible') {
  const doc = new EventTarget()
  doc.visibilityState = visibilityState
  doc.hide = () => {
    doc.visibilityState = 'hidden'
    doc.dispatchEvent(new Event('visibilitychange'))
  }
  doc.show = () => {
    doc.visibilityState = 'visible'
    doc.dispatchEvent(new Event('visibilitychange'))
  }
  return doc
}

describe('recargar con la versión nueva (reloadWhenSafe)', () => {
  let reload
  beforeEach(() => {
    reload = vi.fn()
    vi.stubGlobal('window', { location: { reload } })
    const store = new Map()
    vi.stubGlobal('sessionStorage', {
      getItem: (k) => store.get(k) ?? null,
      setItem: (k, v) => store.set(k, v),
      removeItem: (k) => store.delete(k),
    })
  })
  afterEach(() => vi.unstubAllGlobals())

  it('si la página se acaba de abrir, recarga enseguida', () => {
    reloadWhenSafe({ openedAt: 1000, now: 5000, doc: fakeDoc() })
    expect(reload).toHaveBeenCalledTimes(1)
  })

  it('si se está usando, espera a que se deje de ver para no cortar lo que se escribe', () => {
    const doc = fakeDoc()
    reloadWhenSafe({ openedAt: 0, now: 10 * 60 * 1000, doc })
    expect(reload).not.toHaveBeenCalled()
    doc.hide()
    expect(reload).toHaveBeenCalledTimes(1)
  })

  it('si no se está viendo, recarga ya', () => {
    reloadWhenSafe({ openedAt: 0, now: 10 * 60 * 1000, doc: fakeDoc('hidden') })
    expect(reload).toHaveBeenCalledTimes(1)
  })

  it('no recarga en bucle', () => {
    reloadWhenSafe({ openedAt: 1000, now: 2000, doc: fakeDoc() })
    reloadWhenSafe({ openedAt: 1000, now: 3000, doc: fakeDoc() })
    expect(reload).toHaveBeenCalledTimes(1)
  })

  it('tras recargar por una versión nueva, avisa una sola vez', () => {
    expect(takeUpdatedNotice()).toBe(false)
    reloadWhenSafe({ openedAt: 1000, now: 2000, doc: fakeDoc() })
    expect(takeUpdatedNotice()).toBe(true)
    expect(takeUpdatedNotice()).toBe(false)
  })
})

describe('aviso de app actualizada', () => {
  afterEach(() => vi.useRealTimers())

  it('muestra el texto unos segundos y luego se quita solo', () => {
    vi.useFakeTimers()
    const removed = vi.fn()
    const el = { classList: new Set(), attrs: {}, setAttribute: (k, v) => (el.attrs[k] = v), remove: removed }
    const doc = { createElement: () => el, body: { appendChild: vi.fn() } }
    showUpdatedNotice(doc, 4000)
    expect(doc.body.appendChild).toHaveBeenCalledWith(el)
    expect(el.textContent).toBe('App actualizada a la última versión')
    expect(el.attrs.role).toBe('status')
    vi.advanceTimersByTime(4000)
    expect(el.classList.has('leaving')).toBe(true)
    expect(removed).not.toHaveBeenCalled()
    vi.advanceTimersByTime(400)
    expect(removed).toHaveBeenCalledTimes(1)
  })
})

describe('buscar versión nueva al volver a la app', () => {
  it('cada vez que la app vuelve a verse, no al dejar de verla', () => {
    const doc = fakeDoc()
    const check = vi.fn()
    onReturn(check, doc)
    doc.hide()
    expect(check).not.toHaveBeenCalled()
    doc.show()
    doc.hide()
    doc.show()
    expect(check).toHaveBeenCalledTimes(2)
  })

  it('una versión que llega justo al volver se aplica enseguida', () => {
    const reload = vi.fn()
    vi.stubGlobal('window', { location: { reload } })
    vi.stubGlobal('sessionStorage', { getItem: () => null, setItem: () => {} })
    // Abierta hace una hora, pero se acaba de volver a ella.
    const returnedAt = 60 * 60 * 1000
    reloadWhenSafe({ openedAt: returnedAt, now: returnedAt + 3000, doc: fakeDoc() })
    expect(reload).toHaveBeenCalledTimes(1)
    vi.unstubAllGlobals()
  })
})
