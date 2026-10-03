import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  FLUSH_EVENT,
  applyUpdate,
  hasUnsavedWork,
  newVersionOnServer,
  offerUpdate,
  onReturn,
  reload,
  showUpdateBanner,
  showUpdatedNotice,
  takeUpdatedNotice,
} from './appUpdates'

// Elemento mínimo: hijos, atributos, clases y clics.
function fakeElement(tag) {
  const el = new EventTarget()
  Object.assign(el, { tagName: tag.toUpperCase(), children: [], attrs: {}, classList: new Set(), disabled: false })
  el.setAttribute = (k, v) => (el.attrs[k] = v)
  el.append = (...kids) => el.children.push(...kids)
  el.remove = vi.fn()
  return el
}

// Documento mínimo con visibilityState, foco y los selectores que usa appUpdates.
function fakeDoc({ visibilityState = 'visible', unsaved = false, editing = false } = {}) {
  const doc = new EventTarget()
  doc.visibilityState = visibilityState
  doc.activeElement = editing ? { tagName: 'TEXTAREA' } : { tagName: 'BODY' }
  doc.added = []
  doc.createElement = (tag) => fakeElement(tag)
  doc.body = { appendChild: (el) => doc.added.push(el) }
  doc.querySelector = (selector) => {
    if (selector === '.app-update-banner') return doc.added.find((el) => el.className === 'app-update-banner') || null
    return unsaved ? {} : null
  }
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

const bannerOf = (doc) => doc.added.find((el) => el.className === 'app-update-banner')

let locationReload
beforeEach(() => {
  locationReload = vi.fn()
  const win = new EventTarget()
  win.location = { reload: locationReload }
  vi.stubGlobal('window', win)
  const store = new Map()
  vi.stubGlobal('sessionStorage', {
    getItem: (k) => store.get(k) ?? null,
    setItem: (k, v) => store.set(k, v),
    removeItem: (k) => store.delete(k),
  })
})
afterEach(() => {
  vi.unstubAllGlobals()
  vi.useRealTimers()
})

describe('recargar con la versión nueva', () => {
  it('no recarga en bucle, salvo si lo pide el usuario', () => {
    expect(reload({ now: 1000 })).toBe(true)
    expect(reload({ now: 3000 })).toBe(false)
    expect(reload({ now: 4000, force: true })).toBe(true)
    expect(locationReload).toHaveBeenCalledTimes(2)
  })

  it('tras recargar por una versión nueva, avisa una sola vez', () => {
    expect(takeUpdatedNotice()).toBe(false)
    reload({ now: 1000 })
    expect(takeUpdatedNotice()).toBe(true)
    expect(takeUpdatedNotice()).toBe(false)
  })
})

describe('cuando hay una versión nueva (offerUpdate)', () => {
  it('si la app se acaba de abrir y no hay nada a medias, recarga sin avisar', () => {
    const doc = fakeDoc()
    offerUpdate({ loadedAt: 1000, now: 5000, doc })
    expect(locationReload).toHaveBeenCalledTimes(1)
    expect(bannerOf(doc)).toBeUndefined()
  })

  it('si se está usando, muestra el aviso en vez de recargar', () => {
    const doc = fakeDoc()
    offerUpdate({ loadedAt: 0, now: 10 * 60 * 1000, doc })
    expect(locationReload).not.toHaveBeenCalled()
    const banner = bannerOf(doc)
    expect(banner.children[0].textContent).toBe('Hay una versión nueva')
    expect(banner.children[1].textContent).toBe('Actualizar')
  })

  it('recién abierta pero escribiendo, tampoco recarga', () => {
    const doc = fakeDoc({ editing: true })
    offerUpdate({ loadedAt: 1000, now: 2000, doc })
    expect(locationReload).not.toHaveBeenCalled()
    expect(bannerOf(doc)).toBeTruthy()
  })

  it('solo hay un aviso aunque se detecte varias veces', () => {
    const doc = fakeDoc()
    offerUpdate({ loadedAt: 0, now: 10 * 60 * 1000, doc })
    offerUpdate({ loadedAt: 0, now: 11 * 60 * 1000, doc, allowReload: false })
    expect(doc.added.filter((el) => el.className === 'app-update-banner')).toHaveLength(1)
  })
})

describe('"Actualizar"', () => {
  it('guarda lo pendiente (agenda, acta…) y recarga', async () => {
    const flushed = vi.fn()
    window.addEventListener(FLUSH_EVENT, flushed)
    await expect(applyUpdate({ doc: fakeDoc(), win: window })).resolves.toBe(true)
    expect(flushed).toHaveBeenCalledTimes(1)
    expect(locationReload).toHaveBeenCalledTimes(1)
  })

  it('con un formulario abierto sin guardar no recarga', async () => {
    await expect(applyUpdate({ doc: fakeDoc({ unsaved: true }), win: window })).resolves.toBe(false)
    expect(locationReload).not.toHaveBeenCalled()
  })

  it('espera al service worker nuevo antes de recargar', async () => {
    const worker = new EventTarget()
    worker.state = 'installed'
    const registration = { update: vi.fn().mockResolvedValue(), installing: null, waiting: worker }
    const done = applyUpdate({ registration, doc: fakeDoc(), win: window })
    await Promise.resolve()
    await Promise.resolve()
    expect(locationReload).not.toHaveBeenCalled()
    worker.state = 'activated'
    worker.dispatchEvent(new Event('statechange'))
    await done
    expect(registration.update).toHaveBeenCalled()
    expect(locationReload).toHaveBeenCalledTimes(1)
  })

  it('el aviso pide guardar o cerrar lo abierto si no se puede recargar', async () => {
    const doc = fakeDoc()
    showUpdateBanner({ doc, onUpdate: async () => false })
    const [text, button] = bannerOf(doc).children
    button.dispatchEvent(new Event('click'))
    await Promise.resolve()
    await Promise.resolve()
    expect(text.textContent).toBe('Guarda o cierra lo que tienes abierto y vuelve a pulsar')
    expect(button.disabled).toBe(false)
  })
})

describe('algo sin guardar', () => {
  it('cuentan los formularios abiertos y los campos marcados, no el inicio de sesión', () => {
    const seen = []
    const doc = { querySelector: (s) => (seen.push(s), null) }
    expect(hasUnsavedWork(doc)).toBe(false)
    expect(seen[0]).toBe('form:not([data-reload-safe]), [data-unsaved="true"]')
    expect(hasUnsavedWork({ querySelector: () => ({}) })).toBe(true)
  })
})

describe('versión publicada (/version.json)', () => {
  const respond = (body, ok = true) => vi.fn().mockResolvedValue({ ok, json: async () => body })

  it('detecta una versión distinta sin usar la caché', async () => {
    const fetchFn = respond({ version: 'b' })
    await expect(newVersionOnServer({ current: 'a', fetchFn })).resolves.toBe(true)
    expect(fetchFn.mock.calls[0][1]).toEqual({ cache: 'no-store' })
  })

  it('la misma versión, un error o sin conexión no avisan', async () => {
    await expect(newVersionOnServer({ current: 'a', fetchFn: respond({ version: 'a' }) })).resolves.toBe(false)
    await expect(newVersionOnServer({ current: 'a', fetchFn: respond({}, false) })).resolves.toBe(false)
    await expect(newVersionOnServer({ current: 'a', fetchFn: vi.fn().mockRejectedValue(new Error('offline')) })).resolves.toBe(false)
    await expect(newVersionOnServer({ current: null, fetchFn: respond({ version: 'b' }) })).resolves.toBe(false)
  })
})

describe('aviso de app actualizada', () => {
  it('muestra el texto unos segundos y luego se quita solo', () => {
    vi.useFakeTimers()
    const doc = fakeDoc()
    showUpdatedNotice(doc, 4000)
    const el = doc.added[0]
    expect(el.textContent).toBe('App actualizada a la última versión')
    expect(el.attrs.role).toBe('status')
    vi.advanceTimersByTime(4000)
    expect(el.classList.has('leaving')).toBe(true)
    expect(el.remove).not.toHaveBeenCalled()
    vi.advanceTimersByTime(400)
    expect(el.remove).toHaveBeenCalledTimes(1)
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
})
