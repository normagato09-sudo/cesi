// Tareas y exámenes del aula (parte 42, supabase/parte42_tareas_y_examenes.sql): el profesor las
// crea y corrige; cada inscrito entrega (texto y/o archivo en cesi-aula/<curso>/subs/<cuenta>/...).
// La nota corregida pasa también a las calificaciones (sobre 10) y se queda en la ficha del alumno.
import { BODY_MAX, fileError, removeRoomFile, uploadRoomFile } from './courseRoom'

export const TASK_TITLE_MAX = 120
export const ANSWER_MAX = 5000
export const FEEDBACK_MAX = 1000

export const SUBMISSION_STATUS_LABEL = {
  pendiente: 'Pendiente',
  entregada: 'Entregada',
  tarde: 'Entregada tarde',
  corregida: 'Corregida',
}

// Estado (también en el navegador, igual que en el servidor).
export function submissionStatus(submittedAt, dueAt, score) {
  if (!submittedAt) return 'pendiente'
  if (score !== null && score !== undefined) return 'corregida'
  return new Date(submittedAt) > new Date(dueAt) ? 'tarde' : 'entregada'
}

// «7,5 / 10».
export function scoreOf(score, max) {
  const t = (n) => String(Math.round(Number(n) * 100) / 100).replace('.', ',')
  return `${t(score)} / ${t(max)}`
}

// Nota sobre 10 (la que pasa a las calificaciones).
export const over10 = (score, max) => Math.round(((Number(score) * 10) / Number(max)) * 100) / 100

// «AAAA-MM-DDTHH:MM» (para <input type="datetime-local">) de una fecha, en la hora del navegador.
export function toLocalInput(date) {
  const d = new Date(date)
  if (Number.isNaN(d.getTime())) return ''
  const p = (n) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`
}

// «12 nov 2026, 23:59».
export function dueText(date, timeZone = undefined) {
  const d = new Date(date)
  if (Number.isNaN(d.getTime())) return ''
  return new Intl.DateTimeFormat('es-ES', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', timeZone })
    .format(d)
    .replace('.', '')
}

export function parseScoreText(text) {
  const v = String(text ?? '')
    .trim()
    .replace(',', '.')
  if (!/^\d{1,2}(\.\d{1,2})?$/.test(v)) return null
  return Number(v)
}

export function emptyTaskForm(now = new Date()) {
  const due = new Date(now)
  due.setDate(due.getDate() + 7)
  due.setHours(23, 59, 0, 0)
  return { kind: 'tarea', title: '', instructions: '', file: null, filePath: null, fileName: '', fileType: '', fileSize: 0, due: toLocalInput(due), maxScore: '10' }
}

export function taskFormOf(task) {
  return {
    kind: task.kind,
    title: task.title,
    instructions: task.instructions || '',
    file: null,
    filePath: task.file_path,
    fileName: task.file_name,
    fileType: task.file_type || '',
    fileSize: task.file_size,
    due: toLocalInput(task.due_at),
    maxScore: String(task.max_score).replace('.', ','),
  }
}

export function validateTask(form) {
  const title = (form.title || '').trim()
  if (!title) return 'Escribe el título.'
  if (title.length > TASK_TITLE_MAX) return `El título puede tener como mucho ${TASK_TITLE_MAX} caracteres.`
  if ((form.instructions || '').trim().length > BODY_MAX) return `Las instrucciones pueden tener como mucho ${BODY_MAX} caracteres.`
  if (!form.due || Number.isNaN(new Date(form.due).getTime())) return 'Pon la fecha límite.'
  const max = parseScoreText(form.maxScore)
  if (max === null || max <= 0 || max > 10) return 'La nota máxima va de 0,5 a 10.'
  return fileError(form.file)
}

export function validateSubmission(form) {
  if (!(form.text || '').trim() && !form.file && !form.filePath) return 'Escribe tu respuesta o adjunta un archivo.'
  if ((form.text || '').trim().length > ANSWER_MAX) return `La respuesta puede tener como mucho ${ANSWER_MAX} caracteres.`
  return fileError(form.file)
}

export function validateGradeForm(form, max) {
  const score = parseScoreText(form.score)
  if (score === null || score < 0 || score > Number(max)) return `La nota va de 0 a ${String(max).replace('.', ',')}.`
  if ((form.feedback || '').trim().length > FEEDBACK_MAX) return `El comentario puede tener como mucho ${FEEDBACK_MAX} caracteres.`
  return null
}

async function rpc(client, name, args = {}) {
  const { data, error } = await client.rpc(name, args)
  if (error) throw error
  return data
}

export const listTasks = (client, courseId) => rpc(client, 'cesi_room_tasks', { p_course: courseId }).then((r) => r || [])
export const listSubmissions = (client, taskId) => rpc(client, 'cesi_course_task_submissions', { p_task: taskId }).then((r) => r || [])

export async function saveTask(client, courseId, form, previous = null) {
  let file = form.filePath ? { path: form.filePath, name: form.fileName, type: form.fileType, size: form.fileSize } : null
  if (form.file) file = await uploadRoomFile(client, courseId, 'tasks', form.file)
  try {
    await rpc(client, 'cesi_course_task_save', {
      p_id: previous?.id || null,
      p_course: courseId,
      p_kind: form.kind,
      p_title: form.title.trim(),
      p_instructions: (form.instructions || '').trim(),
      p_file_path: file?.path || null,
      p_file_name: file?.name || '',
      p_file_type: file?.type || '',
      p_file_size: file?.size || 0,
      p_due_at: new Date(form.due).toISOString(),
      p_max_score: parseScoreText(form.maxScore),
    })
  } catch (err) {
    if (form.file && file?.path) await removeRoomFile(client, file.path).catch(() => {})
    throw err
  }
  if (previous?.file_path && previous.file_path !== file?.path) await removeRoomFile(client, previous.file_path).catch(() => {})
}

export async function deleteTask(client, task) {
  const paths = await rpc(client, 'cesi_course_task_delete', { p_id: task.id })
  for (const p of paths || []) await removeRoomFile(client, p).catch(() => {})
}

// Entregar (o cambiar la entrega). userId: la cuenta (carpeta de sus archivos).
export async function submitTask(client, courseId, userId, task, form) {
  if (form.file && !userId) throw new Error('Vuelve a intentarlo en un momento.')
  let file = form.filePath ? { path: form.filePath, name: form.fileName, type: form.fileType, size: form.fileSize } : null
  if (form.file) file = await uploadRoomFile(client, courseId, 'subs', form.file, userId)
  let old
  try {
    old = await rpc(client, 'cesi_course_task_submit', {
      p_task: task.id,
      p_text: (form.text || '').trim(),
      p_file_path: file?.path || null,
      p_file_name: file?.name || '',
      p_file_type: file?.type || '',
      p_file_size: file?.size || 0,
    })
  } catch (err) {
    if (form.file && file?.path) await removeRoomFile(client, file.path).catch(() => {})
    throw err
  }
  if (old) await removeRoomFile(client, old).catch(() => {})
}

export const gradeSubmission = (client, submissionId, form) =>
  rpc(client, 'cesi_course_task_grade', { p_submission: submissionId, p_score: parseScoreText(form.score), p_feedback: (form.feedback || '').trim() })

export function tasksErrorText(err) {
  if (err?.code === 'PGRST202' || err?.code === '42883' || err?.code === '42P01') return 'Falta ejecutar en Supabase el SQL de la parte 42 (tareas y exámenes).'
  return err?.message || 'No se pudo completar. Comprueba la conexión.'
}
