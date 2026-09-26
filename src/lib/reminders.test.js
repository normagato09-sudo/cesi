import { describe, expect, it } from 'vitest'
import { Buffer } from 'node:buffer'
import { createECDH, createDecipheriv, createHmac, randomBytes } from 'node:crypto'
import { TZDate } from '@date-fns/tz'
import {
  NO_REMINDER,
  dueReminders,
  reminderKey,
  reminderMinutesOf,
  reminderNotification,
  unsentReminders,
} from './reminders'
import { cancelOccurrencePatch, editOccurrencePatch } from './seriesEdits'
import { expandEvent } from './recurrence'
import { bytesToBase64Url, encryptPayload } from '../../supabase/functions/_shared/webpush.js'
import { deviceName, pushAvailability } from './push'

const d = (month, day, hh = 0, mm = 0) => new Date(2026, month - 1, day, hh, mm)
const meeting = (extra = {}) => ({
  id: 'm1',
  title: 'Revisión',
  start: d(9, 28, 10).toISOString(),
  end: d(9, 28, 11).toISOString(),
  recurrence: null,
  participantIds: [],
  ...extra,
})
const keysOf = (list) => list.map((r) => r.key)

describe('qué reuniones avisar', () => {
  it('avisa cuando llega el momento (10 min antes por defecto) y hasta que empieza', () => {
    const ev = meeting()
    expect(dueReminders([ev], { now: d(9, 28, 9, 49) })).toEqual([])
    const due = dueReminders([ev], { now: d(9, 28, 9, 50) })
    expect(due).toHaveLength(1)
    expect(due[0]).toMatchObject({ minutes: 10, fireAt: d(9, 28, 9, 50) })
    expect(dueReminders([ev], { now: d(9, 28, 9, 59) })).toHaveLength(1)
    expect(dueReminders([ev], { now: d(9, 28, 10, 0) })).toEqual([])
  })

  it('usa el aviso por defecto de los ajustes, el propio de la reunión o ninguno', () => {
    expect(dueReminders([meeting()], { now: d(9, 28, 9, 30), defaultMinutes: 30 })).toHaveLength(1)
    expect(dueReminders([meeting()], { now: d(9, 28, 9, 30), defaultMinutes: 10 })).toHaveLength(0)
    expect(dueReminders([meeting({ reminder: 60 })], { now: d(9, 28, 9, 0) })[0].minutes).toBe(60)
    expect(dueReminders([meeting({ reminder: NO_REMINDER })], { now: d(9, 28, 9, 55) })).toEqual([])
  })

  it('no avisa de bloques "No disponible" ni de opciones provisionales', () => {
    const now = d(9, 28, 9, 55)
    expect(dueReminders([meeting({ isUnavailable: true })], { now })).toEqual([])
    expect(dueReminders([meeting({ provisional: true, proposalId: 'p' })], { now })).toEqual([])
    expect(reminderMinutesOf({ isUnavailable: true })).toBeNull()
  })

  it('en una serie avisa de cada día, sin los cancelados y con la hora y el aviso propios de los cambiados', () => {
    // Cada día a las 10:00 desde el lunes 28 de septiembre.
    let series = meeting({ recurrence: { freq: 'daily', until: d(10, 30, 23, 59).toISOString() } })
    const occ = (day) => expandEvent(series, d(9, day), d(9, day + 1))[0]
    const tue = occ(29)
    const wed = occ(30)
    series = { ...series, ...cancelOccurrencePatch(series, tue) }
    series = { ...series, ...editOccurrencePatch(series, wed, { start: d(9, 30, 16), end: d(9, 30, 17), reminder: 30 }) }

    expect(dueReminders([series], { now: d(9, 28, 9, 50) })).toHaveLength(1)
    // Martes cancelado: nada.
    expect(dueReminders([series], { now: d(9, 29, 9, 55) })).toEqual([])
    // Miércoles: a las 10:00 no hay reunión; a las 16:00 sí, con aviso 30 minutos antes.
    expect(dueReminders([series], { now: d(9, 30, 9, 55) })).toEqual([])
    const wedDue = dueReminders([series], { now: d(9, 30, 15, 30) })
    expect(wedDue).toHaveLength(1)
    expect(wedDue[0].minutes).toBe(30)
    expect(new Date(wedDue[0].occurrence.start)).toEqual(d(9, 30, 16))
    // Jueves: como la serie.
    expect(dueReminders([series], { now: d(10, 1, 9, 50) })).toHaveLength(1)
  })

  it('en el servidor calcula en la zona horaria del usuario (también con cambio de hora y días cancelados)', () => {
    const zone = 'America/New_York'
    const toDate = (value) => new TZDate(new Date(value).getTime(), zone)
    // Cada jueves a las 10:00 en Nueva York desde el 1 de octubre (14:00 UTC en verano).
    const weekly = meeting({
      id: 'ny',
      start: '2026-10-01T14:00:00.000Z',
      end: '2026-10-01T15:00:00.000Z',
      recurrence: { freq: 'weekly', until: '2026-12-31T23:00:00.000Z' },
    })
    // 29 de octubre: Europa ya ha cambiado la hora y Nueva York aún no: sigue a las 14:00 UTC.
    const oct29 = dueReminders([weekly], { now: new Date('2026-10-29T13:50:00Z'), toDate })
    expect(oct29).toHaveLength(1)
    expect(new Date(oct29[0].occurrence.start).toISOString()).toBe('2026-10-29T14:00:00.000Z')
    // 5 de noviembre: Nueva York en horario de invierno, las 10:00 son las 15:00 UTC.
    expect(dueReminders([weekly], { now: new Date('2026-11-05T13:50:00Z'), toDate })).toEqual([])
    expect(dueReminders([weekly], { now: new Date('2026-11-05T14:50:00Z'), toDate })).toHaveLength(1)

    // Cada día a las 20:00 en Nueva York (00:00 UTC del día siguiente), con el 15 de octubre cancelado:
    // la clave del día es la fecha de Nueva York.
    const daily = meeting({
      id: 'late',
      start: '2026-10-14T00:00:00.000Z',
      end: '2026-10-14T01:00:00.000Z',
      recurrence: { freq: 'daily', until: '2026-10-31T23:00:00.000Z' },
      exceptions: { '2026-10-15': { cancelled: true } },
    })
    // 14 de octubre a las 19:50 en Nueva York: aviso. 15 (cancelado): nada. 16: aviso.
    expect(dueReminders([daily], { now: new Date('2026-10-14T23:50:00Z'), toDate })).toHaveLength(1)
    expect(dueReminders([daily], { now: new Date('2026-10-15T23:50:00Z'), toDate })).toEqual([])
    expect(dueReminders([daily], { now: new Date('2026-10-16T23:50:00Z'), toDate })).toHaveLength(1)
    // Con la zona de España (02:00 del día siguiente) el día cancelado sería otro: por eso el
    // servidor usa la zona del usuario.
    expect(dueReminders([daily], { now: new Date('2026-10-15T23:50:00Z') })).toHaveLength(1)
  })
})

