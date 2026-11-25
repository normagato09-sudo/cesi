// Aviso diario de CIFA a Mi Oficina (lo llama Vercel Cron cada mañana, ver vercel.json).
//   cifa-reuniones     reuniones de hoy (notificación) + un recordatorio 15 minutos antes de cada una
//   cifa-inscripciones alumnos nuevos de las últimas 24 h y solicitudes para unirse a un curso
//   cifa-cursos        clases de hoy según el horario de cada curso
// Lee Supabase con la clave de servicio (solo en el servidor, nunca en la app).
// Variables en Vercel: SUPABASE_SERVICE_ROLE_KEY, MI_OFICINA_URL, MI_OFICINA_CLAVE
// (y VITE_SUPABASE_URL, que ya existe). Opcional: CRON_SECRET.

process.env.TZ = 'Europe/Madrid' // las reuniones se calculan en hora de España

import { expandEvents } from '../src/lib/recurrence.js'

const DIAS = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado']
const dosCifras = (n) => String(n).padStart(2, '0')
const fechaISO = (d) => `${d.getFullYear()}-${dosCifras(d.getMonth() + 1)}-${dosCifras(d.getDate())}`
const horaDe = (d) => `${dosCifras(d.getHours())}:${dosCifras(d.getMinutes())}`

async function supabase(ruta) {
  const url = (process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || '').replace(/\/$/, '')
  const clave = process.env.SUPABASE_SERVICE_ROLE_KEY
  const r = await fetch(`${url}/rest/v1/${ruta}`, {
    headers: { apikey: clave, Authorization: `Bearer ${clave}` },
    signal: AbortSignal.timeout(8000),
  })
  if (!r.ok) throw new Error(`Supabase ${r.status} en ${ruta.split('?')[0]}`)
  return r.json()
}

async function miOficina(ruta, cuerpo) {
  const base = (process.env.MI_OFICINA_URL || '').replace(/\/$/, '')
  await fetch(`${base}${ruta}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${process.env.MI_OFICINA_CLAVE}` },
    body: JSON.stringify(cuerpo),
    signal: AbortSignal.timeout(5000),
  }).catch(() => {})
}
const avisar = (agente, nivel, titulo, texto = '') => miOficina('/api/eventos', { agente, nivel, titulo: titulo.slice(0, 200), texto })

