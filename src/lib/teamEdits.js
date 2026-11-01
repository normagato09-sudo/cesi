import { validateContactCountry } from './contacts'
import { planCandidacy } from './applications'
import { statusChangePatch, markFormerProfile } from './formerMembers'
import { unarchivePatch } from './archive'
import { acceptedTeamProfile, candidaciesOf, candidacyPatch, incorporate, newCandidacy, newVacancy, withStatus } from './vacancies'
import { validateCourse } from './courses'
import { extraClassTimes, validateExtraClass } from './attendance'

// RRHH y Directivo editan mis datos (parte 20): los cambios se calculan con la misma lógica que mi
// app (incorporate, planCandidacy, markFormerProfile, validateCourse…) y se guardan con
// cesi_ceo_doc_patch, que comprueba quién puede tocar qué y escribe en mis tablas. Solo se envían
// los campos que cambian y cómo estaban al abrir la ficha: si otro los ha cambiado mientras tanto,
// no se guarda nada (y hay que volver a cargar). Me llegan como un cambio de otro dispositivo.

// Pasar a antiguo miembro lo archiva y volver al equipo lo desarchiva (como en mi app).
export function withStatusChange(contact, patch) {
  const out = { ...patch, ...statusChangePatch({ before: contact.teamProfile, after: patch.teamProfile }) }
  if (contact.archived && out.teamProfile && out.teamProfile.status !== 'former') Object.assign(out, unarchivePatch())
  return out
}

const same = (a, b) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null)

// Solo los campos que cambian de verdad respecto a `doc`.
export function changedFields(doc, patch) {
  return Object.fromEntries(Object.entries(patch).filter(([k, v]) => !same(doc?.[k], v)))
}

// Cómo estaban esos campos (en el documento tal como está en el servidor: `raw`).
export function beforeOf(raw, patch) {
  return Object.fromEntries(Object.keys(patch).map((k) => [k, raw?.[k] ?? null]))
}

// Contacto nuevo con los mismos campos por defecto que createContact.
export function newContactDoc(data) {
  const problem = validateContactCountry(data)
  if (problem) throw new Error(problem)
  return { name: '', email: '', phone: '', organization: '', role: '', notes: '', country: '', timeZone: '', ...data }
}

function makeId() {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID()
  return `doc_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`
}

export function editErrorText(err) {
  if (err?.code === 'PGRST202' || err?.code === '42883') return 'Falta ejecutar en Supabase el SQL de la parte 20 (editar según permisos).'
  return err?.message || 'No se pudo guardar. Comprueba la conexión.'
}

/**
 * Las escrituras: { patch(table, doc, patch), create(table, data) } (devuelven el documento
 * guardado). raw(table, id): el documento tal como llegó del servidor (sin migrar).
 */
export function docWriter(client, raw) {
  const call = async (args) => {
    const { data, error } = await client.rpc('cesi_ceo_doc_patch', args)
    if (error) throw new Error(editErrorText(error))
    return data
  }
  return {
    async patch(table, doc, patch) {
      const changes = changedFields(doc, patch)
      if (Object.keys(changes).length === 0) return doc
      return call({ p_table: table, p_id: doc.id, p_patch: changes, p_before: beforeOf(raw(table, doc.id), changes), p_create: false })
    },
    async create(table, data) {
      const clean = Object.fromEntries(Object.entries(data).filter(([k]) => !['id', 'createdAt', 'updatedAt'].includes(k)))
      return call({ p_table: table, p_id: makeId(), p_patch: clean, p_before: {}, p_create: true })
    },
  }
}

/**
 * Lo que puede hacer RRHH en Equipo y Vacantes, con la misma lógica que mi app (App.jsx).
 * data(): { contacts, vacancies } actuales. confirm: para preguntar (window.confirm).
 */
