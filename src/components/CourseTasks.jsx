import { useCallback, useEffect, useState } from 'react'
import { ArrowLeft, ClipboardCheck, FileText, Paperclip, Pencil, Plus, Send, Trash2 } from 'lucide-react'
import RichText from './RichText.jsx'
import RichTextField from './RichTextField.jsx'
import FileChip from './RoomFile.jsx'
import { BODY_MAX, FILE_ACCEPT, fileError } from '../lib/courseRoom'
import {
  ANSWER_MAX,
  FEEDBACK_MAX,
  SUBMISSION_STATUS_LABEL,
  TASK_TITLE_MAX,
  deleteTask,
  dueText,
  emptyTaskForm,
  gradeSubmission,
  listSubmissions,
  listTasks,
  over10,
  saveTask,
  scoreOf,
  submitTask,
  taskFormOf,
  tasksErrorText,
  validateGradeForm,
  validateSubmission,
  validateTask,
} from '../lib/courseTasks'

const KIND_LABEL = { tarea: 'Tarea', examen: 'Examen' }

function StatusChip({ status }) {
  return <span className={`task-status st-${status}`}>{SUBMISSION_STATUS_LABEL[status] || status}</span>
}

// Archivo de un formulario: el que ya tiene (con «Quitar») o elegir uno.
function FileInput({ form, set, setError, optional = true }) {
  return (
    <div className="room-field">
      <span>Archivo{optional ? ' (opcional)' : ''}</span>
      {form.filePath && !form.file ? (
        <p className="room-current-file">
          <Paperclip size={14} strokeWidth={1.75} /> {form.fileName}
          <button type="button" className="room-link" onClick={() => set({ filePath: null, fileName: '', fileType: '', fileSize: 0 })}>
            Quitar
          </button>
        </p>
      ) : (
        <input
          type="file"
          accept={FILE_ACCEPT}
          onChange={(e) => {
            const file = e.target.files?.[0] || null
            setError(fileError(file))
            set({ file })
          }}
        />
      )}
      <em className="room-hint">PDF, imágenes, PowerPoint, Word o Excel. Como mucho 20 MB.</em>
    </div>
  )
}

// Crear o cambiar una tarea o un examen (el profesor).
function TaskForm({ client, courseId, task, onClose, onSaved }) {
  const [form, setForm] = useState(() => (task ? taskFormOf(task) : emptyTaskForm()))
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)
  const set = (patch) => setForm((f) => ({ ...f, ...patch }))

  const submit = async (e) => {
    e.preventDefault()
    const problem = validateTask(form)
    if (problem) return setError(problem)
    setBusy(true)
    setError(null)
    try {
      await saveTask(client, courseId, form, task)
      onSaved()
    } catch (err) {
      setError(tasksErrorText(err))
      setBusy(false)
    }
  }

  return (
    <form className="room-card room-form" onSubmit={submit}>
      <div className="room-form-head">
        <strong>{task ? 'Editar' : 'Nueva tarea o examen'}</strong>
        <div className="room-kinds" role="group" aria-label="Tipo">
          {Object.entries(KIND_LABEL).map(([id, label]) => (
            <button key={id} type="button" className={form.kind === id ? 'on' : ''} aria-pressed={form.kind === id} onClick={() => set({ kind: id })}>
              {label}
            </button>
          ))}
        </div>
      </div>
      <label className="room-field">
        <span>Título</span>
        <input type="text" value={form.title} maxLength={TASK_TITLE_MAX} onChange={(e) => set({ title: e.target.value })} />
      </label>
      <RichTextField id="task-instructions" label="Instrucciones" value={form.instructions} maxLength={BODY_MAX} onChange={(instructions) => set({ instructions })} />
      <FileInput form={form} set={set} setError={setError} />
      <div className="room-row">
        <label className="room-field">
          <span>Fecha límite (tu hora)</span>
          <input type="datetime-local" value={form.due} onChange={(e) => set({ due: e.target.value })} />
        </label>
        <label className="room-field">
          <span>Nota máxima (sobre 10)</span>
          <input type="text" inputMode="decimal" value={form.maxScore} onChange={(e) => set({ maxScore: e.target.value })} />
        </label>
      </div>
      {error && <p className="room-error">{error}</p>}
      <div className="room-actions">
        <button type="button" className="room-btn" onClick={onClose} disabled={busy}>
          Cancelar
        </button>
        <button type="submit" className="room-btn primary" disabled={busy}>
          {busy ? 'Guardando…' : task ? 'Guardar' : 'Crear'}
        </button>
      </div>
    </form>
  )
}

