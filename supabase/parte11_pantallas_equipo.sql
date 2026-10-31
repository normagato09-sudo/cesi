-- =============================================================================
-- CIFA · Parte 11: las pantallas de la ceo para el equipo, en solo lectura
-- =============================================================================
-- Ejecutar en Supabase → SQL Editor (proyecto fvswxhfjclvadcoyuqyu), después de las partes 2 y 5.
-- Se puede ejecutar más de una vez. No borra ni cambia datos, ni las reglas de acceso ni la
-- sincronización de la ceo: solo crea dos funciones de lectura.
--
-- Qué hace:
--   · Permisos fijos por área (area_permissions), los de la tabla de abajo; el resto, «none».
--     Borra los permisos propios de cada persona (las filas de profile_permissions; la tabla se
--     queda) para que mande solo el área. Los permisos se cambian aquí, no desde la app.
--   · cesi_screen_data(pantalla): lo que necesita una pantalla (contactos, equipo, vacantes,
--     cursos, alumnos o asistencia), leído de los datos de la ceo, para una persona de equipo con
--     permiso «Ver» o «Editar» en esa pantalla. Sin permiso, error. Solo devuelve lo de esa
--     pantalla y nunca reuniones ni calendario.
--   · Con «Ver» quita, antes de enviarlo: email, teléfono, notas y foto de los contactos; el CV
--     de los miembros del equipo; el CV y las notas de las candidaturas; y email, teléfono,
--     cumpleaños, notas y Discord de los alumnos. Con «Editar» va todo.
--   · p_as / p_area: solo la ceo, para «Ver como» una persona o un área (con sus permisos y los
--     mismos datos).
--
-- Permisos por área (Calendario, Tareas y Fichaje los tienen todos siempre; «calendario»,
-- «huecos» y «fichajes» de area_permissions quedan en none):
--   Directivo:  contactos, equipo, vacantes, alumnos, asistencia = Ver; cursos = Editar
--   Profesor:   cursos, alumnos, asistencia = Ver
--   RRHH:       equipo, vacantes = Ver
--   Alianzas:   contactos = Ver
--   Moderación, Media, Finanzas, Legal, Técnico, Ciberseguridad: nada por ahora
--   (De momento todo se ve en solo lectura, también con «Editar».)

do $$
begin
  if to_regprocedure('public.cesi_my_level(text)') is null then
    raise exception 'Falta la parte 2 (supabase/parte2_papeles_permisos.sql): ejecútala antes.';
  end if;
  if not exists (select 1 from public.areas where id = 'direccion') then
    raise exception 'Faltan las áreas: ejecuta antes la parte 5 (supabase/parte5_areas.sql).';
  end if;
end;
$$;

-- ---------------------------------------------------------------------------
-- Permisos fijos por área
-- ---------------------------------------------------------------------------
-- Sin permisos propios: manda solo el área.
delete from public.profile_permissions;

insert into public.area_permissions (area, screen, level)
select a.id, s.screen,
  case
    when a.id = 'direccion' and s.screen in ('contactos', 'equipo', 'vacantes', 'alumnos', 'asistencia') then 'read'
    when a.id = 'direccion' and s.screen = 'cursos' then 'write'
    when a.id = 'formacion' and s.screen in ('cursos', 'alumnos', 'asistencia') then 'read'
    when a.id = 'personas' and s.screen in ('equipo', 'vacantes') then 'read'
    when a.id = 'alianzas' and s.screen = 'contactos' then 'read'
    else 'none'
  end
from public.areas a
cross join (values ('calendario'), ('contactos'), ('huecos'), ('equipo'), ('vacantes'), ('fichajes'), ('cursos'), ('alumnos'), ('asistencia')) as s (screen)
on conflict (area, screen) do update set level = excluded.level;

-- Nivel de una persona en una pantalla ('none' | 'read' | 'write'): como cesi_my_level, pero de
-- cualquier cuenta (para «Ver como»).
create or replace function public.cesi_level_for(p_profile uuid, p_screen text)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((
    select case
      when p.role = 'ceo' then 'write'
      when p.role = 'equipo' then coalesce(
        (select pp.level from public.profile_permissions pp where pp.profile_id = p.id and pp.screen = p_screen),
        (select ap.level from public.area_permissions ap where ap.area = p.area and ap.screen = p_screen),
        'none'
      )
      else 'none'
    end
    from public.profiles p
    where p.id = p_profile
  ), 'none');
