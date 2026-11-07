// Parte 44 (supabase/parte44_generar_certificados.sql): generar certificados desde la app. Firmas,
// logos, ajustes por curso y emisión del PDF generado. Todo solo la ceo (reglas de la base de datos)
// y en el bucket privado cesi-certificados (firmas/ y logos/).
import { CERT_BUCKET, courseFinished } from './certificates'
import { normalizeCourse } from './courses'

export const IMAGE_MAX_BYTES = 2 * 1024 * 1024
const IMAGE_TYPES = { png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg' }

// Tipo de una imagen de firma o logo (PNG o JPG; null si no vale).
export function imageTypeOf(file) {
  const ext = (/\.([a-z0-9]+)$/i.exec(file?.name || '')?.[1] || '').toLowerCase()
  return IMAGE_TYPES[ext] || (['image/png', 'image/jpeg'].includes(file?.type) ? file.type : null)
}
export function imageFileError(file) {
  if (!file) return 'Elige la imagen (PNG o JPG).'
  if (!imageTypeOf(file)) return 'La imagen tiene que ser PNG o JPG.'
  if (file.size > IMAGE_MAX_BYTES) return 'La imagen puede tener como mucho 2 MB.'
  return null
}

const newId = () => (globalThis.crypto?.randomUUID ? globalThis.crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2)}`)

async function rows(query) {
  const { data, error } = await query
  if (error) throw error
  return data || []
}

export const listSignatures = (client) => rows(client.from('certificate_signatures').select('*').order('name'))
export const listLogos = (client) => rows(client.from('certificate_logos').select('*').order('name'))
export const listCourseSettings = (client) => rows(client.from('certificate_course_settings').select('*')).then((list) => new Map(list.map((s) => [s.course_id, s])))

async function uploadImage(client, folder, file) {
  const type = imageTypeOf(file)
  const path = `${folder}/${newId()}.${type === 'image/png' ? 'png' : 'jpg'}`
  const { error } = await client.storage.from(CERT_BUCKET).upload(path, file, { contentType: type, upsert: false })
  if (error) throw new Error(error.message)
  return { path, type }
}

// Guarda una firma (nueva o cambiada). form: { name, title, teacherId, isCeoDefault, file }.
export async function saveSignature(client, form, previous = null) {
  const name = (form.name || '').trim()
  if (!name) throw new Error('Escribe el nombre de quien firma.')
  if (!previous || form.file) {
    const problem = imageFileError(form.file)
    if (problem) throw new Error(problem)
  }
  const img = form.file ? await uploadImage(client, 'firmas', form.file) : null
  // Solo una firma «de la ceo» por defecto: la anterior deja de serlo.
  if (form.isCeoDefault) {
    let q = client.from('certificate_signatures').update({ is_ceo_default: false }).eq('is_ceo_default', true)
    if (previous) q = q.neq('id', previous.id)
    const { error } = await q
    if (error) throw error
  }
  const row = {
    name: name.slice(0, 120),
    title: (form.title || '').trim().slice(0, 120),
    teacher_id: form.teacherId || null,
    is_ceo_default: !!form.isCeoDefault,
    updated_at: new Date().toISOString(),
    ...(img ? { file_path: img.path, file_type: img.type } : {}),
  }
  const { error } = previous ? await client.from('certificate_signatures').update(row).eq('id', previous.id) : await client.from('certificate_signatures').insert(row)
  if (error) {
    if (img) await client.storage.from(CERT_BUCKET).remove([img.path]).catch(() => {})
    throw error
  }
  if (img && previous?.file_path) await client.storage.from(CERT_BUCKET).remove([previous.file_path]).catch(() => {})
}

// Guarda un logo de empresa (nuevo o cambiado). form: { name, file }.
export async function saveLogo(client, form, previous = null) {
  const name = (form.name || '').trim()
  if (!name) throw new Error('Escribe el nombre de la empresa.')
  if (!previous || form.file) {
    const problem = imageFileError(form.file)
    if (problem) throw new Error(problem)
  }
  const img = form.file ? await uploadImage(client, 'logos', form.file) : null
  const row = { name: name.slice(0, 120), updated_at: new Date().toISOString(), ...(img ? { file_path: img.path, file_type: img.type } : {}) }
  const { error } = previous ? await client.from('certificate_logos').update(row).eq('id', previous.id) : await client.from('certificate_logos').insert(row)
  if (error) {
    if (img) await client.storage.from(CERT_BUCKET).remove([img.path]).catch(() => {})
    throw error
  }
  if (img && previous?.file_path) await client.storage.from(CERT_BUCKET).remove([previous.file_path]).catch(() => {})
}

// Borra una firma o un logo (table: 'certificate_signatures' | 'certificate_logos') y su imagen.
export async function deleteAsset(client, table, item) {
  const { error } = await client.from(table).delete().eq('id', item.id)
  if (error) throw error
  if (item.file_path) await client.storage.from(CERT_BUCKET).remove([item.file_path]).catch(() => {})
}

export async function saveCourseSettings(client, courseId, choice) {
  const { error } = await client.from('certificate_course_settings').upsert(
    {
      course_id: courseId,
      left_signature_id: choice.leftId || null,
      right_signature_id: choice.rightId || null,
      logo_id: choice.logoId || null,
      show_stats: !!choice.showStats,
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'course_id' },
  )
  if (error) throw error
}

// Lo elegido por defecto al generar: lo guardado para el curso o, si no, firma izquierda la del
// profesor del curso (si tiene), derecha la de la ceo, sin logo y con media y asistencia.
export function defaultChoice(course, signatures = [], settings = null) {
  const has = (id) => !!id && signatures.some((s) => s.id === id)
  const teacher = course?.teacherId ? signatures.find((s) => s.teacher_id === course.teacherId) : null
  const ceo = signatures.find((s) => s.is_ceo_default)
  return {
    leftId: settings && has(settings.left_signature_id) ? settings.left_signature_id : teacher?.id || null,
    rightId: settings && has(settings.right_signature_id) ? settings.right_signature_id : ceo?.id || null,
    logoId: settings?.logo_id || null,
    showStats: settings ? settings.show_stats !== false : true,
  }
}

// Avisos (se puede emitir igual): el curso no ha terminado o no hay notas.
export function certificateWarnings({ course, today, average }) {
  const out = []
  if (course && !courseFinished(course, today)) out.push('El curso todavía no ha terminado.')
  if (average === null || average === undefined) out.push('Esta persona no tiene notas en el curso.')
  return out
}

// Horas del curso: clases (hasta el fin del curso, o hasta hoy) × duración de la clase.
export function courseHours(course, classes, now = new Date()) {
  const c = normalizeCourse(course)
  const limit = c.endDate ? new Date(`${c.endDate}T23:59:59`) : now
  const count = classes.filter((k) => k.start <= limit).length
  return Math.round(((count * c.classMinutes) / 60) * 10) / 10
}

// Los cursos de una persona (su ficha de alumno): en los que está y en los que tiene notas,
// asistencia o certificado (aunque ya no esté).
export function personCourseIds(studentId, { students = [], grades = null, attendance = [], certs = new Map() }) {
  const ids = new Set(students.find((s) => s.id === studentId)?.courseIds || [])
  const fromKey = (key) => {
    const [courseId, sid] = key.split('|')
    if (sid === studentId) ids.add(courseId)
  }
  for (const key of grades?.student?.keys() || []) fromKey(key)
  for (const r of attendance) if (r.studentId === studentId) ids.add(r.courseId)
  for (const key of certs.keys()) fromKey(key)
  return [...ids]
}

// Las personas para «Nuevo certificado»: cuentas de Accesos (alumnos y equipo) con ficha de
// alumno; el nombre, el de su perfil. profiles: cuentas; portals: Map(cuenta → perfil).
export function certificatePeople(profiles = [], portals = new Map(), students = []) {
  const byId = new Map(students.map((s) => [s.id, s]))
  return profiles
    .filter((p) => (p.role === 'alumno' || p.role === 'equipo') && p.linked_student_id && byId.has(p.linked_student_id))
    .map((p) => {
      const ficha = byId.get(p.linked_student_id)
      const name = (portals.get(p.id)?.full_name || '').trim() || (ficha.name || '').trim() || (p.display_name || '').trim() || 'Sin nombre'
      return { accountId: p.id, studentId: ficha.id, name, role: p.role, email: p.email || '' }
    })
    .sort((a, b) => a.name.localeCompare(b.name, 'es', { sensitivity: 'base' }))
}

// Imagen guardada (firma o logo) lista para el PDF: { dataUrl, format, width, height }.
export async function loadAssetImage(client, item) {
  const { data, error } = await client.storage.from(CERT_BUCKET).download(item.file_path)
  if (error) throw new Error(error.message)
  const dataUrl = await new Promise((resolve, reject) => {
    const r = new FileReader()
    r.onload = () => resolve(r.result)
    r.onerror = () => reject(new Error('No se pudo leer la imagen.'))
    r.readAsDataURL(data)
  })
  const size = await new Promise((resolve) => {
    const img = new Image()
    img.onload = () => resolve({ width: img.naturalWidth || 1, height: img.naturalHeight || 1 })
    img.onerror = () => resolve({ width: 1, height: 1 })
    img.src = dataUrl
  })
  return { dataUrl, format: item.file_type === 'image/png' ? 'PNG' : 'JPEG', ...size }
}

// Emite un certificado generado: sube el PDF, guarda la fila (con su código) y borra el PDF
// anterior. info: { courseId, studentId, personName, issuedOn, code, choice }. pdf: Blob.
export async function issueGeneratedCertificate(client, info, pdf, previous = null) {
  const path = `${info.courseId}/${info.studentId}/${newId()}.pdf`
  const { error: upErr } = await client.storage.from(CERT_BUCKET).upload(path, pdf, { contentType: 'application/pdf', upsert: false })
  if (upErr) throw new Error(upErr.message)
  const now = new Date().toISOString()
  const row = {
    course_id: info.courseId,
    student_id: info.studentId,
    issued_on: info.issuedOn,
    file_path: path,
    file_name: `Certificado ${info.code}.pdf`,
    file_size: pdf.size || 0,
    code: info.code,
    generated_at: now,
    person_name: (info.personName || '').slice(0, 160),
    left_signature_id: info.choice.leftId || null,
    right_signature_id: info.choice.rightId || null,
    logo_id: info.choice.logoId || null,
    show_stats: !!info.choice.showStats,
    updated_at: now,
  }
  const { error } = await client.from('course_certificates').upsert(row, { onConflict: 'course_id,student_id' })
  if (error) {
    await client.storage.from(CERT_BUCKET).remove([path]).catch(() => {})
    throw error
  }
  if (previous?.file_path && previous.file_path !== path) await client.storage.from(CERT_BUCKET).remove([previous.file_path]).catch(() => {})
}

export function assetsErrorText(err) {
  if (err?.code === '42P01' || err?.code === 'PGRST205' || err?.code === '42703' || /certificate_(signatures|logos|course_settings)|column .*code/.test(err?.message || ''))
    return 'Falta ejecutar en Supabase el SQL de la parte 44 (generar certificados).'
  return err?.message || 'No se pudo completar. Comprueba la conexión.'
}
