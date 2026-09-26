// Edge Function "send-reminders": recordatorios antes de cada reunión por Web Push.
//
// - Cada minuto la llama pg_cron (supabase/cron.sql) con la cabecera x-cron-secret: busca las
//   reuniones que empiezan dentro del tiempo de aviso de cada usuario con dispositivos
//   suscritos y envía el aviso a todos sus dispositivos. Cada aviso se apunta en reminders_sent
//   antes de enviarlo, así nunca se envía dos veces (aunque dos ejecuciones coincidan).
// - Desde la app (Ajustes → Recordatorios), con la sesión del usuario: { action: 'test' } envía
//   una notificación de prueba a sus dispositivos.
//
// Secretos (Supabase → Edge Functions → Secrets): VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY,
// VAPID_SUBJECT (mailto:…) y CRON_SECRET. SUPABASE_URL y SUPABASE_SERVICE_ROLE_KEY los pone Supabase.
// Se despliega con --no-verify-jwt: la función comprueba ella misma el secreto o la sesión.

import { createClient } from '@supabase/supabase-js'
import { TZDate } from '@date-fns/tz'
import {
  TEST_NOTIFICATION,
  dueReminders,
  normalizeDefaultMinutes,
  reminderNotification,
} from '../_shared/reminders.js'
import { sendWebPush } from '../_shared/webpush.js'

const env = (name: string) => Deno.env.get(name) ?? ''

const admin = createClient(env('SUPABASE_URL'), env('SUPABASE_SERVICE_ROLE_KEY'), {
  auth: { persistSession: false, autoRefreshToken: false },
})

const vapid = {
  publicKey: env('VAPID_PUBLIC_KEY'),
  privateKey: env('VAPID_PRIVATE_KEY'),
  subject: env('VAPID_SUBJECT'),
}

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...CORS, 'Content-Type': 'application/json' } })
}

type Subscription = {
  user_id: string
  id: string
  endpoint: string
  p256dh: string
  auth: string
  time_zone: string | null
}

// Todas las filas de una consulta (PostgREST devuelve como mucho 1000 por petición).
async function fetchAll(build: () => any) {
  const rows: any[] = []
  for (let from = 0; ; from += 1000) {
    const { data, error } = await build().range(from, from + 999)
    if (error) throw error
    rows.push(...(data ?? []))
    if (!data || data.length < 1000) return rows
  }
}

// Envía a todos los dispositivos; borra las suscripciones que el servicio push da por caducadas.
async function sendToDevices(subs: Subscription[], payload: unknown) {
  let sent = 0
  let removed = 0
  const errors: string[] = []
  for (const sub of subs) {
    try {
      const res = await sendWebPush({ endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } }, payload, vapid)
      if (res.ok) sent++
      else if (res.status === 404 || res.status === 410) {
        await admin.from('push_subscriptions').delete().eq('user_id', sub.user_id).eq('id', sub.id)
        removed++
      } else errors.push(`${res.status} ${await res.text()}`.slice(0, 200))
    } catch (err) {
      errors.push(String((err as Error)?.message ?? err))
    }
  }
  return { sent, removed, errors }
}

async function remindUser(userId: string, subs: Subscription[], now: Date) {
  const [eventRows, contactRows, prefs] = await Promise.all([
    fetchAll(() => admin.from('events').select('id, data').eq('user_id', userId).is('deleted_at', null).order('id')),
    fetchAll(() => admin.from('contacts').select('id, data').eq('user_id', userId).is('deleted_at', null).order('id')),
    admin.from('settings').select('data').eq('user_id', userId).eq('id', 'preferences').is('deleted_at', null).maybeSingle(),
  ])
  const reminders = prefs.data?.data?.reminders ?? {}
  const timeZone = reminders.timeZone || subs.find((s) => s.time_zone)?.time_zone || 'Europe/Madrid'
  const events = eventRows.map((row) => ({ ...row.data, id: row.id }))
  const contacts = contactRows.map((row) => ({
    id: row.id,
    name: row.data?.name ?? '',
    timeZone: row.data?.timeZone ?? null,
    country: row.data?.country ?? null,
  }))

  const due = dueReminders(events, {
    now,
    defaultMinutes: normalizeDefaultMinutes(reminders.defaultMinutes),
    toDate: (value: string | number | Date) => new TZDate(new Date(value).getTime(), timeZone),
  })

  let sent = 0
  for (const reminder of due) {
    // Se apunta antes de enviarlo: si ya estaba, otra ejecución lo ha enviado.
    const { data: inserted, error } = await admin
      .from('reminders_sent')
      .upsert({ user_id: userId, key: reminder.key }, { onConflict: 'user_id,key', ignoreDuplicates: true })
      .select('key')
    if (error) throw error
    if (!inserted || inserted.length === 0) continue
    const result = await sendToDevices(subs, reminderNotification(reminder, { contacts, timeZone, now }))
    sent += result.sent
  }
  return { due: due.length, sent }
}

async function runCron(now: Date) {
  const subs: Subscription[] = await fetchAll(() => admin.from('push_subscriptions').select('*').order('user_id').order('id'))
  const byUser = new Map<string, Subscription[]>()
  for (const sub of subs) byUser.set(sub.user_id, [...(byUser.get(sub.user_id) ?? []), sub])

  const results: Record<string, unknown> = {}
  for (const [userId, list] of byUser) {
    try {
      results[userId] = await remindUser(userId, list, now)
    } catch (err) {
      results[userId] = { error: String((err as Error)?.message ?? err) }
    }
  }
  // Los avisos ya pasados no hace falta recordarlos más de dos días.
  await admin.from('reminders_sent').delete().lt('sent_at', new Date(now.getTime() - 2 * 86400000).toISOString())
  return { users: byUser.size, results }
}

async function runTest(req: Request, body: { subscriptionId?: string }) {
  const token = (req.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '')
  const { data, error } = await admin.auth.getUser(token)
  if (error || !data?.user) return json({ error: 'Inicia sesión para enviar la prueba.' }, 401)
  let query = admin.from('push_subscriptions').select('*').eq('user_id', data.user.id)
  if (body.subscriptionId) query = query.eq('id', body.subscriptionId)
  const { data: subs, error: subsError } = await query
  if (subsError) throw subsError
  if (!subs || subs.length === 0) return json({ sent: 0, devices: 0, error: 'No hay dispositivos con los avisos activados.' })
  const result = await sendToDevices(subs, TEST_NOTIFICATION)
  return json({ devices: subs.length, ...result })
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })
  try {
    if (!vapid.publicKey || !vapid.privateKey || !vapid.subject) {
      return json({ error: 'Faltan los secretos VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY o VAPID_SUBJECT.' }, 500)
    }
    const body = await req.json().catch(() => ({}))
    if (body?.action === 'test') return await runTest(req, body)

    const secret = env('CRON_SECRET')
    if (!secret || req.headers.get('x-cron-secret') !== secret) return json({ error: 'No autorizado.' }, 401)
    return json(await runCron(new Date()))
  } catch (err) {
    return json({ error: String((err as Error)?.message ?? err) }, 500)
  }
})
