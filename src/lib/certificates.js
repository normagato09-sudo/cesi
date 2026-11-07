// Certificados (parte 43, supabase/parte43_certificados.sql): solo la ceo. Por cada alumno de un
// curso terminado, «Certificado emitido» con la fecha y el PDF (bucket privado cesi-certificados).
import { normalizeCourse, studentsInCourse } from './courses'
import { studentAttendance } from './courseOverview'

export const CERT_BUCKET = 'cesi-certificados'
export const CERT_MAX_BYTES = 10 * 1024 * 1024

const plain = (t) =>
  (t || '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()

// ¿Ha terminado el curso? (estado «Terminado» o con la fecha de fin ya pasada). today: 'AAAA-MM-DD'.
export function courseFinished(course, today) {
  const c = normalizeCourse(course)
  return c.status === 'terminado' || (!!c.endDate && c.endDate < today)
}

// Filas de la pantalla: por cada curso terminado, sus alumnos con media, asistencia y certificado.
// grades: summaryMaps (lib/grades.js) o null; certs: Map(`curso|alumno` → certificado).
// Filtros: course (id, '' todos) y query (nombre del alumno o del curso).
export function certificateGroups({ courses, students, attendance, grades = null, certs = new Map(), today, course = '', query = '' }) {
  const q = plain(query.trim())
  return courses
    .filter((c) => courseFinished(c, today) && (!course || c.id === course))
    .map((c) => {
      const n = normalizeCourse(c)
      const courseHit = q && plain(n.name).includes(q)
      const rows = studentsInCourse(c.id, students)
        .filter((s) => !q || courseHit || plain(s.name).includes(q))
        .map((s) => ({
          student: s,
          average: grades?.student.get(`${c.id}|${s.id}`)?.average ?? null,
          attendance: studentAttendance(attendance, s.id, c.id).percent,
          cert: certs.get(`${c.id}|${s.id}`) || null,
        }))
        .sort((a, b) => (a.student.name || '').localeCompare(b.student.name || '', 'es', { sensitivity: 'base' }))
      return { course: n, rows }
    })
    .filter((g) => g.rows.length > 0)
    .sort((a, b) => (b.course.endDate || '').localeCompare(a.course.endDate || '') || a.course.name.localeCompare(b.course.name, 'es'))
}

export function certFileError(file) {
  if (!file) return null
  if (!/\.pdf$/i.test(file.name || '') && file.type !== 'application/pdf') return 'El certificado tiene que ser un PDF.'
  if (file.size > CERT_MAX_BYTES) return 'El PDF puede tener como mucho 10 MB.'
  return null
}

export async function listCertificates(client) {
  const { data, error } = await client.from('course_certificates').select('*')
  if (error) throw error
  return new Map((data || []).map((c) => [`${c.course_id}|${c.student_id}`, c]))
}

// Marca «Certificado emitido» (con fecha) y, si lo hay, sube el PDF (sustituye al anterior).
export async function saveCertificate(client, { courseId, studentId, issuedOn, file = null, previous = null }) {
  const problem = certFileError(file)
  if (problem) throw new Error(problem)
  let upload = null
  if (file) {
    const id = globalThis.crypto?.randomUUID ? globalThis.crypto.randomUUID() : String(Date.now())
    const path = `${courseId}/${studentId}/${id}.pdf`
    const { error } = await client.storage.from(CERT_BUCKET).upload(path, file, { contentType: 'application/pdf', upsert: false })
    if (error) throw new Error(/bucket not found/i.test(error.message || '') ? 'Falta ejecutar en Supabase el SQL de la parte 43 (certificados).' : error.message)
    upload = { file_path: path, file_name: (file.name || 'certificado.pdf').slice(0, 200), file_size: file.size }
  }
  const row = { course_id: courseId, student_id: studentId, issued_on: issuedOn, updated_at: new Date().toISOString(), ...(upload || {}) }
  const { error } = await client.from('course_certificates').upsert(row, { onConflict: 'course_id,student_id' })
  if (error) {
    if (upload) await client.storage.from(CERT_BUCKET).remove([upload.file_path]).catch(() => {})
    throw error
  }
  if (upload && previous?.file_path) await client.storage.from(CERT_BUCKET).remove([previous.file_path]).catch(() => {})
}

// Quita la marca (y su PDF).
export async function removeCertificate(client, cert) {
  const { error } = await client.from('course_certificates').delete().eq('id', cert.id)
  if (error) throw error
  if (cert.file_path) await client.storage.from(CERT_BUCKET).remove([cert.file_path]).catch(() => {})
}

export async function openCertificate(client, cert) {
  const win = window.open('', '_blank')
  const { data, error } = await client.storage.from(CERT_BUCKET).createSignedUrl(cert.file_path, 600)
  if (error) {
    if (win) win.close()
    throw new Error(error.message)
  }
  if (win) win.location.href = data.signedUrl
  else window.location.href = data.signedUrl
}

export function certificatesErrorText(err) {
  if (err?.code === '42P01' || err?.code === 'PGRST205' || /course_certificates/.test(err?.message || '')) return 'Falta ejecutar en Supabase el SQL de la parte 43 (certificados).'
  return err?.message || 'No se pudo completar. Comprueba la conexión.'
}
