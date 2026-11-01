-- =============================================================================
-- CIFA · Parte 20: editar según permisos (RRHH y Directivo)
-- =============================================================================
-- Ejecutar en Supabase → SQL Editor (proyecto fvswxhfjclvadcoyuqyu), después de la parte 19
-- (supabase/parte19_finanzas.sql). Se puede ejecutar más de una vez. No borra datos ni cambia las
-- tablas de la ceo, sus reglas de acceso ni su sincronización.
--
-- Qué hace:
--   · RRHH (área personas): «Editar» en Equipo y Vacantes. Crea y edita vacantes (también las
--     cierra), añade candidatos, cambia el estado y las notas de cada candidatura, incorpora a
--     Equipo y edita las fichas de equipo (también «antiguo miembro»). No borra a nadie ni toca
--     cuentas, papeles, alianzas, contactos externos ni fotos.
--   · Directivo: crea y edita cursos (sin borrarlos), inscribe y desinscribe alumnos (solo su
--     lista de cursos) y crea clases sueltas. Alumnos y Asistencia, en solo lectura: aunque tenga
--     «Editar» en Cursos, de los alumnos recibe solo lo de «Ver» (sin email, teléfono, cumpleaños,
--     notas ni Discord; sí su disponibilidad y su zona horaria).
--   · cesi_ceo_doc_patch: la única función que escribe. La app calcula el cambio con la misma
--     lógica que la de la ceo y envía solo los campos que cambian y cómo estaban cuando se abrió
--     la ficha. La función comprueba quién puede tocar qué, aplica esos campos sobre la versión
--     del servidor y la deja como la más reciente: a la ceo le llega como un cambio de otro
--     dispositivo suyo. Si alguno de esos campos ya no está como estaba (otro lo cambió mientras
--     tanto), no guarda nada: «Esta ficha ha cambiado; vuelve a cargarla».
--   · team_edit_log: cada cambio (quién, cuándo, qué ficha, los campos de antes y de después). La
--     ceo lo ve con cesi_team_edit_log.

do $$
begin
  if to_regprocedure('public.cesi_finance_save(uuid, text, date, text, bigint, text, text, text, text, text, text)') is null then
    raise exception 'Falta la parte 19 (supabase/parte19_finanzas.sql): ejecútala antes.';
  end if;
end;
$$;

-- -----------------------------------------------------------------------------
-- Permisos: RRHH puede editar Equipo y Vacantes
-- -----------------------------------------------------------------------------
insert into public.area_permissions (area, screen, level) values
  ('personas', 'equipo', 'write'),
  ('personas', 'vacantes', 'write')
on conflict (area, screen) do update set level = excluded.level;

-- -----------------------------------------------------------------------------
-- Registro de cambios
-- -----------------------------------------------------------------------------
--   doc_table  'contacts' | 'vacancies' | 'courses' | 'students' | 'extra_classes'
--   action     'alta' | 'edicion'
--   before / after  solo los campos que cambiaron
create table if not exists public.team_edit_log (
  id bigint generated always as identity primary key,
  at timestamptz not null default now(),
  who uuid references public.profiles (id) on delete set null,
  who_name text not null default '',
  who_area text,
  doc_table text not null,
  doc_id text not null,
  doc_name text not null default '',
  action text not null,
  before jsonb,
  after jsonb
);
create index if not exists team_edit_log_at_idx on public.team_edit_log (at desc);

alter table public.team_edit_log enable row level security;
drop policy if exists "team_edit_log: leer (la ceo)" on public.team_edit_log;
create policy "team_edit_log: leer (la ceo)" on public.team_edit_log
  for select to authenticated using (public.is_ceo());
revoke all on public.team_edit_log from anon, authenticated;
grant select on public.team_edit_log to authenticated;

-- -----------------------------------------------------------------------------
-- Lo que necesita una pantalla (como en la parte 16; los alumnos, según el permiso de Alumnos)
-- -----------------------------------------------------------------------------
-- Con «Editar» en Cursos pero no en Alumnos (Directivo), los alumnos llegan como con «Ver»: sin
-- email, teléfono, cumpleaños, notas ni Discord (sí su disponibilidad y su zona horaria, para
-- organizar horarios).
create or replace function public.cesi_screen_data(p_screen text, p_as uuid default null, p_area text default null)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_me uuid := (select auth.uid());
  v_who uuid := v_me;
  v_level text;
  v_full boolean;
  v_teacher boolean;
  v_alliance text;
  v_students_full boolean;
  v_out jsonb;
