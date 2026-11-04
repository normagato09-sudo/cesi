// Testimonios (parte 33): valoraciones de 1 a 5 estrellas de alumnos, equipo y ceo, por curso o
// «General (CIFA)». Una por persona y curso. Funciones puras para TestimonialsView y las llamadas.
//
// Valoración (cesi_testimonials): { id, rating, body, course_id ('' = General), course_name,
//   author_name, author_role, kind: 'alumno'|'equipo'|'ceo', mine, can_delete, created_at,
//   updated_at }

export const BODY_MAX = 1000
export const GENERAL = '' // course_id de «General (CIFA)»
export const GENERAL_LABEL = 'General (CIFA)'
export const SORTS = [
  { id: 'recent', label: 'Más recientes' },
  { id: 'best', label: 'Mejor valoradas' },
  { id: 'worst', label: 'Peor valoradas' },
]
export const WHO = [
  { id: 'all', label: 'Todos' },
  { id: 'alumno', label: 'Alumnos' },
  { id: 'equipo', label: 'Equipo' },
]

// Media con una cifra decimal y coma («4,8»), número y cuántas hay de cada puntuación (de 5 a 1).
export function summarize(list) {
  const count = list.length
  const total = list.reduce((n, t) => n + t.rating, 0)
  const average = count ? Math.round((total / count) * 10) / 10 : null
  const dist = [5, 4, 3, 2, 1].map((stars) => {
    const n = list.filter((t) => t.rating === stars).length
    return { stars, count: n, percent: count ? Math.round((n / count) * 100) : 0 }
  })
  return { average, averageText: average === null ? '—' : average.toFixed(1).replace('.', ','), count, dist }
}

// «12 valoraciones», «1 valoración».
export function countText(n) {
  return `${n} ${n === 1 ? 'valoración' : 'valoraciones'}`
}

// Filtros del ordenador: quién (todos, alumnos o equipo, con la ceo) y curso ('' todos; GENERAL
// es «General (CIFA)», que aquí va como 'general').
export function filterTestimonials(list, { who = 'all', course = 'all' } = {}) {
  return list.filter((t) => {
    if (who === 'alumno' && t.kind !== 'alumno') return false
    if (who === 'equipo' && t.kind === 'alumno') return false
    if (course === 'all') return true
    return course === 'general' ? t.course_id === GENERAL : t.course_id === course
  })
}

const time = (t) => new Date(t.updated_at || t.created_at).getTime()

export function sortTestimonials(list, sort = 'recent') {
  const out = [...list]
  if (sort === 'best') out.sort((a, b) => b.rating - a.rating || time(b) - time(a))
  else if (sort === 'worst') out.sort((a, b) => a.rating - b.rating || time(b) - time(a))
  else out.sort((a, b) => time(b) - time(a))
  return out
}

// Cursos que salen en el filtro: los que tienen alguna valoración, por nombre (sin General).
export function coursesInList(list) {
  const byId = new Map()
  for (const t of list) if (t.course_id !== GENERAL && !byId.has(t.course_id)) byId.set(t.course_id, t.course_name)
  return [...byId.entries()].map(([id, name]) => ({ id, name })).sort((a, b) => a.name.localeCompare(b.name, 'es', { sensitivity: 'base' }))
}

// «2 nov 2026» (o «hoy»).
export function dateText(iso, now = new Date()) {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  if (d.toDateString() === now.toDateString()) return 'hoy'
  return new Intl.DateTimeFormat('es-ES', { day: 'numeric', month: 'short', year: 'numeric' }).format(d).replace('.', '')
}

// «Alumno · Office», «Profesor · Office», «CEO · General (CIFA)».
export function roleLine(t) {
  return `${t.author_role} · ${t.course_name}`
}

// Mi valoración de ese curso (para cambiarla en vez de crear otra), o null.
export function myTestimonial(list, courseId) {
  return list.find((t) => t.mine && t.course_id === courseId) || null
}

// Error del formulario o null.
export function validateTestimonial({ rating, body }) {
  if (!Number.isInteger(rating) || rating < 1 || rating > 5) return 'Elige de 1 a 5 estrellas.'
  if ((body || '').trim().length > BODY_MAX) return `El texto puede tener como mucho ${BODY_MAX} caracteres.`
  return null
}

async function rpc(client, name, args = {}) {
  const { data, error } = await client.rpc(name, args)
  if (error) throw error
  return data
}
export const listTestimonials = (client) => rpc(client, 'cesi_testimonials').then((rows) => rows || [])
export const listTestimonialCourses = (client) => rpc(client, 'cesi_testimonial_courses').then((rows) => rows || [])
export const saveTestimonial = (client, { course, rating, body }) =>
  rpc(client, 'cesi_testimonial_save', { p_course: course || '', p_rating: rating, p_body: (body || '').trim() })
export const deleteTestimonial = (client, id) => rpc(client, 'cesi_testimonial_delete', { p_id: id })

export function testimonialErrorText(err) {
  if (err?.code === 'PGRST202' || err?.code === '42883') return 'Los testimonios aún no están disponibles. Inténtalo más tarde.'
  return err?.message || 'No se pudo guardar.'
}