$$;

-- La versión anterior (sin p_area) se sustituye por esta.
drop function if exists public.cesi_screen_data(text, uuid);

-- Lo que necesita una pantalla, para quien tenga permiso: { level, contacts, groups, vacancies,
-- courses, students, attendance, extraClasses } (cada lista, los documentos tal cual se guardan;
-- con «Ver», sin los datos sensibles).
create or replace function public.cesi_screen_data(p_screen text, p_as uuid default null, p_area text default null)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_who uuid := (select auth.uid());
  v_level text;
  v_full boolean;
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
  else
    v_level := public.cesi_level_for(v_who, p_screen);
  end if;
  if v_level not in ('read', 'write') then
    raise exception 'No tienes acceso a esta pantalla.' using errcode = '42501';
  end if;
  v_full := v_level = 'write';

  with
  ceo as (select id from public.profiles where role = 'ceo'),
  -- Contactos (con «Ver», sin email, teléfono, notas ni foto; sin CV de equipo).
  c_all as (
    select case when v_full then c.data
      else (c.data - 'email' - 'phone' - 'notes' - 'photo') #- '{teamProfile,cv}' end as data
    from public.contacts c
    where c.user_id in (select id from ceo) and c.deleted_at is null
  ),
  c_flags as (
    select data,
      (data ? 'teamProfile' and jsonb_typeof(data -> 'teamProfile') = 'object') as team,
      (data ? 'teamProfile' and jsonb_typeof(data -> 'teamProfile') = 'object'
        and coalesce(data -> 'teamProfile' ->> 'status', 'active') <> 'former'
        and not coalesce((data ->> 'archived')::boolean, false)) as active,
      (coalesce((data ->> 'candidateOnly')::boolean, false) and not (data ? 'teamProfile' and jsonb_typeof(data -> 'teamProfile') = 'object')) as candidate_only,
      (jsonb_typeof(data -> 'candidacies') = 'array' and jsonb_array_length(data -> 'candidacies') > 0) as candidate
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
  -- Alumnos (con «Ver», sin email, teléfono, cumpleaños, notas ni Discord).
  s_all as (
    select case when v_full then s.data else s.data - 'email' - 'phone' - 'birthday' - 'notes' - 'discord' end as data
    from public.students s
    where s.user_id in (select id from ceo) and s.deleted_at is null
  ),
  courses as (
    select co.data from public.courses co where co.user_id in (select id from ceo) and co.deleted_at is null
  )
  select jsonb_build_object(
    'level', v_level,
    'contacts', case p_screen
      when 'contactos' then coalesce((select jsonb_agg(data - 'candidacies' - 'candidateOnly') from c_flags where not active and not candidate_only), '[]'::jsonb)
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
        select jsonb_agg(a.data) from public.attendance a where a.user_id in (select id from ceo) and a.deleted_at is null
      ), '[]'::jsonb) else '[]'::jsonb end,
    'extraClasses', case when p_screen in ('cursos', 'alumnos', 'asistencia') then coalesce((
        select jsonb_agg(x.data) from public.extra_classes x where x.user_id in (select id from ceo) and x.deleted_at is null
      ), '[]'::jsonb) else '[]'::jsonb end
  ) into v_out;
  return v_out;
end;
$$;

revoke all on function public.cesi_level_for(uuid, text) from public, anon, authenticated;
revoke all on function public.cesi_screen_data(text, uuid, text) from public, anon;
grant execute on function public.cesi_screen_data(text, uuid, text) to authenticated;

notify pgrst, 'reload schema';

-- Comprobación: la función de las pantallas con permiso para las cuentas con sesión (true), la
-- interna sin él (false), 0 permisos propios y los permisos que no son «none», por área.
select
  has_function_privilege('authenticated', 'public.cesi_screen_data(text, uuid, text)', 'execute') as pantallas,
  has_function_privilege('authenticated', 'public.cesi_level_for(uuid, text)', 'execute') as interna,
  (select count(*) from public.profile_permissions) as permisos_propios,
  (select string_agg(a.name || ': ' || x.list, ' | ' order by a.sort)
     from public.areas a
     join (select area, string_agg(screen || '=' || level, ', ' order by screen) as list
           from public.area_permissions where level <> 'none' group by area) x on x.area = a.id) as permisos_por_area;