begin
  if p_as is not null and p_as <> v_who then
    if not public.is_ceo() then
      raise exception 'Sin permiso.' using errcode = '42501';
    end if;
    v_who := p_as;
  end if;
  if p_screen is null or p_screen not in ('contactos', 'equipo', 'vacantes', 'cursos', 'alumnos', 'asistencia') then
    raise exception 'Pantalla no válida.' using errcode = '22023';
  end if;
  if p_area is not null then
    -- «Ver como» un área (solo la ceo): sus permisos.
    if not public.is_ceo() then
      raise exception 'Sin permiso.' using errcode = '42501';
    end if;
    v_level := coalesce((select ap.level from public.area_permissions ap where ap.area = p_area and ap.screen = p_screen), 'none');
    v_teacher := p_area = 'formacion';
    v_alliance := case when p_area = 'alianzas' then 'edit' when p_area = 'direccion' then 'view' end;
  else
    v_level := public.cesi_level_for(v_who, p_screen);
    v_teacher := public.cesi_is_teacher_only(v_who);
    v_alliance := public.cesi_alliance_role(v_who);
  end if;
  if v_level not in ('read', 'write') then
    raise exception 'No tienes acceso a esta pantalla.' using errcode = '42501';
  end if;
  v_full := v_level = 'write';
  -- Los alumnos, con su propio permiso (Alumnos): con «Editar» en Cursos no llegan completos.
  v_students_full := case when p_screen = 'alumnos' then v_full
    when p_area is not null then coalesce((select ap.level from public.area_permissions ap where ap.area = p_area and ap.screen = 'alumnos'), 'none') = 'write'
    else public.cesi_level_for(v_who, 'alumnos') = 'write' end;

  with
  ceo as (select id from public.profiles where role = 'ceo'),
  -- Cursos del profesor (ninguno en «Ver como» un área sin persona).
  my_courses as (
    select c.id from public.cesi_teacher_courses(case when p_area is null then v_who end) as c (id)
  ),
  -- Contactos (con «Ver», sin email, teléfono, notas ni foto; sin CV de equipo).
  c_all as (
    select case when v_full then c0.data
      else (c0.data - 'email' - 'phone' - 'notes' - 'photo') #- '{teamProfile,cv}' end as data
    from (select case when v_alliance is null then c.data - 'alliance' else c.data end as data, c.user_id, c.deleted_at from public.contacts c) c0
    where c0.user_id in (select id from ceo) and c0.deleted_at is null
  ),
  c_flags as (
    select data,
      (data ? 'teamProfile' and jsonb_typeof(data -> 'teamProfile') = 'object') as team,
      (data ? 'teamProfile' and jsonb_typeof(data -> 'teamProfile') = 'object'
        and coalesce(data -> 'teamProfile' ->> 'status', 'active') <> 'former'
        and not coalesce((data ->> 'archived')::boolean, false)) as active,
      (coalesce((data ->> 'candidateOnly')::boolean, false) and not (data ? 'teamProfile' and jsonb_typeof(data -> 'teamProfile') = 'object')) as candidate_only,
      (jsonb_typeof(data -> 'candidacies') = 'array' and jsonb_array_length(data -> 'candidacies') > 0) as candidate,
      public.cesi_is_external_contact(data) as external
    from c_all
  ),
  -- Candidaturas: con «Ver», sin CV ni notas.
  c_cand as (
    select case when v_full then data
      else jsonb_set(data, '{candidacies}', coalesce((
        select jsonb_agg(x - 'cv' - 'notes') from jsonb_array_elements(data -> 'candidacies') as x
      ), '[]'::jsonb)) end as data
    from c_flags
    where candidate
  ),
  -- Profesores (para los cursos): solo lo que hace falta para nombrarlos y su disponibilidad.
  c_teachers as (
    select jsonb_build_object(
      'id', data ->> 'id', 'name', data ->> 'name', 'country', data -> 'country', 'timeZone', data -> 'timeZone',
      'availability', data -> 'availability',
      'teamProfile', jsonb_build_object('status', data -> 'teamProfile' -> 'status', 'area', data -> 'teamProfile' -> 'area',
        'role', data -> 'teamProfile' -> 'role', 'roles', data -> 'teamProfile' -> 'roles')
    ) as data
    from c_flags
    where team
  ),
  courses as (
    select co.data from public.courses co
    where co.user_id in (select id from ceo) and co.deleted_at is null
      and (not v_teacher or co.id in (select id from my_courses))
  ),
  -- Alumnos (con «Ver», sin email, teléfono, cumpleaños, notas ni Discord). Al profesor, solo los
  -- de sus cursos y, en courseIds, solo esos cursos.
  s_rows as (
    select case when v_students_full then s.data else s.data - 'email' - 'phone' - 'birthday' - 'notes' - 'discord' end as data
    from public.students s
    where s.user_id in (select id from ceo) and s.deleted_at is null
      and (not v_teacher or (
        jsonb_typeof(s.data -> 'courseIds') = 'array'
        and exists (select 1 from jsonb_array_elements_text(s.data -> 'courseIds') x where x in (select id from my_courses))
      ))
  ),
  s_all as (
    select case when v_teacher then jsonb_set(data, '{courseIds}', coalesce((
        select jsonb_agg(x) from jsonb_array_elements_text(data -> 'courseIds') x where x in (select id from my_courses)
      ), '[]'::jsonb)) else data end as data
    from s_rows
  )
  select jsonb_build_object(
    'level', v_level,
    'teacher', v_teacher,
    'canMark', v_teacher and p_area is null and v_who = v_me,
    'alliance', v_alliance is not null,
    'allianceEdit', coalesce(v_alliance = 'edit', false) and p_area is null and v_who = v_me and not public.is_ceo(),
    'contacts', case p_screen
      -- external: contacto externo (lo puede editar Alianzas).
      when 'contactos' then coalesce((select jsonb_agg((data - 'candidacies' - 'candidateOnly') || jsonb_build_object('external', external)) from c_flags where not active and not candidate_only), '[]'::jsonb)
      when 'equipo' then coalesce((select jsonb_agg(data - 'candidacies' - 'candidateOnly') from c_flags where team), '[]'::jsonb)
      when 'vacantes' then coalesce((select jsonb_agg(data) from c_cand), '[]'::jsonb)
      else coalesce((select jsonb_agg(data) from c_teachers), '[]'::jsonb)
    end,
    'groups', case when p_screen in ('contactos', 'equipo') then coalesce((
        select jsonb_agg(g.data) from public.groups g where g.user_id in (select id from ceo) and g.deleted_at is null
      ), '[]'::jsonb) else '[]'::jsonb end,
    'vacancies', case when p_screen = 'vacantes' then coalesce((
        select jsonb_agg(v.data) from public.vacancies v where v.user_id in (select id from ceo) and v.deleted_at is null
      ), '[]'::jsonb) else '[]'::jsonb end,
    'courses', case when p_screen in ('cursos', 'alumnos', 'asistencia') then coalesce((select jsonb_agg(data) from courses), '[]'::jsonb) else '[]'::jsonb end,
    'students', case when p_screen in ('cursos', 'alumnos', 'asistencia') then coalesce((select jsonb_agg(data) from s_all), '[]'::jsonb) else '[]'::jsonb end,
    'attendance', case when p_screen in ('cursos', 'alumnos', 'asistencia') then coalesce((
        select jsonb_agg(a.data) from public.attendance a
        where a.user_id in (select id from ceo) and a.deleted_at is null
          and (not v_teacher or a.data ->> 'courseId' in (select id from my_courses))
      ), '[]'::jsonb) else '[]'::jsonb end,
    'extraClasses', case when p_screen in ('cursos', 'alumnos', 'asistencia') then coalesce((
        select jsonb_agg(x.data) from public.extra_classes x
        where x.user_id in (select id from ceo) and x.deleted_at is null
          and (not v_teacher or x.data ->> 'courseId' in (select id from my_courses))
      ), '[]'::jsonb) else '[]'::jsonb end
  ) into v_out;
  return v_out;
