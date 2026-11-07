// Candidaturas a las vacantes (parte 40, supabase/parte40_candidaturas.sql). Todo pasa por
// funciones de Supabase que comprueban quién llama: la tabla está cerrada a todos.
//   · Alumnos y equipo: cesi_vacancy_apply (desde la app) y cesi_my_applications (las suyas).
//   · Sin cuenta: cesi_public_apply (página pública /vacantes, ver src/vacantes).
//   · La ceo y RRHH: cesi_vacancy_applications, cesi_vacancy_application_counts y
//     cesi_application_set_status. Solo la ceo: cesi_applications_unseen (sus avisos) y
//     cesi_applications_mark_seen.

export const APPLICATION_STATUSES = [
  { id: 'nueva', label: 'Nueva' },
  { id: 'vista', label: 'Vista' },
  { id: 'entrevista', label: 'Entrevista' },
  { id: 'aceptada', label: 'Aceptada' },
  { id: 'descartada', label: 'Descartada' },
]
export const APPLICATION_STATUS_LABEL = Object.fromEntries(APPLICATION_STATUSES.map((s) => [s.id, s.label]))

// ¿Puede esta persona de equipo ver las candidaturas? (RRHH; la ceo, siempre. Directivo no.)
export const canSeeApplications = (area) => area === 'personas'

export const LIMITS = { name: 120, email: 200, discord: 80, motivation: 2000, experience: 2000, availability: 500 }
const EMAIL = /^[^@\s]+@[^@\s]+\.[^@\s]+$/

export function emptyApplication({ email = '', discord = '' } = {}) {
  return { motivation: '', experience: '', availability: '', discord: discord || '', email: email || '', name: '', consent: false, website: '' }
}

// Error del formulario (o null). publicForm: la página pública (nombre, correo y consentimiento).
export function validateApplication(form, { publicForm = false } = {}) {
  const t = (k) => (form[k] || '').trim()
  if (publicForm && t('name').length < 2) return 'Escribe tu nombre.'
  if (publicForm && !EMAIL.test(t('email'))) return 'Escribe un correo válido.'
  if (!publicForm && t('email') && !EMAIL.test(t('email'))) return 'El correo no es válido.'
  if (!t('motivation')) return 'Cuéntanos por qué te interesa.'
  for (const k of Object.keys(LIMITS)) if (t(k).length > LIMITS[k]) return `Demasiado largo (como mucho ${LIMITS[k]} caracteres).`
  if (publicForm && !form.consent) return 'Marca la casilla para aceptar el uso de tus datos.'
  return null
}

// Lo que se envía a cesi_vacancy_apply / cesi_public_apply.
export function applyArgs(vacancyId, form) {
  const t = (k) => (form[k] || '').trim()
  return {
    p_vacancy: vacancyId,
    p_motivation: t('motivation'),
    p_experience: t('experience'),
    p_availability: t('availability'),
    p_discord: t('discord').replace(/^@/, ''),
    p_email: t('email'),
  }
}
export function publicApplyArgs(vacancyId, form) {
  return { ...applyArgs(vacancyId, form), p_name: (form.name || '').trim(), p_consent: !!form.consent, p_website: form.website || '' }
}

export function applyResultText(result) {
  if (result?.status === 'duplicate') return 'Ya habías enviado tu candidatura a esta vacante.'
  if (result?.status === 'limit') return 'Has enviado demasiadas candidaturas seguidas. Inténtalo más tarde.'
  return null
}

async function rpc(client, name, args = {}) {
  const { data, error } = await client.rpc(name, args)
  if (error) throw error
  return data
}

export const applyToVacancy = (client, vacancyId, form) => rpc(client, 'cesi_vacancy_apply', applyArgs(vacancyId, form))
// Las mías: Map(vacante → { id, status, created_at, title }).
export const myApplications = (client) => rpc(client, 'cesi_my_applications').then((rows) => new Map((rows || []).map((a) => [a.vacancy_id, a])))
export const listApplications = (client, vacancyId) => rpc(client, 'cesi_vacancy_applications', { p_vacancy: vacancyId }).then((rows) => rows || [])
// Map(vacante → { total, unseen }).
export const applicationCounts = (client) =>
  rpc(client, 'cesi_vacancy_application_counts').then((rows) => new Map((rows || []).map((r) => [r.vacancy_id, { total: r.total, unseen: r.unseen }])))
export const setApplicationStatus = (client, id, status) => rpc(client, 'cesi_application_set_status', { p_id: id, p_status: status })
export const unseenApplications = (client) => rpc(client, 'cesi_applications_unseen').then((n) => Number(n) || 0)
export const markApplicationsSeen = (client, vacancyId) => rpc(client, 'cesi_applications_mark_seen', { p_vacancy: vacancyId })

export function applicationErrorText(err) {
  if (err?.code === 'PGRST202' || err?.code === '42883' || err?.code === '42P01') return 'Falta ejecutar en Supabase el SQL de la parte 40 (supabase/parte40_candidaturas.sql).'
  if (err?.code === '42501') return err.message || 'No tienes acceso.'
  return err?.message || 'No se pudo completar. Comprueba la conexión.'
}
