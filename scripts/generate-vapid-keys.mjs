// Genera un par de claves VAPID para los recordatorios (Web Push):  node scripts/generate-vapid-keys.mjs
//   - La pública va en la app: variable VITE_VAPID_PUBLIC_KEY (Vercel y .env.local) y en el
//     secreto VAPID_PUBLIC_KEY de la Edge Function.
//   - La privada solo en Supabase, en el secreto VAPID_PRIVATE_KEY. Nunca en el repositorio.
// Si se cambian, cada dispositivo tiene que volver a activar los avisos.
import { webcrypto } from 'node:crypto'

const toBase64Url = (bytes) => Buffer.from(bytes).toString('base64url')

const { publicKey, privateKey } = await webcrypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify'])
const publicRaw = new Uint8Array(await webcrypto.subtle.exportKey('raw', publicKey))
const { d } = await webcrypto.subtle.exportKey('jwk', privateKey)

console.log(`Clave pública  (VITE_VAPID_PUBLIC_KEY y VAPID_PUBLIC_KEY):\n${toBase64Url(publicRaw)}\n`)
console.log(`Clave privada  (solo VAPID_PRIVATE_KEY en Supabase):\n${d}\n`)
console.log(`Secreto para pg_cron (CRON_SECRET y cesi_cron_secret en Vault):\n${toBase64Url(webcrypto.getRandomValues(new Uint8Array(24)))}`)