end;
$$;

-- -----------------------------------------------------------------------------
-- Escribir en los datos de la ceo
-- -----------------------------------------------------------------------------
-- p_table: 'contacts' | 'vacancies' | 'courses' | 'students' | 'extra_classes'
-- p_id: el id del documento (al crear, el que ha generado la app).
-- p_patch: los campos que cambian ({ campo: valor nuevo }; null para quitarlo).
-- p_before: cómo estaban esos campos al abrir la ficha (para no pisar un cambio de otro).
-- p_create: crear el documento (si ya existe, error).
-- Quién puede qué:
--   RRHH          contacts (fichas de equipo y candidatos: ni fotos, ni alianzas; crear solo un
--                 candidato) y vacancies (crear y editar)
--   Directivo     courses (crear y editar), students (solo courseIds) y extra_classes (crear)
-- Nadie borra con esta función. Devuelve el documento guardado.
create or replace function public.cesi_ceo_doc_patch(p_table text, p_id text, p_patch jsonb, p_before jsonb, p_create boolean default false)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_me uuid := (select auth.uid());
  v_area text;
  v_ceo uuid;
  v_old jsonb;
  v_stamp_old timestamptz;
  v_new jsonb;
  v_stamp timestamptz;
  v_key text;
  v_changed jsonb := '{}'::jsonb;
  v_was jsonb := '{}'::jsonb;
  v_patch jsonb := coalesce(p_patch, '{}'::jsonb);
  v_before jsonb := coalesce(p_before, '{}'::jsonb);
  v_rrhh boolean;
  v_dir boolean;
