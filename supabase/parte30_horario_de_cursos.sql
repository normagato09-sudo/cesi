-- =============================================================================
-- CIFA · Parte 30: horario automático de cada curso (fase de alumnos)
-- =============================================================================
-- Ejecutar en Supabase → SQL Editor (proyecto fvswxhfjclvadcoyuqyu), después de la parte 29
-- (supabase/parte29_sin_equipo.sql). Se puede ejecutar más de una vez. No borra ni cambia datos,
-- tablas ni funciones de antes: solo añade.
--
-- Qué hace:
--   · cesi_course_people(curso): para «Organizar horario» (solo la ceo y Directivo), el profesor y
--     los alumnos inscritos del curso con su zona horaria y su disponibilidad: la de su perfil si
--     lo tiene completo; si no, la de su ficha (o ninguna: no cuentan y salen avisados).
--   · course_schedule_changes (y sus lecturas): los cambios de horario de un curso ya empezado que
--     se han confirmado. cesi_course_schedule_notify los apunta (la ceo y Directivo) y los alumnos
--     del curso y su profesor los ven en su Inicio hasta que los leen (cesi_my_schedule_changes,
--     cesi_schedule_change_seen). Solo se leen y escriben con estas funciones.
--   · El horario en sí sigue en la ficha del curso de la ceo (data.schedule), como hasta ahora.

do $$
begin
  if to_regprocedure('public.cesi_org_chart()') is null
     or not exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
                    where n.nspname = 'public' and p.proname = 'cesi_ceo_doc_patch'
                      and pg_get_functiondef(p.oid) like '%v_rrhh := false%') then
    raise exception 'Faltan las partes 28 y 29: ejecútalas antes.';
  end if;
end;
$$;

-- -----------------------------------------------------------------------------
-- Ayudas
-- -----------------------------------------------------------------------------

-- La cuenta actual si puede organizar horarios (la ceo o Directivo); si no, error.
create or replace function public.cesi_schedule_manager()
returns uuid
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_me uuid := (select auth.uid());
begin
  if not exists (
    select 1 from public.profiles
    where id = v_me and (role = 'ceo' or (role = 'equipo' and area = 'direccion'))
  ) then
    raise exception 'Solo la dirección y Directivo organizan los horarios.' using errcode = '42501';
  end if;
  return v_me;
end;
$$;

revoke all on function public.cesi_schedule_manager() from public, anon, authenticated;

-- -----------------------------------------------------------------------------
-- Profesor y alumnos de un curso, con su disponibilidad
-- -----------------------------------------------------------------------------
--   kind          'teacher' o 'student'
--   id            el de su ficha (contacto de Equipo o alumno)
--   from_profile  la disponibilidad sale de su perfil (true) o de su ficha (false)
create or replace function public.cesi_course_people(p_course text)
returns table (
  kind text, id text, name text, account_id uuid,
  country text, time_zone text, availability jsonb, from_profile boolean
)
language plpgsql
stable
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  v_me uuid := public.cesi_schedule_manager();
  v_ceo uuid;
  v_course jsonb;
begin
  select co.user_id, co.data into v_ceo, v_course
  from public.courses co
  where co.id = p_course and co.deleted_at is null and co.user_id in (select p.id from public.profiles p where p.role = 'ceo')
  limit 1;
  if v_ceo is null then
    raise exception 'Ese curso no existe.' using errcode = '22023';
  end if;
  return query
    -- El profesor (su ficha de Equipo y, si está unida a una cuenta, su perfil).
    select 'teacher'::text, c.id, coalesce(nullif(trim(c.data ->> 'name'), ''), 'Profesor'), pr.id,
      case when ap.completed_at is not null then ap.country else c.data ->> 'country' end,
      case when ap.completed_at is not null then ap.time_zone else c.data ->> 'timeZone' end,
      case when ap.completed_at is not null then ap.availability else c.data -> 'availability' end,
      ap.completed_at is not null
    from public.contacts c
    left join public.profiles pr on pr.linked_team_id = c.id and pr.role = 'equipo'
    left join public.account_profiles ap on ap.id = pr.id
    where c.user_id = v_ceo and c.deleted_at is null and c.id = v_course ->> 'teacherId'
    union all
    -- Los alumnos inscritos (su ficha y, si tienen cuenta, su perfil).
    select 'student'::text, s.id, coalesce(nullif(trim(s.data ->> 'name'), ''), 'Alumno'), pr.id,
      case when ap.completed_at is not null then ap.country else s.data ->> 'country' end,
      case when ap.completed_at is not null then ap.time_zone else s.data ->> 'timeZone' end,
      case when ap.completed_at is not null then ap.availability else s.data -> 'availability' end,
      ap.completed_at is not null
    from public.students s
    left join public.profiles pr on pr.linked_student_id = s.id and pr.role = 'alumno'
    left join public.account_profiles ap on ap.id = pr.id
    where s.user_id = v_ceo and s.deleted_at is null
      and jsonb_typeof(s.data -> 'courseIds') = 'array' and (s.data -> 'courseIds') ? p_course;
end;
$$;

