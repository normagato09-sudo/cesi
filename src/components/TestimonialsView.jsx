import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  BODY_MAX,
  GENERAL,
  GENERAL_LABEL,
  SORTS,
  WHO,
  countText,
  coursesInList,
  dateText,
  deleteTestimonial,
  filterTestimonials,
  listTestimonialCourses,
  listTestimonials,
  myTestimonial,
  roleLine,
  saveTestimonial,
  sortTestimonials,
  summarize,
  testimonialErrorText,
  validateTestimonial,
} from '../lib/testimonials'
import { initialsOf } from '../lib/profiles'
import './Testimonials.css'

const STAR = 'M12 3.5l2.6 5.3 5.9.9-4.3 4.1 1 5.8L12 16.8l-5.2 2.8 1-5.8-4.3-4.1 5.9-.9z'

function Stars({ value, size = 14, label = null }) {
  return (
    <span className="tm-stars" role="img" aria-label={label || `${value} de 5 estrellas`}>
      {[1, 2, 3, 4, 5].map((i) => (
        <svg key={i} aria-hidden="true" width={size} height={size} viewBox="0 0 24 24" className={i <= Math.round(value) ? 'on' : 'off'}>
          <path d={STAR} />
        </svg>
      ))}
    </span>
  )
}

/**
 * «Testimonios» (alumnos, equipo y ceo; parte 33): la media y el número de valoraciones (en
 * ordenador, también cuántas hay de cada puntuación y los filtros Alumnos/Equipo y curso), el
 * formulario para valorar un curso suyo o «General (CIFA)» y las opiniones, por más recientes o
 * mejor valoradas. Cada uno borra las suyas; la ceo, cualquiera. readOnly («Ver como»): sin
 * publicar ni borrar.
 */