// La entrega del inscrito (o su corrección).
function MySubmission({ client, courseId, userId, task, readOnly, onSaved }) {
  const has = !!task.my_submitted_at
  const [editing, setEditing] = useState(!has)
  const [form, setForm] = useState(() => ({ text: task.my_text || '', file: null, filePath: task.my_file_path, fileName: task.my_file_name || '', fileType: '', fileSize: task.my_file_size || 0 }))
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)
  const set = (patch) => setForm((f) => ({ ...f, ...patch }))
  const graded = task.my_status === 'corregida'

  const submit = async (e) => {
    e.preventDefault()
    const problem = validateSubmission(form)
    if (problem) return setError(problem)
    setBusy(true)
    setError(null)
    try {
      await submitTask(client, courseId, userId, task, form)
      onSaved()
    } catch (err) {
      setError(tasksErrorText(err))
      setBusy(false)
    }
  }

  return (
    <section className="room-card task-mine">
      <div className="room-post-head">
        <strong>Tu entrega</strong>
        <StatusChip status={task.my_status} />
      </div>
      {graded && (
        <div className="task-grade">
          <span className="task-score">{scoreOf(task.my_score, task.max_score)}</span>
          {task.my_feedback && <p>{task.my_feedback}</p>}
        </div>
      )}
      {has && !editing ? (
        <>
          {task.my_text && <p className="task-answer">{task.my_text}</p>}
          {task.my_file_path && <FileChip client={client} path={task.my_file_path} name={task.my_file_name} size={task.my_file_size} onError={setError} />}
          <p className="room-muted">Entregada el {dueText(task.my_submitted_at)}.</p>
          {!graded && !readOnly && (
            <button type="button" className="room-link" onClick={() => setEditing(true)}>
              <Pencil size={13} strokeWidth={1.75} /> Cambiar mi entrega
            </button>
          )}
        </>
      ) : (
        <form className="room-form" onSubmit={submit}>
          <label className="room-field">
            <span>Tu respuesta</span>
            <textarea rows={5} maxLength={ANSWER_MAX} value={form.text} onChange={(e) => set({ text: e.target.value })} disabled={readOnly} />
          </label>
          <FileInput form={form} set={set} setError={setError} />
          {error && <p className="room-error">{error}</p>}
          <div className="room-actions">
            {has && (
              <button type="button" className="room-btn" onClick={() => setEditing(false)} disabled={busy}>
                Cancelar
              </button>
            )}
            <button type="submit" className="room-btn primary" disabled={busy || readOnly}>
              <Send size={14} strokeWidth={1.75} />
              {busy ? 'Enviando…' : 'Entregar'}
            </button>
          </div>
        </form>
      )}
      {error && has && !editing && <p className="room-error">{error}</p>}
    </section>
  )
}

