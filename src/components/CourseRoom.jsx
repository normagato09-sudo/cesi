import { useCallback, useEffect, useState } from "react";
import {
  ArrowLeft,
  FileText,
  Lock,
  Megaphone,
  Paperclip,
  Pencil,
  Plus,
  Trash2,
} from "lucide-react";
import RichText from "./RichText.jsx";
import RichTextField from "./RichTextField.jsx";
import FileChip from "./RoomFile.jsx";
import CourseTasks from "./CourseTasks.jsx";
import {
  BODY_MAX,
  FILE_ACCEPT,
  TITLE_MAX,
  dayText,
  deleteRoomPost,
  fileError,
  markRoomRead,
  roomErrorText,
  roomInfo,
  roomPosts,
  saveRoomPost,
  validatePost,
} from "../lib/courseRoom";
import "./CourseRoom.css";

const EMPTY = {
  kind: "aviso",
  title: "",
  body: "",
  file: null,
  filePath: null,
  fileName: "",
  fileType: "",
  fileSize: 0,
};

// Publicar o editar un aviso o material (solo el profesor).
function PostForm({ client, courseId, post, onClose, onSaved }) {
  const [form, setForm] = useState(() =>
    post
      ? {
          kind: post.kind,
          title: post.title,
          body: post.body,
          file: null,
          filePath: post.file_path,
          fileName: post.file_name,
          fileType: post.file_type,
          fileSize: post.file_size,
        }
      : EMPTY,
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const set = (patch) => setForm((f) => ({ ...f, ...patch }));

  const submit = async (e) => {
    e.preventDefault();
    const problem = validatePost(form);
    if (problem) return setError(problem);
    setBusy(true);
    setError(null);
    try {
      await saveRoomPost(client, courseId, form, post);
      onSaved();
    } catch (err) {
      setError(roomErrorText(err));
      setBusy(false);
    }
  };

  return (
    <form className="room-card room-form" onSubmit={submit}>
      <div className="room-form-head">
        <strong>{post ? "Editar" : "Publicar en el aula"}</strong>
        <div className="room-kinds" role="group" aria-label="Tipo">
          {[
            ["aviso", "Aviso"],
            ["material", "Material"],
          ].map(([id, label]) => (
            <button
              key={id}
              type="button"
              className={form.kind === id ? "on" : ""}
              aria-pressed={form.kind === id}
              onClick={() => set({ kind: id })}
            >
              {label}
            </button>
          ))}
        </div>
      </div>
      <label className="room-field">
        <span>Título</span>
        <input
          type="text"
          value={form.title}
          maxLength={TITLE_MAX}
          onChange={(e) => set({ title: e.target.value })}
        />
      </label>
      <RichTextField
        id="room-body"
        label="Descripción (opcional)"
        value={form.body}
        maxLength={BODY_MAX}
        onChange={(body) => set({ body })}
      />
      <div className="room-field">
        <span>Archivo{form.kind === "material" ? "" : " (opcional)"}</span>
        {form.filePath && !form.file ? (
          <p className="room-current-file">
            <Paperclip size={14} strokeWidth={1.75} /> {form.fileName}
            <button
              type="button"
              className="room-link"
              onClick={() =>
                set({ filePath: null, fileName: "", fileType: "", fileSize: 0 })
              }
            >
              Quitar
            </button>
          </p>
        ) : (
          <input
            type="file"
            accept={FILE_ACCEPT}
            onChange={(e) => {
              const file = e.target.files?.[0] || null;
              setError(fileError(file));
              set({ file });
            }}
          />
        )}
        <em className="room-hint">
          PDF, imágenes, PowerPoint, Word o Excel. Como mucho 20 MB.
        </em>
      </div>
      {error && <p className="room-error">{error}</p>}
      <div className="room-actions">
        <button
          type="button"
          className="room-btn"
          onClick={onClose}
          disabled={busy}
        >
          Cancelar
        </button>
        <button type="submit" className="room-btn primary" disabled={busy}>
          {busy ? "Guardando…" : post ? "Guardar" : "Publicar"}
        </button>
      </div>
    </form>
  );
}

/**
 * «Aula» de un curso (parte 41): avisos y materiales, lo más reciente primero, con «Nuevo» en lo
 * que el alumno aún no había visto. El profesor publica, edita y borra. Antes del día de inicio,
 * los inscritos ven «El aula se abre el …». Quién entra lo decide el servidor.
 * client: Supabase. courseId. onBack: volver (null: sin botón). readOnly: «Ver como» (sin publicar).
 * Dos pestañas: «Avisos y materiales» y «Tareas y exámenes» (parte 42).
 */
export default function CourseRoom({
  client,
  courseId,
  onBack = null,
  readOnly = false,
}) {
  const [tab, setTab] = useState("posts");
  const [info, setInfo] = useState(null);
  const [posts, setPosts] = useState(null);
  const [error, setError] = useState(null);
  const [notice, setNotice] = useState(null);
  const [form, setForm] = useState(null); // { post } (null: nuevo)
  const [reload, setReload] = useState(0);
  const refresh = useCallback(() => setReload((n) => n + 1), []);

  useEffect(() => {
    if (!client || !courseId) return;
    let active = true;
    Promise.all([roomInfo(client, courseId), roomPosts(client, courseId)]).then(
      ([i, list]) => {
        if (!active) return;
        setInfo(i);
        setPosts(list);
        setError(null);
        // Lo nuevo sigue marcado mientras está abierta; la próxima vez ya no.
        if (i?.my_role === "student" && list.some((p) => p.is_new))
          markRoomRead(client, courseId).catch(() => {});
      },
      (err) => active && setError(roomErrorText(err)),
    );
    return () => {
      active = false;
    };
  }, [client, courseId, reload]);

  const remove = async (post) => {
    if (!window.confirm(`¿Borrar «${post.title}»? No se puede deshacer.`))
      return;
    try {
      await deleteRoomPost(client, post);
      refresh();
    } catch (err) {
      setNotice(roomErrorText(err));
    }
  };

  const back = onBack && (
    <button type="button" className="room-back" onClick={onBack}>
      <ArrowLeft size={16} strokeWidth={1.75} /> Mis cursos
    </button>
  );

  if (error) {
    return (
      <div className="room-root">
        {back}
        <p className="room-error">{error}</p>
      </div>
    );
  }
  if (!info || !posts) {
    return (
      <div className="room-root">
        {back}
        <p className="room-muted">Cargando el aula…</p>
      </div>
    );
  }

  const closedForMe = info.my_role === "student" && !info.is_open;
  const canPost = info.can_post && !readOnly;

  return (
    <div className="room-root">
      {back}
      <header className="room-head">
        <div>
          <h2>Aula · {info.course_name}</h2>
          {!info.is_open && info.opens_on && (
            <p className="room-muted">
              Se abre a los alumnos el {dayText(info.opens_on)}.
            </p>
          )}
        </div>
        {canPost && !form && tab === "posts" && (
          <button
            type="button"
            className="room-btn primary"
            onClick={() => setForm({ post: null })}
          >
            <Plus size={15} strokeWidth={2} /> Publicar
          </button>
        )}
      </header>

      {closedForMe ? (
        <div className="room-card room-closed">
          <Lock size={26} strokeWidth={1.5} />
          <p>El aula se abre el {dayText(info.opens_on)}.</p>
        </div>
      ) : (
        <>
          <div className="room-tabs" role="tablist" aria-label="Aula">
            {[
              ["posts", "Avisos y materiales"],
              ["tasks", "Tareas y exámenes"],
            ].map(([id, label]) => (
              <button
                key={id}
                type="button"
                role="tab"
                aria-selected={tab === id}
                className={tab === id ? "on" : ""}
                onClick={() => setTab(id)}
              >
                {label}
              </button>
            ))}
          </div>
          {tab === "tasks" ? (
            <CourseTasks
              client={client}
              courseId={courseId}
              role={info.my_role}
              readOnly={readOnly}
            />
          ) : (
            <>
              {notice && <p className="room-error">{notice}</p>}
              {form && (
                <PostForm
                  client={client}
                  courseId={courseId}
                  post={form.post}
                  onClose={() => setForm(null)}
                  onSaved={() => (setForm(null), refresh())}
                />
              )}
              {posts.length === 0 ? (
                <p className="room-muted room-empty">
                  {canPost
                    ? "Todavía no has publicado nada. Empieza con un aviso de bienvenida o el primer material."
                    : "Todavía no hay avisos ni materiales."}
                </p>
              ) : (
                <ul className="room-posts">
                  {posts.map((p) => (
                    <li
                      key={p.id}
                      className={`room-card room-post${p.is_new ? " is-new" : ""}`}
                    >
                      <div className="room-post-head">
                        <span className={`room-kind k-${p.kind}`}>
                          {p.kind === "material" ? (
                            <FileText size={13} strokeWidth={1.75} />
                          ) : (
                            <Megaphone size={13} strokeWidth={1.75} />
                          )}
                          {p.kind === "material" ? "Material" : "Aviso"}
                        </span>
                        {p.is_new && <span className="room-new">Nuevo</span>}
                        <span className="room-muted room-date">
                          {dayText(p.created_at)} · {p.author}
                        </span>
                      </div>
                      <h3>{p.title}</h3>
                      {p.body && (
                        <RichText text={p.body} className="room-body" />
                      )}
                      {p.file_path && (
                        <FileChip
                          client={client}
                          path={p.file_path}
                          name={p.file_name}
                          size={p.file_size}
                          onError={setNotice}
                        />
                      )}
                      {canPost && (
                        <div className="room-post-actions">
                          <button
                            type="button"
                            className="room-link"
                            onClick={() => setForm({ post: p })}
                          >
                            <Pencil size={13} strokeWidth={1.75} /> Editar
                          </button>
                          <button
                            type="button"
                            className="room-link danger"
                            onClick={() => remove(p)}
                          >
                            <Trash2 size={13} strokeWidth={1.75} /> Borrar
                          </button>
                        </div>
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </>
          )}
        </>
      )}
    </div>
  );
}
