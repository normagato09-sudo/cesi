import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { APPLICATION_STATUSES, applyArgs, applyResultText, canSeeApplications, emptyApplication, publicApplyArgs, validateApplication } from './vacancyApplications'
import { loadPublicVacancies, sendPublicApplication } from './vacanciesPublic'

const sql = readFileSync(new URL('../../supabase/parte40_candidaturas.sql', import.meta.url), 'utf8').replace(/\r\n/g, '\n')

// El cuerpo de una función del SQL (de «create or replace function public.<fn>(» a su «$$;»).
function body(fn) {
  const start = sql.indexOf(`create or replace function public.${fn}(`)
  expect(start, fn).toBeGreaterThan(-1)
  const open = sql.indexOf('$$', start)
  return sql.slice(start, sql.indexOf('$$;', open + 2))
}

describe('candidaturas: el formulario', () => {
  const ok = { ...emptyApplication(), motivation: 'Me encanta enseñar', email: 'ana@correo.es' }

  it('en la app: por qué le interesa, obligatorio; el correo, si lo pone, válido', () => {
    expect(validateApplication(ok)).toBe(null)
    expect(validateApplication({ ...ok, motivation: '  ' })).toMatch(/por qué/)
    expect(validateApplication({ ...ok, email: 'ana' })).toMatch(/correo/)
    expect(validateApplication({ ...ok, email: '' })).toBe(null)
    expect(validateApplication({ ...ok, experience: 'x'.repeat(2001) })).toMatch(/largo/)
  })

  it('en la página pública: nombre, correo y consentimiento obligatorios', () => {
    const pub = { ...ok, name: 'Ana', consent: true }
    expect(validateApplication(pub, { publicForm: true })).toBe(null)
    expect(validateApplication({ ...pub, name: 'A' }, { publicForm: true })).toMatch(/nombre/)
    expect(validateApplication({ ...pub, email: '' }, { publicForm: true })).toMatch(/correo/)
    expect(validateApplication({ ...pub, consent: false }, { publicForm: true })).toMatch(/casilla/)
  })

  it('lo que se envía (sin la @ del Discord; el campo oculto va aparte)', () => {
    expect(applyArgs('v1', { ...ok, discord: '@ana_99' })).toEqual({ p_vacancy: 'v1', p_motivation: 'Me encanta enseñar', p_experience: '', p_availability: '', p_discord: 'ana_99', p_email: 'ana@correo.es' })
    expect(publicApplyArgs('v1', { ...ok, name: ' Ana ', consent: true, website: '' })).toMatchObject({ p_name: 'Ana', p_consent: true, p_website: '' })
    expect(applyResultText({ status: 'ok' })).toBe(null)
    expect(applyResultText({ status: 'duplicate' })).toMatch(/Ya habías/)
    expect(applyResultText({ status: 'limit' })).toMatch(/demasiadas/)
  })

  it('estados y quién del equipo ve candidaturas (solo RRHH)', () => {
    expect(APPLICATION_STATUSES.map((s) => s.label)).toEqual(['Nueva', 'Vista', 'Entrevista', 'Aceptada', 'Descartada'])
    expect(['personas', 'direccion', 'media', 'formacion', null].map(canSeeApplications)).toEqual([true, false, false, false, false])
  })
})