export function rrhhActions(writer, data, confirm = (q) => window.confirm(q)) {
  const contactById = (id) => data().contacts.find((c) => c.id === id)
  const patchContact = (contact, patch) => writer.patch('contacts', contact, patch)

  const candidateStatus = (contact, candidacyId, status) => patchContact(contact, candidacyPatch(contact, candidacyId, (c) => withStatus(c, status)))

  const incorporateCandidate = async (contact, candidacyId, vacancy, { contactPatch, teamProfile }) => {
    const { contacts } = data()
    const result = incorporate({ contact, candidacyId, vacancy, teamProfile, contacts })
    await patchContact(contact, withStatusChange(contact, { ...contactPatch, ...result.contactPatch }))
    await writer.patch('vacancies', vacancy, result.vacancyPatch)
    const n = result.remaining.length
    if (n > 0) {
      const who = result.remaining.map((e) => `• ${e.contact.name}`).join('\n')
      const question = n === 1 ? 'Queda 1 candidato en esta vacante' : `Quedan ${n} candidatos en esta vacante`
      if (confirm(`${question}:\n${who}\n\n¿Marcarlos como descartados?`)) {
        for (const e of result.remaining) await candidateStatus(e.contact, e.candidacy.id, 'discarded')
      }
    }
  }

  return {
    createVacancy: (values) => writer.create('vacancies', newVacancy(values)),
    updateVacancy: (id, patch) => writer.patch('vacancies', data().vacancies.find((v) => v.id === id), patch),
    addCandidacy: async (vacancyId, { contactId, contactData, candidacy }) => {
      const entry = newCandidacy(vacancyId, candidacy)
      const plan = planCandidacy(data().contacts, contactData || {}, entry, contactId)
      if (plan.action === 'create') return writer.create('contacts', newContactDoc(plan.contact))
      return patchContact(plan.existing, plan.patch)
    },
    editCandidacy: (contact, candidacyId, { contactData, candidacy }) => patchContact(contact, { ...(contactData || {}), ...candidacyPatch(contact, candidacyId, candidacy) }),
    // Aceptar incorpora a Equipo (en el área de la vacante); el resto de estados solo cambian la candidatura.
    candidateStatusChange: (contact, candidacyId, status) => {
      const candidacy = candidaciesOf(contact).find((c) => c.id === candidacyId)
      const vacancy = candidacy && data().vacancies.find((v) => v.id === candidacy.vacancyId)
      if (status !== 'accepted' || !vacancy) return candidateStatus(contact, candidacyId, status)
      return incorporateCandidate(contact, candidacyId, vacancy, { contactPatch: {}, teamProfile: acceptedTeamProfile(contact, vacancy) })
    },
    incorporate: incorporateCandidate,
    saveTeamProfile: (contactId, { contactPatch, teamProfile }) => {
      const contact = contactById(contactId)
      // RRHH no cambia fotos (van a mis archivos).
      const rest = Object.fromEntries(Object.entries(contactPatch || {}).filter(([k]) => k !== 'photo'))
      return patchContact(contact, withStatusChange(contact, { ...rest, teamProfile }))
    },
    markFormer: (contact, leftAt) => patchContact(contact, withStatusChange(contact, { teamProfile: markFormerProfile(contact.teamProfile, leftAt) })),
    keepActive: (contact) => patchContact(contact, { teamProfile: { ...contact.teamProfile, keepActive: true } }),
  }
}

/**
 * Lo que puede hacer Directivo en Cursos: crear y editar cursos, inscribir y desinscribir alumnos
 * y crear clases sueltas. data(): { courses, students } actuales.
 */
export function directivoActions(writer, data) {
  const courseById = (id) => data().courses.find((c) => c.id === id)
  return {
    createCourse: (values) => writer.create('courses', values),
    renameCourse: (id, name) => writer.patch('courses', courseById(id), { name }),
    updateCourse: (id, values) => {
      const problem = validateCourse(values, data().courses, id)
      if (problem) throw new Error(problem)
      return writer.patch('courses', courseById(id), values)
    },
    // Deja inscritos en el curso exactamente a esos alumnos (solo cambia sus cursos).
    setEnrolled: async (courseId, studentIds) => {
      const wanted = new Set(studentIds)
      for (const s of data().students) {
        const ids = s.courseIds || []
        const has = ids.includes(courseId)
        if (has === wanted.has(s.id)) continue
        await writer.patch('students', s, { courseIds: has ? ids.filter((id) => id !== courseId) : [...ids, courseId] })
      }
    },
    // Solo crear (cambiar o borrar una clase suelta toca el pase de lista: eso, la ceo).
    createExtraClass: (courseId, values, timeZone) => {
      const problem = validateExtraClass(values, timeZone)
      if (problem) throw new Error(problem)
      const { start, end } = extraClassTimes(values, timeZone)
      return writer.create('extra_classes', { courseId, start: start.toISOString(), end: end.toISOString(), timeZone, note: (values.note || '').trim() })
    },
  }
}

// Registro de cambios (solo la ceo): [{ id, at, who_name, who_area, doc_table, doc_id, doc_name, action, before, after }]
export async function listTeamEdits(client) {
  const { data, error } = await client.rpc('cesi_team_edit_log', { p_limit: 300 })
  if (error) throw new Error(editErrorText(error))
  return data || []
}

export const DOC_TABLE_LABEL = { contacts: 'Contacto', vacancies: 'Vacante', courses: 'Curso', students: 'Alumno', extra_classes: 'Clase suelta' }

// «Cambió: teamProfile, email» con nombres legibles.
const FIELD_LABEL = {
  teamProfile: 'ficha de equipo',
  candidacies: 'candidaturas',
  courseIds: 'cursos',
  archived: 'archivado',
  archivedAt: 'archivado',
  candidateOnly: 'candidato',
  name: 'nombre',
  title: 'título',
  status: 'estado',
  schedule: 'horario',
  teacherId: 'profesor',
  classMinutes: 'duración',
  classesPerWeek: 'clases por semana',
}
export function changedLabel(entry) {
  const keys = Object.keys(entry.after || {})
  return [...new Set(keys.map((k) => FIELD_LABEL[k] || k))].join(', ')
}