begin
  select area into v_area from public.profiles where id = v_me and role = 'equipo';
  v_rrhh := v_area = 'personas';
  v_dir := v_area = 'direccion';
  if p_table is null or p_table not in ('contacts', 'vacancies', 'courses', 'students', 'extra_classes') then
    raise exception 'Tabla no válida.' using errcode = '22023';
  end if;
  if not coalesce(case p_table
      when 'contacts' then v_rrhh
      when 'vacancies' then v_rrhh
      else v_dir
    end, false) then
    raise exception 'No tienes permiso para cambiar estos datos.' using errcode = '42501';
  end if;
  if p_id is null or length(p_id) not between 1 and 200 or jsonb_typeof(v_patch) <> 'object' or v_patch = '{}'::jsonb then
    raise exception 'Cambio no válido.' using errcode = '22023';
  end if;
  if v_patch ?| array['id', 'createdAt', 'updatedAt'] then
    raise exception 'Cambio no válido.' using errcode = '22023';
  end if;

  -- Qué campos puede tocar cada uno.
  if p_table = 'contacts' and v_patch ?| array['photo', 'alliance', 'external'] then
    raise exception 'RRHH no puede cambiar la foto ni la alianza de un contacto.' using errcode = '42501';
  end if;
  if p_table = 'students' and (select count(*) from jsonb_object_keys(v_patch) k where k <> 'courseIds') > 0 then
    raise exception 'De los alumnos solo se pueden cambiar sus cursos.' using errcode = '42501';
  end if;
  if p_table = 'students' and p_create then
    raise exception 'Directivo no puede crear alumnos.' using errcode = '42501';
  end if;
  if p_table = 'extra_classes' and not p_create then
    raise exception 'Directivo solo puede crear clases sueltas.' using errcode = '42501';
  end if;

  select id into v_ceo from public.profiles where role = 'ceo' order by created_at limit 1;
  if v_ceo is null then
    raise exception 'No hay cuenta de la dirección.' using errcode = '22023';
  end if;
  execute format('select data, updated_at from public.%I where user_id = $1 and id = $2 and deleted_at is null for update', p_table)
    into v_old, v_stamp_old using v_ceo, p_id;

  if p_create then
    if v_old is not null then
      raise exception 'Ya existe.' using errcode = '22023';
    end if;
    v_old := jsonb_build_object('createdAt', public.cesi_iso(clock_timestamp()));
  elsif v_old is null then
    raise exception 'Esa ficha ya no existe.' using errcode = '22023';
  else
    -- Si alguno de los campos ya no está como estaba al abrir la ficha, no se guarda nada.
    for v_key in select jsonb_object_keys(v_patch) loop
      if coalesce(v_old -> v_key, 'null'::jsonb) is distinct from coalesce(v_before -> v_key, 'null'::jsonb) then
        raise exception 'Esta ficha ha cambiado mientras la editabas; vuelve a cargarla.' using errcode = '40001';
      end if;
    end loop;
  end if;

  -- Contactos (RRHH): solo fichas de equipo o de candidatos (antes y después).
  if p_table = 'contacts' then
    if not p_create and not (
      (jsonb_typeof(v_old -> 'teamProfile') = 'object')
      or (jsonb_typeof(v_old -> 'candidacies') = 'array' and jsonb_array_length(v_old -> 'candidacies') > 0)
    ) then
      raise exception 'RRHH solo puede cambiar fichas de equipo y de candidatos.' using errcode = '42501';
    end if;
    if p_create and not (jsonb_typeof(v_patch -> 'candidacies') = 'array' and jsonb_array_length(v_patch -> 'candidacies') > 0) then
      raise exception 'RRHH solo puede crear candidatos.' using errcode = '42501';
    end if;
  end if;
  -- Clase suelta: de un curso que existe.
  if p_table = 'extra_classes' and not exists (
    select 1 from public.courses co where co.user_id = v_ceo and co.id = v_patch ->> 'courseId' and co.deleted_at is null
  ) then
    raise exception 'Ese curso no existe.' using errcode = '22023';
  end if;
  -- Inscripciones: solo en cursos que existen.
  if p_table = 'students' and jsonb_typeof(v_patch -> 'courseIds') <> 'array' then
    raise exception 'Cursos no válidos.' using errcode = '22023';
  end if;
  if p_table = 'students' and exists (
    select 1 from jsonb_array_elements_text(v_patch -> 'courseIds') x
    where not exists (select 1 from public.courses co where co.user_id = v_ceo and co.id = x and co.deleted_at is null)
      and not ((v_old -> 'courseIds') ? x)
  ) then
    raise exception 'Alguno de esos cursos no existe.' using errcode = '22023';
  end if;

  -- Los campos que de verdad cambian (para el registro).
  for v_key in select jsonb_object_keys(v_patch) loop
    if coalesce(v_old -> v_key, 'null'::jsonb) is distinct from (v_patch -> v_key) then
      v_changed := v_changed || jsonb_build_object(v_key, v_patch -> v_key);
      v_was := v_was || jsonb_build_object(v_key, coalesce(v_old -> v_key, 'null'::jsonb));
    end if;
  end loop;
  if v_changed = '{}'::jsonb and not p_create then
    return v_old;
  end if;

  v_stamp := greatest(clock_timestamp(), coalesce(v_stamp_old + interval '1 millisecond', '-infinity'));
  v_new := v_old || v_patch || jsonb_build_object('id', p_id, 'updatedAt', public.cesi_iso(v_stamp));
  execute format(
    'insert into public.%I (user_id, id, data, updated_at, deleted_at) values ($1, $2, $3, $4, null)
     on conflict (user_id, id) do update set data = excluded.data, updated_at = excluded.updated_at, deleted_at = null',
    p_table) using v_ceo, p_id, v_new, v_stamp;

  insert into public.team_edit_log (who, who_name, who_area, doc_table, doc_id, doc_name, action, before, after)
  values (v_me, public.cesi_person_name(v_me), v_area, p_table, p_id,
    left(coalesce(nullif(v_new ->> 'name', ''), nullif(v_new ->> 'title', ''), nullif(v_new ->> 'note', ''), ''), 200),
    case when p_create then 'alta' else 'edicion' end,
    case when p_create then null else v_was end, v_changed);
  return v_new;