// Una entrega en la lista del profesor (con su corrección).
function SubmissionRow({ client, sub, task, onGraded }) {
  const [form, setForm] = useState(() => ({ score: sub.score === null || sub.score === undefined ? '' : String(sub.score).replace('.', ','), feedback: sub.feedback || '' }))
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)
  const [saved, setSaved] = useState(false)

  const save = async (e) => {
    e.preventDefault()
    const problem = validateGradeForm(form, task.max_score)
    if (problem) return setError(problem)
    setBusy(true)
    setError(null)
    try {
      await gradeSubmission(client, sub.submission_id, form)
      setSaved(true)
      onGraded()
    } catch (err) {
      setError(tasksErrorText(err))
    }
    setBusy(false)
  }

  return (
    <li className="room-card task-sub">
      <div className="room-post-head">
        <strong>{sub.student_name}</strong>
        <StatusChip status={sub.status} />
        {sub.submitted_at && <span className="room-muted room-date">{dueText(sub.submitted_at)}</span>}
      </div>
      {sub.text_answer && <p className="task-answer">{sub.text_answer}</p>}
      {sub.file_path && <FileChip client={client} path={sub.file_path} name={sub.file_name} size={sub.file_size} onError={setError} />}
      {sub.can_grade ? (
        <form className="task-grade-form" onSubmit={save}>
          <label className="room-field">
            <span>Nota (de 0 a {String(task.max_score).replace('.', ',')})</span>
            <input type="text" inputMode="decimal" value={form.score} onChange={(e) => (setSaved(false), setForm((f) => ({ ...f, score: e.target.value })))} />
          </label>
          <label className="room-field task-feedback">
            <span>Comentario (opcional)</span>
            <textarea rows={2} maxLength={FEEDBACK_MAX} value={form.feedback} onChange={(e) => (setSaved(false), setForm((f) => ({ ...f, feedback: e.target.value })))} />
          </label>
          <button type="submit" className="room-btn primary" disabled={busy}>
            {busy ? 'Guardando…' : saved ? 'Guardada ✓' : sub.status === 'corregida' ? 'Cambiar nota' : 'Poner nota'}
          </button>
        </form>
      ) : (
        sub.status === 'corregida' && (
          <div className="task-grade">
            <span className="task-score">{scoreOf(sub.score, task.max_score)}</span>
            {sub.feedback && <p>{sub.feedback}</p>}
          </div>
        )
      )}
      {error && <p className="room-error">{error}</p>}
    </li>
  )
}

// La ficha de una tarea: instrucciones y, según quién, su entrega o las de todos.
function TaskDetail({ client, courseId, userId, role, task, readOnly, onBack, onChanged, onEdit }) {
  const [subs, setSubs] = useState(null)
  const [error, setError] = useState(null)
  const [tick, setTick] = useState(0)
  const staff = role === 'teacher' || role === 'manager'

  useEffect(() => {
    if (!staff) return
    let active = true
    listSubmissions(client, task.id).then(
      (rows) => active && setSubs(rows),
      (err) => active && setError(tasksErrorText(err)),
    )
    return () => {
      active = false
    }
  }, [client, task.id, staff, tick])

  const remove = async () => {
    if (!window.confirm(`¿Borrar «${task.title}»? Se borran también las entregas. No se puede deshacer.`)) return
    try {
      await deleteTask(client, task)
      onChanged()
      onBack()
    } catch (err) {
      setError(tasksErrorText(err))
    }
  }

  return (
    <div className="room-root task-detail">
      <button type="button" className="room-back" onClick={onBack}>
        <ArrowLeft size={16} strokeWidth={1.75} /> Tareas y exámenes
      </button>
      <article className="room-card room-post">
        <div className="room-post-head">
          <span className={`room-kind k-${task.kind}`}>
            <ClipboardCheck size={13} strokeWidth={1.75} /> {KIND_LABEL[task.kind]}
          </span>
          <span className="room-muted room-date">
            Hasta el {dueText(task.due_at)} · sobre {String(task.max_score).replace('.', ',')}
          </span>
        </div>
        <h3>{task.title}</h3>
        {task.instructions && <RichText text={task.instructions} className="room-body" />}
        {task.file_path && <FileChip client={client} path={task.file_path} name={task.file_name} size={task.file_size} onError={setError} />}
        {role === 'teacher' && !readOnly && (
          <div className="room-post-actions">
            <button type="button" className="room-link" onClick={() => onEdit(task)}>
              <Pencil size={13} strokeWidth={1.75} /> Editar
            </button>
            <button type="button" className="room-link danger" onClick={remove}>
              <Trash2 size={13} strokeWidth={1.75} /> Borrar
            </button>
          </div>
        )}
      </article>
      {error && <p className="room-error">{error}</p>}

      {role === 'student' && <MySubmission client={client} courseId={courseId} userId={userId} task={task} readOnly={readOnly} onSaved={onChanged} />}

      {staff && (
        <section className="task-subs">
          <h3>Entregas{subs ? ` (${subs.filter((s) => s.submission_id).length} de ${subs.length})` : ''}</h3>
          {!subs ? (
            <p className="room-muted">Cargando…</p>
          ) : subs.length === 0 ? (
            <p className="room-muted">Todavía no hay inscritos.</p>
          ) : (
            <ul className="room-posts">
              {subs.map((s) => (
                <SubmissionRow
                  key={s.submission_id || s.student_id}
                  client={client}
                  sub={{ ...s, can_grade: s.can_grade && !readOnly }}
                  task={task}
                  onGraded={() => {
                    setTick((n) => n + 1)
                    onChanged()
                  }}
                />
              ))}
            </ul>
          )}
          {role === 'teacher' && <p className="room-muted">La nota pasa a «Calificaciones» sobre 10 (por ejemplo, 4 / 5 cuenta como {String(over10(4, 5)).replace('.', ',')}).</p>}
        </section>
      )}
    </div>
  )
}