describe('candidaturas: permisos en la base de datos (parte 40)', () => {
  it('la tabla está cerrada a todos: sin permisos ni reglas de acceso', () => {
    expect(sql).toContain('alter table public.vacancy_applications enable row level security;')
    expect(sql).toContain('revoke all on public.vacancy_applications from public, anon, authenticated;')
    expect(sql).not.toMatch(/create policy/i)
    expect(sql).not.toMatch(/grant [a-z, ]+ on (table )?public\.vacancy_applications/i)
  })

  it('la página pública (anon) solo puede ver las vacantes abiertas y enviar, nunca leer candidaturas', () => {
    const toAnon = [...sql.matchAll(/grant execute on function public\.(\w+)\([^)]*\) to ([a-z, ]+);/g)].filter((m) => /\banon\b/.test(m[2])).map((m) => m[1])
    expect(toAnon.sort()).toEqual(['cesi_open_vacancies', 'cesi_public_apply'])
    for (const fn of ['cesi_vacancy_apply', 'cesi_my_applications', 'cesi_vacancy_applications', 'cesi_vacancy_application_counts', 'cesi_applications_unseen', 'cesi_application_set_status', 'cesi_applications_mark_seen']) {
      expect(sql, fn).toMatch(new RegExp(`revoke all on function public\\.${fn}\\([^)]*\\) from public, anon;`))
    }
    // Enviar solo devuelve un estado: ni lee ni devuelve filas de la tabla.
    const send = body('cesi_public_apply')
    expect(send).toContain('returns jsonb')
    expect(send).not.toMatch(/return query/)
    expect(send).not.toMatch(/returning/)
    // La lista pública no toca las candidaturas.
    expect(body('cesi_open_vacancies')).not.toContain('vacancy_applications')
  })

  it('contra el spam: campo oculto, consentimiento, límites de envíos y una por correo y vacante', () => {
    const send = body('cesi_public_apply')
    expect(send).toMatch(/if coalesce\(trim\(p_website\), ''\) <> '' then\s+return jsonb_build_object\('status', 'ok'\);/)
    expect(send).toContain('if not coalesce(p_consent, false) then')
    expect(send).toContain(">= 40")
    expect(send).toContain('a.ip_hash = v_ip_hash')
    expect(send).toContain("interval '1 day') >= 3")
    expect(send).toContain("return jsonb_build_object('status', 'duplicate')")
    expect(send).toContain('pg_advisory_xact_lock')
    expect(send).toContain('cesi_vacancy_is_open(p_vacancy)')
  })

  it('ven todas y cambian su estado solo la ceo y RRHH (Directivo no)', () => {
    expect(body('cesi_application_viewer')).toContain("role = 'ceo' or (role = 'equipo' and area = 'personas')")
    expect(body('cesi_application_viewer')).not.toContain('direccion')
    for (const fn of ['cesi_vacancy_applications', 'cesi_vacancy_application_counts', 'cesi_application_set_status']) {
      expect(body(fn), fn).toContain('perform public.cesi_application_me();')
    }
    expect(sql).toContain('revoke all on function public.cesi_application_viewer(uuid) from public, anon, authenticated;')
    expect(sql).toContain('revoke all on function public.cesi_application_me() from public, anon, authenticated;')
  })

  it('cada cuenta ve solo las suyas; los avisos, solo la ceo', () => {
    expect(body('cesi_my_applications')).toContain('where a.user_id = (select auth.uid()) and (select auth.uid()) is not null')
    expect(body('cesi_applications_unseen')).toContain('case when public.is_ceo() then')
    expect(body('cesi_applications_mark_seen')).toContain('if not public.is_ceo() then')
    // Postularse desde la app: solo alumnos y equipo, a una abierta, con su cuenta.
    const apply = body('cesi_vacancy_apply')
    expect(apply).toContain("v_acc.role not in ('alumno', 'equipo')")
    expect(apply).toContain('cesi_vacancy_is_open(p_vacancy)')
    expect(apply).toMatch(/values \(p_vacancy, v_me, 'cuenta'/)
  })

  it('no cambia quién gestiona las vacantes (parte 38)', () => {
    for (const fn of ['cesi_vacancy_access', 'cesi_vacancy_me', 'cesi_vacancies_list', 'cesi_vacancy_save', 'cesi_vacancy_delete']) {
      expect(sql, fn).not.toContain(`function public.${fn}(`)
    }
  })
})

describe('página pública /vacantes', () => {
  const config = (calls, reply) => ({
    url: 'https://x.supabase.co',
    anonKey: 'anon',
    fetchImpl: async (url, init) => {
      calls.push({ url, body: JSON.parse(init.body) })
      return { ok: true, json: async () => reply }
    },
  })

  it('solo llama a las dos funciones públicas', async () => {
    const calls = []
    const list = await loadPublicVacancies(config(calls, [{ id: 'v1', title: 'Locutor', area: 'Media', hours_per_week: '3 h', seats: 2 }]))
    expect(list[0]).toMatchObject({ id: 'v1', title: 'Locutor', status: 'abierta', seats: 2 })
    await sendPublicApplication(config(calls, { status: 'ok' }), 'v1', { ...emptyApplication(), name: 'Ana', email: 'a@b.es', motivation: 'Sí', consent: true })
    expect(calls.map((c) => c.url.split('/rpc/')[1])).toEqual(['cesi_open_vacancies', 'cesi_public_apply'])
    expect(calls[1].body).toMatchObject({ p_vacancy: 'v1', p_name: 'Ana', p_consent: true, p_website: '' })
  })

  it('los errores de la función se enseñan claros', async () => {
    const failing = { url: 'u', anonKey: 'k', fetchImpl: async () => ({ ok: false, json: async () => ({ message: 'Esta vacante ya no está abierta.' }) }) }
    await expect(sendPublicApplication(failing, 'v1', emptyApplication())).rejects.toThrow('Esta vacante ya no está abierta.')
    const offline = { url: 'u', anonKey: 'k', fetchImpl: async () => Promise.reject(new Error('x')) }
    await expect(loadPublicVacancies(offline)).rejects.toThrow(/conexión/)
  })
})