describe('no avisar dos veces', () => {
  it('el mismo aviso tiene siempre la misma clave: tras enviarlo, las siguientes ejecuciones no lo repiten', () => {
    const ev = meeting()
    const sent = new Set()
    const first = unsentReminders(dueReminders([ev], { now: d(9, 28, 9, 50) }), sent)
    expect(first).toHaveLength(1)
    for (const r of first) sent.add(r.key)
    for (const minute of [51, 55, 59]) {
      expect(unsentReminders(dueReminders([ev], { now: d(9, 28, 9, minute) }), sent)).toEqual([])
    }
  })

  it('si la reunión cambia de hora o de aviso, es un aviso nuevo', () => {
    const ev = meeting()
    const sent = new Set(keysOf(dueReminders([ev], { now: d(9, 28, 9, 50) })))
    const moved = meeting({ start: d(9, 28, 10, 30).toISOString(), end: d(9, 28, 11, 30).toISOString() })
    expect(unsentReminders(dueReminders([moved], { now: d(9, 28, 10, 20) }), sent)).toHaveLength(1)
    const longer = meeting({ reminder: 15 })
    expect(unsentReminders(dueReminders([longer], { now: d(9, 28, 9, 50) }), sent)).toHaveLength(1)
  })

  it('cada día de una serie tiene su propio aviso', () => {
    const series = meeting({ recurrence: { freq: 'daily', until: d(10, 30, 23, 59).toISOString() } })
    const monday = dueReminders([series], { now: d(9, 28, 9, 50) })
    const tuesday = dueReminders([series], { now: d(9, 29, 9, 50) })
    expect(monday[0].key).not.toBe(tuesday[0].key)
    expect(monday[0].key).toBe(reminderKey(monday[0].occurrence, 10))
  })
})