/**
 * «Tareas y exámenes» del aula (parte 42). role: el del aula ('teacher' | 'manager' | 'student').
 * El profesor las crea, edita, borra y corrige; la ceo y Directivo ven todo; cada inscrito ve las
 * tareas y solo su entrega.
 */
export default function CourseTasks({ client, courseId, role, readOnly = false }) {
  const [tasks, setTasks] = useState(null)
  const [error, setError] = useState(null)
  const [reload, setReload] = useState(0)
  const [openId, setOpenId] = useState(null)
  const [form, setForm] = useState(null) // { task } (null: nueva)
  const [userId, setUserId] = useState(null)
  const refresh = useCallback(() => setReload((n) => n + 1), [])

  useEffect(() => {
    let active = true
    listTasks(client, courseId).then(
      (rows) => {
        if (!active) return
        setTasks(rows)
        setError(null)
      },
      (err) => active && setError(tasksErrorText(err)),
    )
    return () => {
      active = false
    }
  }, [client, courseId, reload])

  // La cuenta (para la carpeta de sus entregas).
  useEffect(() => {
    if (role !== 'student') return
    let active = true
    client.auth.getSession().then(({ data }) => active && setUserId(data?.session?.user?.id || null))
    return () => {
      active = false
    }
  }, [client, role])

  const canEdit = role === 'teacher' && !readOnly
  const open = (tasks || []).find((t) => t.id === openId) || null

  if (error) return <p className="room-error">{error}</p>
  if (!tasks) return <p className="room-muted">Cargando…</p>

  if (form) {
    return <TaskForm client={client} courseId={courseId} task={form.task} onClose={() => setForm(null)} onSaved={() => (setForm(null), refresh())} />
  }
  if (open) {
    return (
      <TaskDetail
        key={`${open.id}|${open.my_submitted_at || ''}|${open.my_score ?? ''}`}
        client={client}
        courseId={courseId}
        userId={userId}
        role={role}
        task={open}
        readOnly={readOnly}
        onBack={() => setOpenId(null)}
        onChanged={refresh}
        onEdit={(task) => setForm({ task })}
      />
    )
  }

  return (
    <div className="room-root">
      {canEdit && (
        <button type="button" className="room-btn primary task-new" onClick={() => setForm({ task: null })}>
          <Plus size={15} strokeWidth={2} /> Nueva tarea o examen
        </button>
      )}
      {tasks.length === 0 ? (
        <p className="room-muted room-empty">{canEdit ? 'Todavía no has creado ninguna tarea ni examen.' : 'Todavía no hay tareas ni exámenes.'}</p>
      ) : (
        <ul className="room-posts">
          {tasks.map((t) => (
            <li key={t.id}>
              <button type="button" className="room-card task-item" onClick={() => setOpenId(t.id)}>
                <span className="room-post-head">
                  <span className={`room-kind k-${t.kind}`}>
                    <FileText size={13} strokeWidth={1.75} /> {KIND_LABEL[t.kind]}
                  </span>
                  {role === 'student' ? (
                    <StatusChip status={t.my_status} />
                  ) : (
                    <span className="room-muted room-date">
                      {t.submitted_count} {t.submitted_count === 1 ? 'entrega' : 'entregas'} · {t.graded_count} {t.graded_count === 1 ? 'corregida' : 'corregidas'}
                    </span>
                  )}
                </span>
                <strong>{t.title}</strong>
                <span className="room-muted">
                  Hasta el {dueText(t.due_at)}
                  {role === 'student' && t.my_status === 'corregida' ? ` · Nota: ${scoreOf(t.my_score, t.max_score)}` : ''}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