-- -----------------------------------------------------------------------------
-- Cambios de horario confirmados (para avisar a los del curso)
-- -----------------------------------------------------------------------------
create table if not exists public.course_schedule_changes (
  id uuid primary key default gen_random_uuid(),
  course_id text not null check (length(course_id) between 1 and 200),
  course_name text not null default '' check (length(course_name) <= 200),
  old_schedule jsonb,
  new_schedule jsonb not null,
  class_minutes integer not null default 60 check (class_minutes between 5 and 600),
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now()
);
create index if not exists course_schedule_changes_course_idx on public.course_schedule_changes (course_id, created_at desc);

create table if not exists public.course_schedule_change_reads (
  change_id uuid not null references public.course_schedule_changes (id) on delete cascade,
  profile_id uuid not null references public.profiles (id) on delete cascade,
  read_at timestamptz not null default now(),
  primary key (change_id, profile_id)
);

-- Sin acceso directo: solo con las funciones de abajo.
alter table public.course_schedule_changes enable row level security;
alter table public.course_schedule_change_reads enable row level security;
revoke all on public.course_schedule_changes, public.course_schedule_change_reads from anon, authenticated;

-- Apunta un cambio de horario ya confirmado (la ceo o Directivo). Devuelve su id.
create or replace function public.cesi_course_schedule_notify(p_course text, p_old jsonb, p_new jsonb, p_minutes integer)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_me uuid := public.cesi_schedule_manager();
  v_name text;
  v_id uuid;
begin
  select coalesce(nullif(trim(co.data ->> 'name'), ''), 'Curso') into v_name
  from public.courses co
  where co.id = p_course and co.deleted_at is null and co.user_id in (select id from public.profiles where role = 'ceo')
  limit 1;
  if v_name is null then
    raise exception 'Ese curso no existe.' using errcode = '22023';
  end if;
  if jsonb_typeof(p_new) <> 'object' or jsonb_typeof(p_new -> 'slots') <> 'array' then
    raise exception 'Horario no válido.' using errcode = '22023';
  end if;
  insert into public.course_schedule_changes (course_id, course_name, old_schedule, new_schedule, class_minutes, created_by)
  values (p_course, left(v_name, 200), p_old, p_new, greatest(5, least(600, coalesce(p_minutes, 60))), v_me)
  returning id into v_id;
  return v_id;
end;
$$;

-- Los cambios de horario sin leer de mis cursos (alumno o profesor), de los últimos 60 días.
create or replace function public.cesi_my_schedule_changes()
returns table (
  id uuid, course_id text, course_name text, old_schedule jsonb, new_schedule jsonb,
  class_minutes integer, created_at timestamptz
)
language plpgsql
stable
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  v_me uuid := (select auth.uid());
begin
  if v_me is null then
    raise exception 'Sin permiso.' using errcode = '42501';
  end if;
  return query
    select ch.id, ch.course_id, ch.course_name, ch.old_schedule, ch.new_schedule, ch.class_minutes, ch.created_at
    from public.course_schedule_changes ch
    where ch.created_at >= now() - interval '60 days'
      and (ch.course_id in (select public.cesi_student_courses(v_me)) or ch.course_id in (select public.cesi_teacher_courses(v_me)))
      and not exists (select 1 from public.course_schedule_change_reads r where r.change_id = ch.id and r.profile_id = v_me)
    order by ch.created_at desc;
end;
$$;

-- Marca como leído un cambio de horario (solo de mis cursos).
create or replace function public.cesi_schedule_change_seen(p_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_me uuid := (select auth.uid());
begin
  if not exists (
    select 1 from public.course_schedule_changes ch
    where ch.id = p_id
      and (ch.course_id in (select public.cesi_student_courses(v_me)) or ch.course_id in (select public.cesi_teacher_courses(v_me)))
  ) then
    raise exception 'Ese aviso no es tuyo.' using errcode = '42501';
  end if;
  insert into public.course_schedule_change_reads (change_id, profile_id) values (p_id, v_me)
  on conflict do nothing;
end;
$$;

-- -----------------------------------------------------------------------------
-- Permisos de las funciones
-- -----------------------------------------------------------------------------
revoke all on function public.cesi_course_people(text) from public, anon;
revoke all on function public.cesi_course_schedule_notify(text, jsonb, jsonb, integer) from public, anon;
revoke all on function public.cesi_my_schedule_changes() from public, anon;
revoke all on function public.cesi_schedule_change_seen(uuid) from public, anon;
grant execute on function public.cesi_course_people(text) to authenticated;
grant execute on function public.cesi_course_schedule_notify(text, jsonb, jsonb, integer) to authenticated;
grant execute on function public.cesi_my_schedule_changes() to authenticated;
grant execute on function public.cesi_schedule_change_seen(uuid) to authenticated;

notify pgrst, 'reload schema';

-- Comprobación: las 4 funciones con permiso (4), la ayuda interna sin él (false) y las dos tablas
-- nuevas (true).
select
  (select count(*) from unnest(array[
     'public.cesi_course_people(text)', 'public.cesi_course_schedule_notify(text, jsonb, jsonb, integer)',
     'public.cesi_my_schedule_changes()', 'public.cesi_schedule_change_seen(uuid)'
   ]) as f (sig) where has_function_privilege('authenticated', f.sig, 'execute')) as funciones_con_permiso,
  has_function_privilege('authenticated', 'public.cesi_schedule_manager()', 'execute') as ayuda_interna,
  to_regclass('public.course_schedule_changes') is not null and to_regclass('public.course_schedule_change_reads') is not null as tablas;
