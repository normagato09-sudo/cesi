-- =============================================================================
-- CIFA · Parte 27: Directivo sin Vacantes, Finanzas, Tableros, Alianzas ni Asistencia
-- =============================================================================
-- Ejecutar en Supabase → SQL Editor (proyecto fvswxhfjclvadcoyuqyu), después de la parte 26
-- (supabase/parte26_portal_para_estrenar.sql). Se puede ejecutar más de una vez. No borra datos:
-- solo cambia lo que puede ver Directivo. Las demás áreas y la ceo siguen igual.
--
-- Qué hace:
--   · area_permissions: Directivo pasa a 'none' en vacantes y asistencia (la asistencia la sigue
--     viendo dentro de cada curso, en solo lectura).
--   · cesi_alliance_role: Directivo ya no ve las alianzas (antes 'view').
--   · cesi_finance_role: Directivo ya no ve Finanzas (antes 'view').
--   · cesi_board_role: Directivo ya no ve ni comenta los tableros (antes 'comment').
--   · cesi_alliance_stats y cesi_board_counts: las cifras de alianzas y tableros, solo la ceo
--     (antes también Directivo).
--   · cesi_screen_data: igual que en la parte 24; solo cambia que en «Ver como» el área Directivo
--     tampoco ve las alianzas de los contactos.
-- Ojo: si alguna persona de Directivo tiene un permiso propio de vacantes o asistencia
-- (profile_permissions), ese permiso sigue valiendo; la comprobación del final dice cuántos hay.

do $$
begin
  if to_regprocedure('public.cesi_student_course_list()') is null then
    raise exception 'Faltan las partes 25 y 26: ejecútalas antes.';
  end if;
  if to_regprocedure('public.cesi_board_counts(uuid)') is null or to_regprocedure('public.cesi_finance_role(uuid)') is null
     or to_regprocedure('public.cesi_alliance_stats(uuid)') is null then
    raise exception 'Faltan las partes 16, 17, 19 y 23: ejecútalas antes.';
  end if;
end;
$$;

-- -----------------------------------------------------------------------------
-- Permisos de pantalla del área Directivo
-- -----------------------------------------------------------------------------
insert into public.area_permissions (area, screen, level) values
  ('direccion', 'vacantes', 'none'),
  ('direccion', 'asistencia', 'none')
on conflict (area, screen) do update set level = excluded.level;

-- -----------------------------------------------------------------------------
-- Qué puede hacer cada cuenta en Alianzas, Finanzas y los tableros
-- -----------------------------------------------------------------------------

-- Alianzas: 'edit' (Alianzas y la ceo) o null.
create or replace function public.cesi_alliance_role(p_profile uuid)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select case
    when p.role = 'ceo' then 'edit'
    when p.role = 'equipo' and p.area = 'alianzas' then 'edit'
  end
  from public.profiles p
  where p.id = p_profile;
$$;

-- Finanzas: 'edit' (Finanzas y la ceo) o null.
create or replace function public.cesi_finance_role(p_profile uuid)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select case
    when p.role = 'ceo' then 'edit'
    when p.role = 'equipo' and p.area = 'finanzas' then 'edit'
  end
  from public.profiles p
  where p.id = p_profile;
$$;

-- Tablero de `p_area`: 'edit' (las personas del área y la ceo) o null (nada; tampoco si el área no
-- tiene tablero).
create or replace function public.cesi_board_role(p_profile uuid, p_area text)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select case
    when not exists (select 1 from public.board_configs where area = p_area) then null
    when p.role = 'ceo' then 'edit'
    when p.role = 'equipo' and p.area = p_area then 'edit'
  end
  from public.profiles p
  where p.id = p_profile;
$$;

-- -----------------------------------------------------------------------------
-- Cifras de alianzas y tableros: solo la ceo (también en «Ver como»)
-- -----------------------------------------------------------------------------
create or replace function public.cesi_alliance_stats(p_as uuid default null)
returns table (closed_month integer, negotiating integer)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_me uuid := public.cesi_home_viewer(p_as);
  v_zone text := public.cesi_zone_of(v_me);
  v_month timestamptz := date_trunc('month', now() at time zone v_zone) at time zone v_zone;
