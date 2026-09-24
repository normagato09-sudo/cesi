import { afterEach, describe, expect, it } from 'vitest'
import { MemoryStorage, createFakeSupabase } from '../../../test/fakeSupabase'
import { createRemote } from './remote'
import { SyncEngine } from './engine'
import { loadQueue } from './queue'
import { createEvent, deleteEvent, getAllEvents, updateEvent } from '../localEvents'
import { getPreferences, savePreferences } from '../preferences'

const USER = 'user-1'
const originalStorage = globalThis.localStorage
const engines = []

// Temporizadores manuales: en los tests se llama a scan() y sync() directamente.
const noTimers = { setTimeout: () => 0, clearTimeout: () => {} }

// Un "dispositivo" con su propio localStorage, su reloj y su motor de sincronización.
function device(server, { clockStart = Date.parse('2026-09-24T09:00:00.000Z') } = {}) {
  const storage = new MemoryStorage()
  let clock = clockStart
  let online = true
  const run = (fn) => {
    const previous = globalThis.localStorage
    globalThis.localStorage = storage
    try {
      return fn()
    } finally {
      globalThis.localStorage = previous
    }
  }
  const runAsync = async (fn) => {
    const previous = globalThis.localStorage
    globalThis.localStorage = storage
    try {
      return await fn()
    } finally {
      globalThis.localStorage = previous
    }
  }
  const remote = createRemote(server.client)
  // Realtime llega a este dispositivo con su propio localStorage.
  const wrapped = {
    ...remote,
    subscribe: (userId, onRow) => remote.subscribe(userId, (table, row) => run(() => onRow(table, row))),
  }
  const engine = run(
    () =>
      new SyncEngine({
        remote: wrapped,
        userId: USER,
        isOnline: () => online,
        now: () => (clock += 1000),
        timers: noTimers,
      }),
  )
  engines.push(engine)
  return {
    engine,
    run,
    start: () => runAsync(() => engine.start()),
    choose: (strategy) => runAsync(() => engine.resolveInitial(strategy)),
    // Lo que hace la app tras cada cambio: detectar diferencias y enviar.
    save: (fn) => runAsync(async () => {
      const result = fn()
      engine.scan()
      await engine.sync()
      return result
    }),
    sync: () => runAsync(() => engine.sync()),
    setOnline(value) {
      online = value
    },
    status: () => engine.getSnapshot(),
    events: () => run(() => getAllEvents()),
  }
}

afterEach(() => {
  for (const e of engines.splice(0)) e.stop()
  globalThis.localStorage = originalStorage
})

const meeting = (title) => ({ title, start: '2026-09-25T08:00:00.000Z', end: '2026-09-25T09:00:00.000Z' })

