// Web Push sin dependencias (solo WebCrypto): funciona en Deno (Edge Functions) y en Node.
//   - Cifrado del mensaje: RFC 8291 (aes128gcm, RFC 8188).
//   - Identificación del servidor: VAPID, RFC 8292 (JWT ES256).
// Claves VAPID en base64url: la pública (65 bytes, punto sin comprimir) y la privada (32 bytes),
// el mismo formato que `npx web-push generate-vapid-keys` o scripts/generate-vapid-keys.mjs.

const encoder = new TextEncoder()
const RECORD_SIZE = 4096

export function base64UrlToBytes(text) {
  const base64 = String(text).replace(/-/g, '+').replace(/_/g, '/')
  const binary = atob(base64 + '='.repeat((4 - (base64.length % 4)) % 4))
  return Uint8Array.from(binary, (c) => c.charCodeAt(0))
}

export function bytesToBase64Url(bytes) {
  let binary = ''
  for (const b of bytes) binary += String.fromCharCode(b)
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

function concat(...parts) {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0))
  let offset = 0
  for (const p of parts) {
    out.set(p, offset)
    offset += p.length
  }
  return out
}

async function hkdf(salt, ikm, info, length) {
  const key = await crypto.subtle.importKey('raw', ikm, 'HKDF', false, ['deriveBits'])
  return new Uint8Array(await crypto.subtle.deriveBits({ name: 'HKDF', hash: 'SHA-256', salt, info }, key, length * 8))
}

/**
 * Cifra `plaintext` (Uint8Array) para una suscripción ({ p256dh, auth } en base64url).
 * `salt` y `serverKeys` solo se pasan en los tests.
 */
export async function encryptPayload(plaintext, { p256dh, auth }, { salt, serverKeys } = {}) {
  const clientPublic = base64UrlToBytes(p256dh)
  const authSecret = base64UrlToBytes(auth)
  const keys = serverKeys || (await crypto.subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveBits']))
  const serverPublic = new Uint8Array(await crypto.subtle.exportKey('raw', keys.publicKey))
  const clientKey = await crypto.subtle.importKey('raw', clientPublic, { name: 'ECDH', namedCurve: 'P-256' }, false, [])
  const shared = new Uint8Array(await crypto.subtle.deriveBits({ name: 'ECDH', public: clientKey }, keys.privateKey, 256))

  const keyInfo = concat(encoder.encode('WebPush: info\0'), clientPublic, serverPublic)
  const ikm = await hkdf(authSecret, shared, keyInfo, 32)
  const recordSalt = salt || crypto.getRandomValues(new Uint8Array(16))
  const cek = await hkdf(recordSalt, ikm, encoder.encode('Content-Encoding: aes128gcm\0'), 16)
  const nonce = await hkdf(recordSalt, ikm, encoder.encode('Content-Encoding: nonce\0'), 12)

  // Un solo registro: el mensaje seguido del delimitador 0x02.
  if (plaintext.length + 17 > RECORD_SIZE) throw new Error('El mensaje es demasiado largo para una notificación.')
  const aesKey = await crypto.subtle.importKey('raw', cek, 'AES-GCM', false, ['encrypt'])
  const ciphertext = new Uint8Array(
    await crypto.subtle.encrypt({ name: 'AES-GCM', iv: nonce }, aesKey, concat(plaintext, new Uint8Array([2]))),
  )

  const header = new Uint8Array(16 + 4 + 1 + serverPublic.length)
  header.set(recordSalt, 0)
  new DataView(header.buffer).setUint32(16, RECORD_SIZE)
  header[20] = serverPublic.length
  header.set(serverPublic, 21)
  return concat(header, ciphertext)
}

/** Cabecera Authorization de VAPID para el servicio push de `endpoint`. */
export async function vapidAuthorization(endpoint, { publicKey, privateKey, subject }, { expiration } = {}) {
  const publicBytes = base64UrlToBytes(publicKey)
  const jwk = {
    kty: 'EC',
    crv: 'P-256',
    x: bytesToBase64Url(publicBytes.slice(1, 33)),
    y: bytesToBase64Url(publicBytes.slice(33, 65)),
    d: privateKey,
  }
  const key = await crypto.subtle.importKey('jwk', jwk, { name: 'ECDSA', namedCurve: 'P-256' }, false, ['sign'])
  const encode = (obj) => bytesToBase64Url(encoder.encode(JSON.stringify(obj)))
  const claims = {
    aud: new URL(endpoint).origin,
    exp: expiration ?? Math.floor(Date.now() / 1000) + 12 * 3600,
    sub: subject,
  }
  const unsigned = `${encode({ typ: 'JWT', alg: 'ES256' })}.${encode(claims)}`
  const signature = new Uint8Array(await crypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, key, encoder.encode(unsigned)))
  return `vapid t=${unsigned}.${bytesToBase64Url(signature)}, k=${publicKey}`
}

/**
 * Petición para enviar `payload` (objeto, va como JSON) a una suscripción
 * ({ endpoint, keys: { p256dh, auth } }). `ttl`: segundos que el servicio push la guarda si el
 * dispositivo está apagado.
 */
export async function buildPushRequest(subscription, payload, vapid, { ttl = 3600, urgency = 'high' } = {}) {
  const body = await encryptPayload(encoder.encode(JSON.stringify(payload)), subscription.keys)
  return {
    url: subscription.endpoint,
    init: {
      method: 'POST',
      headers: {
        Authorization: await vapidAuthorization(subscription.endpoint, vapid),
        'Content-Encoding': 'aes128gcm',
        'Content-Type': 'application/octet-stream',
        TTL: String(ttl),
        Urgency: urgency,
      },
      body,
    },
  }
}

// Envía la notificación. Devuelve la respuesta del servicio push (404/410: suscripción caducada).
export async function sendWebPush(subscription, payload, vapid, options) {
  const { url, init } = await buildPushRequest(subscription, payload, vapid, options)
  return fetch(url, init)
}