export async function GET(request) {
  const secreto = process.env.CRON_SECRET
  if (secreto && request.headers.get('authorization') !== `Bearer ${secreto}`) {
    return Response.json({ error: 'No permitido' }, { status: 401 })
  }
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY || !process.env.MI_OFICINA_URL || !process.env.MI_OFICINA_CLAVE) {
    return Response.json({ ok: true, nota: 'Falta configurar las variables' })
  }

  try {
    const [ceo] = await supabase('profiles?select=id&role=eq.ceo&limit=1')
    if (!ceo) return Response.json({ ok: true, nota: 'No hay cuenta de CEO' })
    const filtro = `deleted_at=is.null&user_id=eq.${ceo.id}`
    const [eventos, alumnos, cursos] = await Promise.all([
      supabase(`events?select=id,data&${filtro}`),
      supabase(`students?select=id,data&${filtro}`),
      supabase(`courses?select=id,data&${filtro}`),
    ])

    const ahora = new Date()
    const hoy = new Date(ahora.getFullYear(), ahora.getMonth(), ahora.getDate())
    const manana = new Date(hoy.getTime() + 36 * 3600 * 1000)
    manana.setHours(0, 0, 0, 0)
    const resultado = { reuniones: 0, inscripciones: 0, clases: 0 }

    // --- Reuniones de hoy ---
    const reuniones = expandEvents(
      eventos.map((e) => ({ ...e.data, id: e.id })).filter((e) => e.start && e.end && !e.isUnavailable),
      hoy,
      manana,
    )
      .filter((r) => !r.notAttending && new Date(r.start) >= hoy)
      .sort((a, b) => new Date(a.start) - new Date(b.start))
    resultado.reuniones = reuniones.length
    if (reuniones.length) {
      const linea = (r) => `• ${r.allDay ? 'Todo el día' : horaDe(new Date(r.start))} · ${r.title || 'Reunión'}`
      await avisar(
        'cifa-reuniones',
        'importante',
        reuniones.length === 1 ? `Hoy tienes reunión: ${reuniones[0].title || 'Reunión'}${reuniones[0].allDay ? '' : ` a las ${horaDe(new Date(reuniones[0].start))}`}` : `Hoy tienes ${reuniones.length} reuniones de CIFA`,
        reuniones.map(linea).join('\n'),
      )
      for (const r of reuniones) {
        if (r.allDay) continue
        const inicio = new Date(r.start)
        const aviso = new Date(inicio.getTime() - 15 * 60 * 1000)
        if (aviso <= ahora) continue
        await miOficina('/api/recordatorios', {
          agente: 'cifa-reuniones',
          fecha: fechaISO(aviso),
          hora: horaDe(aviso),
          texto: `En 15 minutos: ${r.title || 'Reunión'} (${horaDe(inicio)})${r.meetLink ? ` · ${r.meetLink}` : ''}`,
        })
      }
    }

    // --- Inscripciones ---
    const nombreCurso = new Map(cursos.map((c) => [c.id, c.data?.name || 'Curso']))
    const haceUnDia = ahora.getTime() - 24 * 3600 * 1000
    const nuevos = alumnos.filter((a) => a.data?.createdAt && new Date(a.data.createdAt).getTime() >= haceUnDia)
    const piden = alumnos.filter((a) => Array.isArray(a.data?.requestedCourseIds) && a.data.requestedCourseIds.length > 0)
    resultado.inscripciones = nuevos.length + piden.length
    if (nuevos.length) {
      await avisar(
        'cifa-inscripciones',
        'importante',
        nuevos.length === 1 ? `Alumno nuevo: ${nuevos[0].data.name || 'sin nombre'}` : `${nuevos.length} alumnos nuevos desde ayer`,
        nuevos.map((a) => `• ${a.data.name || 'Sin nombre'}${(a.data.courseIds || []).length ? ` → ${a.data.courseIds.map((id) => nombreCurso.get(id) || 'curso').join(', ')}` : ''}`).join('\n'),
      )
    }
    if (piden.length) {
      await avisar(
        'cifa-inscripciones',
        'normal',
        `${piden.length} ${piden.length === 1 ? 'alumno espera' : 'alumnos esperan'} que apruebes su inscripción`,
        piden.map((a) => `• ${a.data.name || 'Sin nombre'} → ${a.data.requestedCourseIds.map((id) => nombreCurso.get(id) || 'curso').join(', ')}`).join('\n'),
      )
    }

    // --- Clases de hoy ---
    const dia = hoy.getDay()
    const hoyISO = fechaISO(hoy)
    const clases = cursos.flatMap((c) => {
      const h = c.data?.schedule
      if (!h || !Array.isArray(h.slots) || (h.since && h.since > hoyISO)) return []
      return h.slots
        .filter((s) => s.day === dia)
        .map((s) => ({
          curso: c.data.name || 'Curso',
          hora: s.start,
          zona: h.timeZone && h.timeZone !== 'Europe/Madrid' ? ` (hora de ${h.timeZone.split('/').pop().replace(/_/g, ' ')})` : '',
          inscritos: alumnos.filter((a) => (a.data?.courseIds || []).includes(c.id)).length,
        }))
    }).sort((a, b) => a.hora.localeCompare(b.hora))
    resultado.clases = clases.length
    if (clases.length) {
      await avisar(
        'cifa-cursos',
        'normal',
        clases.length === 1 ? `Hoy (${DIAS[dia]}) hay clase de ${clases[0].curso} a las ${clases[0].hora}` : `Hoy hay ${clases.length} clases en CIFA`,
        clases.map((c) => `• ${c.hora}${c.zona} · ${c.curso} · ${c.inscritos} ${c.inscritos === 1 ? 'alumno' : 'alumnos'}`).join('\n'),
      )
    }

    return Response.json({ ok: true, ...resultado })
  } catch (error) {
    console.error('aviso-diario', error)
    return Response.json({ error: 'No se pudo preparar el aviso' }, { status: 500 })
  }
}