describe('sincronización entre dispositivos', () => {
  it('un cambio hecho en un dispositivo aparece solo en el otro (Realtime)', async () => {
    const server = createFakeSupabase()
    const pc = device(server)
    const phone = device(server)
    await pc.start()
    await phone.start()
    expect(pc.status().status).toBe('synced')

    const ev = await pc.save(() => createEvent(meeting('Con Ana')))
    expect(server.row('events', ev.id).data.title).toBe('Con Ana')
    expect(phone.events().map((e) => e.title)).toEqual(['Con Ana'])

    await phone.save(() => updateEvent(ev.id, { notes: 'Presupuesto aprobado' }))
    expect(pc.events()[0].notes).toBe('Presupuesto aprobado')
  })

  it('sin conexión guarda los cambios en la cola y los envía al volver la conexión', async () => {
    const server = createFakeSupabase()
    const pc = device(server)
    await pc.start()
    pc.setOnline(false)
    server.setOnline(false)

    const ev = await pc.save(() => createEvent(meeting('Sin red')))
    expect(pc.status().status).toBe('offline')
    expect(pc.run(() => loadQueue()).map((o) => o.id)).toEqual([ev.id])
    expect(pc.events()).toHaveLength(1)

    pc.setOnline(true)
    server.setOnline(true)
    await pc.sync()
    expect(pc.status().status).toBe('synced')
    expect(pc.run(() => loadQueue())).toEqual([])
    expect(server.row('events', ev.id).data.title).toBe('Sin red')
  })

  it('los borrados se sincronizan con deleted_at', async () => {
    const server = createFakeSupabase()
    const pc = device(server)
    const phone = device(server)
    await pc.start()
    await phone.start()
    const ev = await pc.save(() => createEvent(meeting('Se cancela')))
    expect(phone.events()).toHaveLength(1)

    await phone.save(() => deleteEvent(ev.id))
    expect(server.row('events', ev.id).deleted_at).not.toBeNull()
    expect(pc.events()).toEqual([])
  })

  it('conflicto: gana el cambio más reciente aunque llegue antes el antiguo', async () => {
    const server = createFakeSupabase()
    const pc = device(server)
    const phone = device(server, { clockStart: Date.parse('2026-09-24T09:30:00.000Z') })
    await pc.start()
    await phone.start()
    const ev = await pc.save(() => createEvent(meeting('Original')))

    // Los dos editan sin conexión; el móvil lo hace más tarde.
    pc.setOnline(false)
    phone.setOnline(false)
    await pc.save(() => updateEvent(ev.id, { title: 'Editado en el ordenador' }))
    await phone.save(() => updateEvent(ev.id, { title: 'Editado en el móvil' }))

    // El móvil envía primero; el ordenador, con un cambio más antiguo, después.
    phone.setOnline(true)
    await phone.sync()
    pc.setOnline(true)
    await pc.sync()

    expect(server.row('events', ev.id).data.title).toBe('Editado en el móvil')
    expect(pc.events()[0].title).toBe('Editado en el móvil')
    expect(phone.events()[0].title).toBe('Editado en el móvil')
  })

  it('un cambio local pendiente más reciente no se pisa con lo que llega de la nube', async () => {
    const server = createFakeSupabase()
    const pc = device(server, { clockStart: Date.parse('2026-09-24T12:00:00.000Z') })
    const phone = device(server)
    await pc.start()
    await phone.start()
    const ev = await phone.save(() => createEvent(meeting('Original')))

    pc.setOnline(false)
    await pc.save(() => updateEvent(ev.id, { title: 'Nuevo en el ordenador' }))
    await phone.save(() => updateEvent(ev.id, { title: 'Antiguo en el móvil' }))
    expect(pc.events()[0].title).toBe('Nuevo en el ordenador')

    pc.setOnline(true)
    await pc.sync()
    expect(server.row('events', ev.id).data.title).toBe('Nuevo en el ordenador')
    expect(phone.events()[0].title).toBe('Nuevo en el ordenador')
  })

  it('sincroniza también las preferencias (tabla settings)', async () => {
    const server = createFakeSupabase()
    const pc = device(server)
    const phone = device(server)
    await pc.start()
    await phone.start()
    await pc.save(() => savePreferences({ bufferMinutes: 15 }))
    expect(server.row('settings', 'preferences').data).toEqual({ bufferMinutes: 15 })
    expect(phone.run(() => getPreferences()).bufferMinutes).toBe(15)
  })
})

describe('primer inicio de sesión', () => {
  it('con datos solo en este dispositivo ofrece subirlos', async () => {
    const server = createFakeSupabase()
    const pc = device(server)
    const ev = pc.run(() => createEvent(meeting('De antes')))
    await pc.start()
    expect(pc.status()).toMatchObject({ status: 'needs-choice', choice: 'upload' })
    expect(server.rows('events')).toEqual([])

    await pc.choose('device')
    expect(server.row('events', ev.id).data.title).toBe('De antes')
    expect(pc.status().status).toBe('synced')
  })

  it('con datos en los dos sitios pregunta y puede fusionarlos por id', async () => {
    const server = createFakeSupabase()
    const phone = device(server)
    await phone.start()
    await phone.save(() => createEvent(meeting('Del móvil')))

    const pc = device(server)
    pc.run(() => createEvent(meeting('Del ordenador')))
    await pc.start()
    expect(pc.status()).toMatchObject({ status: 'needs-choice', choice: 'conflict' })

    await pc.choose('merge')
    expect(pc.events().map((e) => e.title).sort()).toEqual(['Del móvil', 'Del ordenador'])
    expect(phone.events().map((e) => e.title).sort()).toEqual(['Del móvil', 'Del ordenador'])
  })

  it('conservar los de la nube sustituye los datos de este dispositivo', async () => {
    const server = createFakeSupabase()
    const phone = device(server)
    await phone.start()
    await phone.save(() => createEvent(meeting('Del móvil')))

    const pc = device(server)
    pc.run(() => createEvent(meeting('Del ordenador')))
    await pc.start()
    await pc.choose('cloud')
    expect(pc.events().map((e) => e.title)).toEqual(['Del móvil'])
    expect(server.rows('events')).toHaveLength(1)
  })

  it('sin datos en este dispositivo descarga la nube directamente', async () => {
    const server = createFakeSupabase()
    const phone = device(server)
    await phone.start()
    await phone.save(() => createEvent(meeting('Del móvil')))

    const pc = device(server)
    await pc.start()
    expect(pc.status().status).toBe('synced')
    expect(pc.events().map((e) => e.title)).toEqual(['Del móvil'])
  })
})