describe('contenido de la notificación', () => {
  it('lleva el título, la hora, la hora local de participantes de otro país, la videollamada y abre la reunión', () => {
    const series = meeting({
      participantIds: ['ana', 'luis'],
      meetLink: 'https://meet.google.com/abc-defg-hij',
      recurrence: { freq: 'weekly', until: d(12, 31).toISOString() },
    })
    const [reminder] = dueReminders([series], { now: d(9, 28, 9, 50) })
    const contacts = [
      { id: 'ana', name: 'Ana', timeZone: 'Europe/Madrid', country: 'ES' },
      { id: 'luis', name: 'Luis', timeZone: 'America/Mexico_City', country: 'MX' },
    ]
    const n = reminderNotification(reminder, { contacts, timeZone: 'Europe/Madrid', now: d(9, 28, 9, 50) })
    expect(n.title).toBe('Revisión')
    expect(n.body).toBe('10:00 – 11:00 · empieza en 10 min\nLuis (México): 02:00\nVideollamada: https://meet.google.com/abc-defg-hij')
    expect(n.url).toBe(`/?event=${encodeURIComponent(reminder.occurrence.id)}`)
    expect(n.meetLink).toBe('https://meet.google.com/abc-defg-hij')
    expect(n.tag).toBe(reminder.key)
  })
})

// Descifrado como lo hace el navegador (RFC 8291), para comprobar el cifrado del servidor.
function hkdf(salt, ikm, info, length) {
  const prk = createHmac('sha256', salt).update(ikm).digest()
  return createHmac('sha256', prk).update(Buffer.concat([info, Buffer.from([1])])).digest().subarray(0, length)
}

describe('Web Push', () => {
  it('cifra el mensaje de forma que el navegador lo puede descifrar', async () => {
    const browser = createECDH('prime256v1')
    browser.generateKeys()
    const auth = randomBytes(16)
    const payload = JSON.stringify({ title: 'Reunión', body: 'Empieza en 10 min · €' })
    const body = Buffer.from(
      await encryptPayload(new TextEncoder().encode(payload), { p256dh: bytesToBase64Url(browser.getPublicKey()), auth: bytesToBase64Url(auth) }),
    )

    const salt = body.subarray(0, 16)
    expect(body.readUInt32BE(16)).toBe(4096)
    const serverPublic = body.subarray(21, 21 + body[20])
    const shared = browser.computeSecret(serverPublic)
    const info = Buffer.concat([Buffer.from('WebPush: info\0'), browser.getPublicKey(), serverPublic])
    const ikm = hkdf(auth, shared, info, 32)
    const cek = hkdf(salt, ikm, Buffer.from('Content-Encoding: aes128gcm\0'), 16)
    const nonce = hkdf(salt, ikm, Buffer.from('Content-Encoding: nonce\0'), 12)
    const record = body.subarray(21 + body[20])
    const decipher = createDecipheriv('aes-128-gcm', cek, nonce)
    decipher.setAuthTag(record.subarray(record.length - 16))
    const plain = Buffer.concat([decipher.update(record.subarray(0, record.length - 16)), decipher.final()])
    expect(plain[plain.length - 1]).toBe(2)
    expect(plain.subarray(0, -1).toString()).toBe(payload)
  })
})

describe('disponibilidad de las notificaciones en este dispositivo', () => {
  const ok = {
    syncEnabled: true,
    signedIn: true,
    vapidKey: 'BAAA',
    ios: false,
    standalone: false,
    hasServiceWorker: true,
    hasPushManager: true,
    hasNotification: true,
    permission: 'default',
    hasWorkerScript: true,
  }

  it('explica por qué no se pueden activar', () => {
    expect(pushAvailability(ok)).toEqual({ ok: true })
    expect(pushAvailability({ ...ok, signedIn: false }).reason).toBe('no-sync')
    expect(pushAvailability({ ...ok, permission: 'denied' }).reason).toBe('denied')
    expect(pushAvailability({ ...ok, hasPushManager: false }).reason).toBe('unsupported')
    expect(pushAvailability({ ...ok, vapidKey: '' }).reason).toBe('no-key')
    // iPhone: solo con la app en la pantalla de inicio (iOS 16.4 o posterior).
    const iphone = pushAvailability({ ...ok, ios: true, standalone: false, hasPushManager: false })
    expect(iphone.reason).toBe('ios-install')
    expect(iphone.message).toMatch(/pantalla de inicio.*16\.4/)
    expect(pushAvailability({ ...ok, ios: true, standalone: true }).ok).toBe(true)
    expect(pushAvailability({ ...ok, ios: true, standalone: true, hasPushManager: false }).reason).toBe('ios-old')
  })

  it('pone nombre a cada dispositivo', () => {
    expect(deviceName('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0 Safari/537.36')).toBe(
      'Chrome en Windows',
    )
    expect(deviceName('Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1')).toBe(
      'Safari en iPhone',
    )
    expect(deviceName('Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0 Mobile Safari/537.36')).toBe(
      'Chrome en Android',
    )
  })
})