begin
  if not public.is_ceo() then
    raise exception 'Sin permiso.' using errcode = '42501';
  end if;
  return query
  with a as (
    select c.data -> 'alliance' as al
    from public.contacts c
    where c.user_id in (select id from public.profiles where role = 'ceo') and c.deleted_at is null
      and jsonb_typeof(c.data -> 'alliance') = 'object' and public.cesi_is_external_contact(c.data)
  )
  select
    (select count(*) from a where al ->> 'status' = 'cerrado' and public.cesi_try_ts(al ->> 'closedAt') >= v_month)::integer,
    (select count(*) from a where al ->> 'status' = 'negociacion')::integer;
end;
$$;

create or replace function public.cesi_board_counts(p_as uuid default null)
returns table (area text, open_count integer, late_count integer, week_count integer)
language plpgsql
stable
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  v_me uuid := public.cesi_home_viewer(p_as);
  v_today date := (now() at time zone public.cesi_zone_of(v_me))::date;
  v_sunday date;
begin
  if not public.is_ceo() then
    raise exception 'Sin permiso.' using errcode = '42501';
  end if;
  v_sunday := v_today + (7 - extract(isodow from v_today)::integer);
  return query
    select b.area,
      (select count(*)::integer from public.board_items i
        where i.area = b.area and not (i.status = any (b.done_statuses))),
      (select count(*)::integer from public.board_items i
        where i.area = b.area and i.due_date is not null and i.due_date < v_today
          and (b.area = 'legal' or not (i.status = any (b.done_statuses)))),
      (select count(*)::integer from public.board_items i
        where i.area = b.area and i.due_date between v_today and v_sunday and not (i.status = any (b.done_statuses)))
    from public.board_configs b
    join public.areas a on a.id = b.area
    order by a.sort;
end;
$$;

-- -----------------------------------------------------------------------------
-- Datos de las pantallas (igual que en la parte 24 salvo «Ver como» Directivo y las alianzas)
-- -----------------------------------------------------------------------------
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
    v_alliance := case when p_area = 'alianzas' then 'edit' end;
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
      public.cesi_is_external_contact(data) as external,
      public.cesi_is_alliance_contact(data) as shared
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
      -- Contactos: solo los «de Alianzas» y solo para Alianzas y Directivo (los de la ceo, solo ella).
      when 'contactos' then case when v_alliance is null then '[]'::jsonb else coalesce((select jsonb_agg((data - 'candidacies' - 'candidateOnly') || jsonb_build_object('external', true)) from c_flags where shared), '[]'::jsonb) end
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
-- Permisos de las funciones (los mismos de antes)
-- -----------------------------------------------------------------------------
revoke all on function public.cesi_alliance_stats(uuid) from public, anon;
revoke all on function public.cesi_board_counts(uuid) from public, anon;
revoke all on function public.cesi_screen_data(text, uuid, text) from public, anon;
grant execute on function public.cesi_alliance_stats(uuid) to authenticated;
grant execute on function public.cesi_board_counts(uuid) to authenticated;
grant execute on function public.cesi_screen_data(text, uuid, text) to authenticated;

notify pgrst, 'reload schema';

-- Comprobación: Directivo sin vacantes ni asistencia ('none', 'none'), sin alianzas, finanzas ni
-- tableros (true) y cuántas personas de Directivo tienen permisos propios de vacantes o asistencia
-- (si no es 0, quítaselos en Equipo → permisos).
select
  (select level from public.area_permissions where area = 'direccion' and screen = 'vacantes') as vacantes,
  (select level from public.area_permissions where area = 'direccion' and screen = 'asistencia') as asistencia,
  position('direccion' in pg_get_functiondef('public.cesi_alliance_role(uuid)'::regprocedure)) = 0
    and position('direccion' in pg_get_functiondef('public.cesi_finance_role(uuid)'::regprocedure)) = 0
    and position('direccion' in pg_get_functiondef('public.cesi_board_role(uuid, text)'::regprocedure)) = 0 as sin_alianzas_finanzas_tableros,
  (select count(*) from public.profile_permissions pp join public.profiles p on p.id = pp.profile_id
     where p.role = 'equipo' and p.area = 'direccion' and pp.screen in ('vacantes', 'asistencia') and pp.level <> 'none') as permisos_propios;
