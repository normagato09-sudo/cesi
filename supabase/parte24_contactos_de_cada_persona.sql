-- =============================================================================
-- CIFA · Parte 24: contactos de cada persona y los de Alianzas
-- =============================================================================
-- Ejecutar en Supabase → SQL Editor (proyecto fvswxhfjclvadcoyuqyu), después de la parte 23
-- (supabase/parte23_inicios_por_area.sql). Se puede ejecutar más de una vez. No borra ni cambia
-- datos de la ceo ni su sincronización.
--
-- Qué hace:
--   · team_contacts y team_contact_groups: los contactos (y sus grupos) de cada persona de equipo.
--     Privados: solo los ve, crea, edita y borra su dueño (nadie más, tampoco la ceo).
--   · Los contactos de la ceo solo los ve ella. Del equipo, solo Alianzas (edita) y Directivo
--     (ve) reciben los «de Alianzas»: contactos externos de la ceo con seguimiento de alianza o
--     marcados como compartidos (data.allianceShared, que la ceo pone o quita en su ficha y que
--     llevan siempre los que crea Alianzas). Se quedan en los datos de la ceo: no se mueve nada
--     (seguimiento, notas, Finanzas y la sincronización siguen igual).
--   · Las funciones de Alianzas (parte 16) solo tocan contactos «de Alianzas».
--   · cesi_finance_contacts: los patrocinadores de Alianzas (solo el nombre), también los
--     compartidos sin seguimiento todavía.

do $$
begin
  if to_regprocedure('public.cesi_board_counts(uuid)') is null or to_regprocedure('public.cesi_external_contact(text)') is null then
    raise exception 'Faltan las partes anteriores (16 y 23): ejecútalas antes.';
  end if;
end;
$$;

-- -----------------------------------------------------------------------------
-- Contactos de cada persona de equipo
-- -----------------------------------------------------------------------------
create table if not exists public.team_contact_groups (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  name text not null check (length(trim(name)) between 1 and 80),
  color text not null default '' check (length(color) <= 20),
  created_at timestamptz not null default now()
);
create index if not exists team_contact_groups_owner_idx on public.team_contact_groups (owner_id);

