// Pantalla «Vacantes» (parte 38), con el diseño de Cursos. Las vacantes son las de siempre
// (cesi_vacancies_v1 / tabla vacancies, ver vacancies.js), con estos campos:
//   { id, title, area, description, requirements, hoursPerWeek ('3-5 h'), seats (número o null),
//     status: 'abierta' | 'en_pausa' | 'cerrada', openedAt ('AAAA-MM-DD'), closesAt (o ''),
//     internalNotes, createdBy, createdAt, updatedAt }
// Las antiguas tienen status 'open' / 'in_progress' (se leen como abierta) o 'filled' (cerrada).

export const VACANCY_AREAS = ['Directivo', 'Profesor', 'Alianzas', 'RRHH', 'Finanzas', 'Legal', 'Media', 'Técnico', 'Ciberseguridad', 'Moderación']
export const VACANCY_STATUSES = [
  { id: 'abierta', label: 'Abierta' },
  { id: 'en_pausa', label: 'En pausa' },
  { id: 'cerrada', label: 'Cerrada' },
]
export const VACANCY_STATUS_LABEL = Object.fromEntries(VACANCY_STATUSES.map((s) => [s.id, s.label]))
export const VACANCY_FILTERS = [{ id: '', label: 'Todas' }, { id: 'abierta', label: 'Abiertas' }, { id: 'en_pausa', label: 'En pausa' }, { id: 'cerrada', label: 'Cerradas' }]
export const MAX_SEATS = 1000
export const TITLE_MAX = 120
const DAY = /^\d{4}-\d{2}-\d{2}$/

const OLD_STATUS = { open: 'abierta', in_progress: 'abierta', filled: 'cerrada' }

export function vacancyStatus(status) {
  return VACANCY_STATUS_LABEL[status] ? status : OLD_STATUS[status] || 'abierta'
}

// Vacante con todos sus campos (las antiguas, con su valor por defecto).
export function normalizeVacancy(v) {
  const seats = Number(v?.seats)
  return {
    ...v,
    title: v?.title || '',
    area: v?.area || '',
    description: v?.description || '',
    requirements: v?.requirements || '',
    hoursPerWeek: v?.hoursPerWeek || '',
    seats: Number.isInteger(seats) && seats >= 1 && seats <= MAX_SEATS ? seats : null,
    status: vacancyStatus(v?.status),
    openedAt: DAY.test(v?.openedAt || '') ? v.openedAt : '',
    closesAt: DAY.test(v?.closesAt || '') ? v.closesAt : '',
    internalNotes: v?.internalNotes || '',
    createdBy: v?.createdBy || '',
  }
}

export function todayKey(now = new Date()) {
  const p = (n) => String(n).padStart(2, '0')
  return `${now.getFullYear()}-${p(now.getMonth() + 1)}-${p(now.getDate())}`
}

export function emptyVacancyForm(now = new Date()) {
  return { title: '', area: '', description: '', requirements: '', hoursPerWeek: '', seats: '', status: 'abierta', openedAt: todayKey(now), closesAt: '', internalNotes: '' }
}

export function formFromVacancy(v) {
  const n = normalizeVacancy(v)
  return { title: n.title, area: n.area, description: n.description, requirements: n.requirements, hoursPerWeek: n.hoursPerWeek, seats: n.seats === null ? '' : String(n.seats), status: n.status, openedAt: n.openedAt, closesAt: n.closesAt, internalNotes: n.internalNotes }
}

// Lo que se guarda a partir del formulario.
export function dataFromForm(form) {
  const seats = String(form.seats ?? '').trim()
  return {
    title: form.title.trim(),
    area: form.area,
    description: form.description.trim(),
    requirements: form.requirements.trim(),
    hoursPerWeek: form.hoursPerWeek.trim(),
    seats: seats === '' ? null : Number(seats),
    status: form.status,
    openedAt: form.openedAt,
    closesAt: form.closesAt || '',
    internalNotes: form.internalNotes.trim(),
  }
}

// Error del formulario o null (lo mismo que comprueba la base de datos).
export function validateVacancy(form) {
  const title = (form.title || '').trim()
  if (!title) return 'Escribe el título.'
  if (title.length > TITLE_MAX) return `El título puede tener como mucho ${TITLE_MAX} caracteres.`
  if (!VACANCY_AREAS.includes(form.area)) return 'Elige el área.'
  if (!VACANCY_STATUS_LABEL[form.status]) return 'Elige el estado.'
  const seats = String(form.seats ?? '').trim()
  if (seats !== '' && !(Number.isInteger(Number(seats)) && Number(seats) >= 1 && Number(seats) <= MAX_SEATS)) return `Las plazas van de 1 a ${MAX_SEATS}.`
  if ((form.hoursPerWeek || '').trim().length > 40) return 'Las horas por semana, como mucho 40 caracteres.'
  if (!DAY.test(form.openedAt || '')) return 'Pon la fecha de publicación.'
  if (form.closesAt && (!DAY.test(form.closesAt) || form.closesAt < form.openedAt)) return 'La fecha de cierre tiene que ser posterior a la de publicación.'
  return null
}

// Filtros: estado ('' todas), área ('' todas) y búsqueda por título o área.
export function filterVacancies(list, { status = '', area = '', query = '' } = {}) {
  const q = query.trim().toLocaleLowerCase('es')
  return list
    .map(normalizeVacancy)
    .filter((v) => (!status || v.status === status) && (!area || v.area === area) && (!q || `${v.title} ${v.area}`.toLocaleLowerCase('es').includes(q)))
    .sort((a, b) => {
      const order = { abierta: 0, en_pausa: 1, cerrada: 2 }
      return order[a.status] - order[b.status] || (b.openedAt || '').localeCompare(a.openedAt || '') || a.title.localeCompare(b.title, 'es')
    })
}

// «2 plazas», «Plazas sin indicar».
export function seatsText(v) {
  return v.seats === null ? 'Plazas sin indicar' : `${v.seats} ${v.seats === 1 ? 'plaza' : 'plazas'}`
}

export function dayLabel(key) {
  if (!DAY.test(key || '')) return ''
  const [y, m, d] = key.split('-').map(Number)
  return new Intl.DateTimeFormat('es-ES', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' }).format(new Date(Date.UTC(y, m - 1, d))).replace('.', '')
}

// ¿Puede esta persona de equipo usar Vacantes? (Directivo o RRHH; la ceo, siempre)
export const VACANCY_AREA_IDS = ['direccion', 'personas']
export const canUseVacancies = (area) => VACANCY_AREA_IDS.includes(area)

// Llamadas para Directivo y RRHH (la ceo usa su app, como siempre).
async function rpc(client, name, args = {}) {
  const { data, error } = await client.rpc(name, args)
  if (error) throw error
  return data
}
export const listTeamVacancies = (client) => rpc(client, 'cesi_vacancies_list').then((rows) => (rows || []).map((r) => ({ ...r.data, id: r.id })))
export const saveTeamVacancy = (client, id, data) => rpc(client, 'cesi_vacancy_save', { p_id: id, p_data: data })
export const deleteTeamVacancy = (client, id) => rpc(client, 'cesi_vacancy_delete', { p_id: id })

export function vacancyErrorText(err) {
  if (err?.code === 'PGRST202' || err?.code === '42883') return 'Falta ejecutar en Supabase el SQL de la parte 38 (supabase/parte38_vacantes.sql).'
  if (err?.code === '42501') return 'No tienes acceso a Vacantes.'
  return err?.message || 'No se pudo guardar.'
}