export default function TestimonialsView({ client, readOnly = false }) {
  const [list, setList] = useState(null)
  const [courses, setCourses] = useState([])
  const [error, setError] = useState(null)
  const [reload, setReload] = useState(0)
  const [sort, setSort] = useState('recent')
  const [who, setWho] = useState('all')
  const [courseFilter, setCourseFilter] = useState('all')
  const [form, setForm] = useState({ course: GENERAL, rating: 0, body: '' })
  const [busy, setBusy] = useState(false)
  const [formError, setFormError] = useState(null)
  const [saved, setSaved] = useState(false)

  useEffect(() => {
    if (!client) return
    let active = true
    Promise.all([listTestimonials(client), listTestimonialCourses(client)]).then(
      ([rows, mine]) => {
        if (!active) return
        setList(rows)
        setCourses(mine)
        setError(null)
        // La primera vez, el formulario empieza en su primer curso (o en General), con la suya si ya hay.
        setForm((f) => {
          if (f.touched) return f
          const course = mine[0]?.id ?? GENERAL
          const prev = myTestimonial(rows, course)
          return { course, rating: prev?.rating || 0, body: prev?.body || '', touched: false }
        })
      },
      (err) => active && setError(testimonialErrorText(err)),
    )
    return () => {
      active = false
    }
  }, [client, reload])

  // Al elegir un curso en el que ya ha valorado, sale la suya para cambiarla.
  const chooseCourse = useCallback(
    (course) => {
      const prev = myTestimonial(list || [], course)
      setForm({ course, rating: prev?.rating || 0, body: prev?.body || '', touched: true })
      setSaved(false)
      setFormError(null)
    },
    [list],
  )

  const summary = useMemo(() => summarize(list || []), [list])
  const shown = useMemo(() => sortTestimonials(filterTestimonials(list || [], { who, course: courseFilter }), sort), [list, who, courseFilter, sort])
  const filterCourses = useMemo(() => coursesInList(list || []), [list])
  const editing = myTestimonial(list || [], form.course)

  const publish = async (e) => {
    e.preventDefault()
    const problem = validateTestimonial(form)
    if (problem) {
      setFormError(problem)
      return
    }
    setBusy(true)
    setFormError(null)
    try {
      await saveTestimonial(client, form)
      setSaved(true)
      setReload((n) => n + 1)
    } catch (err) {
      setFormError(testimonialErrorText(err))
    }
    setBusy(false)
  }

  const remove = async (t) => {
    const question = t.mine ? '¿Borrar tu valoración?' : `¿Quitar la valoración de ${t.author_name}?`
    if (!window.confirm(question)) return
    try {
      await deleteTestimonial(client, t.id)
      if (t.mine && t.course_id === form.course) setForm((f) => ({ ...f, rating: 0, body: '' }))
      setReload((n) => n + 1)
    } catch (err) {
      setError(testimonialErrorText(err))
    }
  }

  if (error && !list) return <div className="tm-root"><p className="tm-error">{error}</p></div>

  return (
    <div className="tm-root">
      <header className="tm-head">
        <div>
          <h1>Testimonios</h1>
          <p className="tm-sub">Valoraciones de alumnos, profesores y equipo. Las ve todo el mundo.</p>
        </div>
      </header>

      {!list ? (
        <p className="tm-muted">Cargando…</p>
      ) : (
        <div className="tm-layout">
          <aside className="tm-aside">
            <section className="tm-card tm-summary" aria-label="Valoración media">
              <div className="tm-summary-main">
                <span className="tm-average">{summary.averageText}</span>
                <div className="tm-summary-text">
                  <Stars value={summary.average || 0} size={18} label={summary.average === null ? 'Sin valoraciones' : `Media de ${summary.averageText} sobre 5`} />
                  <span className="tm-muted">{countText(summary.count)}</span>
                </div>
              </div>
              <div className="tm-dist">
                {summary.dist.map((d) => (
                  <div key={d.stars} className="tm-dist-row">
                    <span>{d.stars} ★</span>
                    <span className="tm-bar" aria-hidden="true">
                      <span style={{ width: `${d.percent}%` }} />
                    </span>
                    <span className="tm-muted">{d.count}</span>
                  </div>
                ))}
              </div>
            </section>

            <section className="tm-card tm-filters" aria-label="Filtros">
              <span className="tm-label">Quién</span>
              <div className="tm-chips" role="group" aria-label="Quién">
                {WHO.map((w) => (
                  <button key={w.id} type="button" aria-pressed={who === w.id} className={who === w.id ? 'on' : undefined} onClick={() => setWho(w.id)}>
                    {w.label}
                  </button>
                ))}
              </div>
              <label className="tm-label" htmlFor="tm-course-filter">
                Curso
              </label>
              <select id="tm-course-filter" value={courseFilter} onChange={(e) => setCourseFilter(e.target.value)}>
                <option value="all">Todos los cursos</option>
                {filterCourses.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
                <option value="general">{GENERAL_LABEL}</option>
              </select>
            </section>
          </aside>

          <div className="tm-main">
            {!readOnly && (
              <form className="tm-card tm-form" onSubmit={publish}>
                <div className="tm-form-top">
                  <span className="tm-form-title">{editing ? 'Cambia tu valoración' : 'Valora tu experiencia'}</span>
                  <div className="tm-pick" role="radiogroup" aria-label="Puntuación">
                    {[1, 2, 3, 4, 5].map((i) => (
                      <button
                        key={i}
                        type="button"
                        role="radio"
                        aria-checked={form.rating === i}
                        aria-label={i === 1 ? '1 estrella' : `${i} estrellas`}
                        className={i <= form.rating ? 'on' : undefined}
                        onClick={() => {
                          setForm((f) => ({ ...f, rating: i, touched: true }))
                          setSaved(false)
                        }}
                      >
                        <svg aria-hidden="true" width="24" height="24" viewBox="0 0 24 24">
                          <path d={STAR} />
                        </svg>
                      </button>
                    ))}
                  </div>
                </div>
                <label className="tm-sr" htmlFor="tm-course">
                  Curso
                </label>
                <select id="tm-course" value={form.course} onChange={(e) => chooseCourse(e.target.value)}>
                  {courses.map((c) => (
                    <option key={c.id} value={c.id}>
                      Curso: {c.name}
                    </option>
                  ))}
                  <option value={GENERAL}>{GENERAL_LABEL}</option>
                </select>
                <div className="tm-form-row">
                  <label className="tm-sr" htmlFor="tm-text">
                    Tu opinión
                  </label>
                  <textarea
                    id="tm-text"
                    rows={2}
                    maxLength={BODY_MAX}
                    placeholder="¿Qué te ha parecido? (opcional)"
                    value={form.body}
                    onChange={(e) => {
                      setForm((f) => ({ ...f, body: e.target.value, touched: true }))
                      setSaved(false)
                    }}
                  />
                  <div className="tm-form-send">
                    <span className="tm-muted">
                      {form.body.length} / {BODY_MAX}
                    </span>
                    <button type="submit" className="tm-primary" disabled={busy}>
                      {busy ? 'Guardando…' : editing ? 'Guardar' : 'Publicar'}
                    </button>
                  </div>
                </div>
                {formError && <p className="tm-error">{formError}</p>}
                {saved && !formError && <p className="tm-ok">¡Gracias! Tu valoración ya se ve.</p>}
              </form>
            )}

            <div className="tm-toolbar">
              <span className="tm-label">Opiniones</span>
              <label className="tm-sort">
                Ordenar
                <select value={sort} onChange={(e) => setSort(e.target.value)}>
                  {SORTS.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.label}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            {error && <p className="tm-error">{error}</p>}

            {shown.length === 0 ? (
              <p className="tm-card tm-muted">{list.length === 0 ? 'Todavía no hay valoraciones. ¡Sé el primero!' : 'No hay valoraciones con esos filtros.'}</p>
            ) : (
              <div className="tm-list">
                {shown.map((t) => (
                  <article key={t.id} className="tm-card tm-item">
                    <div className="tm-item-top">
                      <Stars value={t.rating} />
                      <span className="tm-muted">{dateText(t.updated_at || t.created_at)}</span>
                    </div>
                    {t.body && <p className="tm-text">{t.body}</p>}
                    <div className="tm-author">
                      <span className="tm-avatar" aria-hidden="true">
                        {t.mine ? 'TÚ' : initialsOf(t.author_name)}
                      </span>
                      <div className="tm-author-text">
                        <strong>{t.mine ? 'Tú' : t.author_name}</strong>
                        <span className="tm-muted">{roleLine(t)}</span>
                      </div>
                      {!readOnly && t.can_delete && (
                        <button type="button" className="tm-delete" onClick={() => remove(t)}>
                          {t.mine ? 'Borrar' : 'Quitar'}
                        </button>
                      )}
                    </div>
                  </article>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
