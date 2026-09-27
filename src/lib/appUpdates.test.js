import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { reloadWhenSafe } from './appUpdates'

// Documento mínimo con visibilityState que se puede cambiar.
function fakeDoc(visibilityState = 'visible') {
  const doc = new EventTarget()
  doc.visibilityState = visibilityState
  doc.hide = () => {
    doc.visibilityState = 'hidden'
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
    vi.stubGlobal('sessionStorage', { getItem: (k) => store.get(k) ?? null, setItem: (k, v) => store.set(k, v) })
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
})