create table if not exists public.team_contacts (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  name text not null check (length(trim(name)) between 1 and 200),
  organization text not null default '' check (length(organization) <= 200),
  role text not null default '' check (length(role) <= 200),
  country text not null default '' check (length(country) <= 10),
  time_zone text not null default '' check (length(time_zone) <= 64),
  email text not null default '' check (length(email) <= 200),
  phone text not null default '' check (length(phone) <= 60),
  notes text not null default '' check (length(notes) <= 4000),
  group_ids uuid[] not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists team_contacts_owner_idx on public.team_contacts (owner_id);

-- ¿Es una persona de equipo? (los contactos personales son del equipo; la ceo tiene los suyos)
create or replace function public.cesi_is_team_member(p_profile uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (select 1 from public.profiles where id = p_profile and role = 'equipo');
$$;

revoke all on function public.cesi_is_team_member(uuid) from public, anon;
grant execute on function public.cesi_is_team_member(uuid) to authenticated;

-- Al cambiar un contacto, la fecha (sin que nadie la pueda poner a mano).
create or replace function public.cesi_team_contacts_touch()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  new.owner_id := coalesce(old.owner_id, new.owner_id);
  return new;
end;
$$;

revoke all on function public.cesi_team_contacts_touch() from public, anon, authenticated;

drop trigger if exists team_contacts_touch on public.team_contacts;
create trigger team_contacts_touch
  before update on public.team_contacts
  for each row execute function public.cesi_team_contacts_touch();

alter table public.team_contacts enable row level security;
alter table public.team_contact_groups enable row level security;

drop policy if exists "team_contacts: solo los míos" on public.team_contacts;
create policy "team_contacts: solo los míos" on public.team_contacts
  for all to authenticated
  using (owner_id = (select auth.uid()) and public.cesi_is_team_member((select auth.uid())))
  with check (owner_id = (select auth.uid()) and public.cesi_is_team_member((select auth.uid())));

drop policy if exists "team_contact_groups: solo los míos" on public.team_contact_groups;
create policy "team_contact_groups: solo los míos" on public.team_contact_groups
  for all to authenticated
  using (owner_id = (select auth.uid()) and public.cesi_is_team_member((select auth.uid())))
  with check (owner_id = (select auth.uid()) and public.cesi_is_team_member((select auth.uid())));

revoke all on public.team_contacts, public.team_contact_groups from anon;
grant select, insert, update, delete on public.team_contacts, public.team_contact_groups to authenticated;

-- Al borrar un grupo, se quita de los contactos de su dueño.
create or replace function public.cesi_team_contact_group_gone()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.team_contacts set group_ids = array_remove(group_ids, old.id)
  where owner_id = old.owner_id and old.id = any (group_ids);
  return old;
end;
$$;

revoke all on function public.cesi_team_contact_group_gone() from public, anon, authenticated;

drop trigger if exists team_contact_groups_gone on public.team_contact_groups;
create trigger team_contact_groups_gone
  after delete on public.team_contact_groups
  for each row execute function public.cesi_team_contact_group_gone();

-- -----------------------------------------------------------------------------
-- Contactos «de Alianzas» (en los datos de la ceo)
-- -----------------------------------------------------------------------------
-- ¿Es de Alianzas? Contacto externo con seguimiento de alianza o compartido por la ceo.
create or replace function public.cesi_is_alliance_contact(p_data jsonb)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select public.cesi_is_external_contact(p_data)
    and (jsonb_typeof(p_data -> 'alliance') = 'object' or coalesce((p_data ->> 'allianceShared')::boolean, false));
$$;

revoke all on function public.cesi_is_alliance_contact(jsonb) from public, anon, authenticated;

-- -----------------------------------------------------------------------------
-- Lo que necesita una pantalla (como en la parte 20; en Contactos, solo los «de Alianzas» y solo
-- para Alianzas y Directivo)
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
-- Alianzas solo toca contactos «de Alianzas» (como en la parte 16)
-- -----------------------------------------------------------------------------
create or replace function public.cesi_external_contact(p_id text, out o_ceo uuid, out o_data jsonb, out o_stamp timestamptz)
language plpgsql
volatile
security definer
set search_path = ''
as $$
begin
  select c.user_id, c.data, c.updated_at into o_ceo, o_data, o_stamp
  from public.contacts c
  where c.id = p_id and c.deleted_at is null and c.user_id in (select id from public.profiles where role = 'ceo')
  limit 1
  for update;
  if o_ceo is null then
    raise exception 'Ese contacto ya no existe.' using errcode = '22023';
  end if;
  if not public.cesi_is_alliance_contact(o_data) then
    raise exception 'Solo se pueden cambiar los contactos de Alianzas.' using errcode = '42501';
  end if;
end;
$$;

create or replace function public.cesi_external_contact_save(p_id text, p_data jsonb)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_me uuid := public.cesi_alliance_writer();
  v_ceo uuid;
  v_old jsonb := '{}'::jsonb;
  v_stamp timestamptz;
  v_id text := p_id;
  v_name text := trim(coalesce(p_data ->> 'name', ''));
  v_patch jsonb;
begin
  if length(v_name) = 0 or length(v_name) > 200 then
    raise exception 'Escribe el nombre (como mucho 200 caracteres).' using errcode = '22023';
  end if;
  if coalesce(p_data ->> 'country', '') = '' or coalesce(p_data ->> 'timeZone', '') = '' then
    raise exception 'El país es obligatorio.' using errcode = '22023';
  end if;
  if length(coalesce(p_data ->> 'notes', '')) > 4000 or length(coalesce(p_data ->> 'email', '')) > 200
     or length(coalesce(p_data ->> 'phone', '')) > 60 or length(coalesce(p_data ->> 'organization', '')) > 200
     or length(coalesce(p_data ->> 'role', '')) > 200 then
    raise exception 'Algún dato es demasiado largo.' using errcode = '22023';
  end if;

  if v_id is null then
    select id into v_ceo from public.profiles where role = 'ceo' order by created_at limit 1;
    if v_ceo is null then
      raise exception 'No hay cuenta de la dirección.' using errcode = '22023';
    end if;
    v_id := gen_random_uuid()::text;
    -- Los que crea Alianzas son siempre «de Alianzas».
    v_old := jsonb_build_object('photo', null, 'allianceShared', true, 'createdAt', public.cesi_iso(clock_timestamp()));
  else
    select o_ceo, o_data, o_stamp into v_ceo, v_old, v_stamp from public.cesi_external_contact(v_id);
  end if;

  v_patch := jsonb_build_object(
    'name', v_name,
    'email', trim(coalesce(p_data ->> 'email', '')),
    'phone', trim(coalesce(p_data ->> 'phone', '')),
    'organization', trim(coalesce(p_data ->> 'organization', '')),
    'role', trim(coalesce(p_data ->> 'role', '')),
    'notes', trim(coalesce(p_data ->> 'notes', '')),
    'groupIds', case when jsonb_typeof(p_data -> 'groupIds') = 'array' then p_data -> 'groupIds' else '[]'::jsonb end,
    'country', p_data ->> 'country',
    'timeZone', p_data ->> 'timeZone',
    'countryUnreviewed', false,
    'availability', case when jsonb_typeof(p_data -> 'availability') = 'object' then p_data -> 'availability' else 'null'::jsonb end
  );
  return public.cesi_contact_write(v_ceo, v_id, v_old || v_patch, v_stamp);
end;
$$;

-- -----------------------------------------------------------------------------
-- Finanzas: los patrocinadores de Alianzas (solo el nombre)
-- -----------------------------------------------------------------------------
create or replace function public.cesi_finance_contacts()
returns table (id text, name text)
language plpgsql
stable
security definer
set search_path = ''
as $$
#variable_conflict use_column
begin
  perform public.cesi_finance_writer();
  return query
    select c.id, coalesce(nullif(trim(c.data ->> 'name'), ''), 'Sin nombre')
    from public.contacts c
    where c.user_id in (select id from public.profiles where role = 'ceo') and c.deleted_at is null
      and public.cesi_is_alliance_contact(c.data)
    order by 2;
end;
$$;

-- -----------------------------------------------------------------------------
-- Permisos de las funciones
-- -----------------------------------------------------------------------------
revoke all on function public.cesi_screen_data(text, uuid, text) from public, anon;
revoke all on function public.cesi_external_contact(text) from public, anon, authenticated;
revoke all on function public.cesi_external_contact_save(text, jsonb) from public, anon;
revoke all on function public.cesi_finance_contacts() from public, anon;
grant execute on function public.cesi_screen_data(text, uuid, text) to authenticated;
grant execute on function public.cesi_external_contact_save(text, jsonb) to authenticated;
grant execute on function public.cesi_finance_contacts() to authenticated;

notify pgrst, 'reload schema';

-- Comprobación: las 2 tablas nuevas, cuántos contactos de la ceo son «de Alianzas» y cuántos
-- contactos personales hay.
select
  to_regclass('public.team_contacts') is not null and to_regclass('public.team_contact_groups') is not null as tablas,
  (select count(*) from public.contacts c
     where c.deleted_at is null and c.user_id in (select id from public.profiles where role = 'ceo')
       and public.cesi_is_alliance_contact(c.data)) as contactos_de_alianzas,
  (select count(*) from public.team_contacts) as contactos_personales;