end;
$$;

-- Registro de cambios de RRHH y Directivo en los datos de la ceo (solo la ceo), los más nuevos
-- primero.
create or replace function public.cesi_team_edit_log(p_limit integer default 300)
returns table (
  id bigint, at timestamptz, who_name text, who_area text, doc_table text, doc_id text, doc_name text,
  action text, before jsonb, after jsonb
)
language plpgsql
stable
security definer
set search_path = ''
as $$
#variable_conflict use_column
begin
  if not public.is_ceo() then
    raise exception 'Solo la dirección ve el registro de cambios.' using errcode = '42501';
  end if;
  return query
    select l.id, l.at, l.who_name, l.who_area, l.doc_table, l.doc_id, l.doc_name, l.action, l.before, l.after
    from public.team_edit_log l
    order by l.at desc, l.id desc
    limit least(greatest(coalesce(p_limit, 300), 1), 1000);
end;
$$;

-- -----------------------------------------------------------------------------
-- Permisos de las funciones
-- -----------------------------------------------------------------------------
revoke all on function public.cesi_screen_data(text, uuid, text) from public, anon;
revoke all on function public.cesi_ceo_doc_patch(text, text, jsonb, jsonb, boolean) from public, anon;
revoke all on function public.cesi_team_edit_log(integer) from public, anon;
grant execute on function public.cesi_screen_data(text, uuid, text) to authenticated;
grant execute on function public.cesi_ceo_doc_patch(text, text, jsonb, jsonb, boolean) to authenticated;
grant execute on function public.cesi_team_edit_log(integer) to authenticated;

notify pgrst, 'reload schema';

-- Comprobación: RRHH con «Editar» en equipo y vacantes, la tabla del registro y las 2 funciones
-- nuevas con permiso (2).
select
  (select string_agg(screen || '=' || level, ', ' order by screen) from public.area_permissions
     where area = 'personas' and level <> 'none') as rrhh,
  to_regclass('public.team_edit_log') is not null as registro,
  (select count(*) from unnest(array[
     'public.cesi_ceo_doc_patch(text, text, jsonb, jsonb, boolean)', 'public.cesi_team_edit_log(integer)'
   ]) as f (sig) where has_function_privilege('authenticated', f.sig, 'execute')) as funciones_con_permiso;
