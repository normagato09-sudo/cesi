-- =============================================================================
-- CIFA · Parte 39: postularse a vacantes y el equipo en los cursos
-- =============================================================================
-- Ejecutar en Supabase → SQL Editor (proyecto fvswxhfjclvadcoyuqyu), después de la parte 38
-- (supabase/parte38_vacantes.sql). Se puede ejecutar más de una vez. No borra datos.
--
-- PARTE A · Postulaciones a vacantes
--   · vacancy_applications: id, vacancy_id, user_id, message, status ('pendiente' | 'aceptada' |
--     'rechazada', por defecto 'pendiente'), created_at. Una por persona y vacante.
--   · RLS: la ceo, Directivo y RRHH ven y cambian todas. Alumnos y equipo ven solo las suyas y
--     crean la suya si la vacante está abierta (nunca cambian el estado).
--   · cesi_open_vacancies(): las vacantes abiertas, para alumnos y equipo (sin sus datos internos).
--   · cesi_vacancy_applicants(vacante): los postulantes con su nombre (la ceo, Directivo y RRHH).
--
-- PARTE B · El equipo se apunta a los cursos (la misma inscripción que los alumnos)
--   · Vuelve a escribir, ampliándolas, funciones de las partes 6, 25 y 30:
--       cesi_student_me        también las cuentas de equipo (para apuntarse y ver sus cursos);
--       cesi_student_courses   también los cursos de las cuentas de equipo (calendario y clases);
--       cesi_student_enroll    igual, y nadie se apunta a un curso del que es el profesor;
--       cesi_course_people     los inscritos del equipo cuentan con la disponibilidad de su perfil.
--   · Link de la llamada de cada curso (data.callLink): cesi_course_call_links() lo da a los
--     inscritos, al profesor, a la ceo y a Directivo (también el Coordinador); cesi_course_set_link
--     lo cambia (el profesor, la ceo y Directivo).
--   · cesi_my_teacher_courses(): los cursos que da quien llama («Eres el profesor»).

do $$
begin
  if to_regprocedure('public.cesi_vacancy_save(text, jsonb)') is null then
    raise exception 'Falta la parte 38 (supabase/parte38_vacantes.sql): ejecútala antes.';
  end if;
end;
$$;

-- =============================================================================
-- PARTE A · Postulaciones
-- =============================================================================

-- ¿Está abierta esa vacante? (las antiguas 'open' / 'in_progress' cuentan como abiertas)
create or replace function public.cesi_vacancy_is_open(p_vacancy text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.vacancies v
    where v.id = p_vacancy and v.deleted_at is null
      and v.user_id in (select id from public.profiles where role = 'ceo')
      and coalesce(v.data ->> 'status', 'abierta') in ('abierta', 'open', 'in_progress')
  );
$$;

-- ¿Es una cuenta aceptada (alumno o equipo)?
create or replace function public.cesi_is_member_or_student(p_profile uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (select 1 from public.profiles where id = p_profile and role in ('alumno', 'equipo'));
$$;

-- Las usan las reglas de acceso de abajo (con la cuenta que lee): tienen que poder ejecutarse.
revoke all on function public.cesi_vacancy_is_open(text) from public, anon;
revoke all on function public.cesi_is_member_or_student(uuid) from public, anon;
revoke all on function public.cesi_vacancy_access(uuid) from public, anon;
grant execute on function public.cesi_vacancy_is_open(text) to authenticated;
grant execute on function public.cesi_is_member_or_student(uuid) to authenticated;
grant execute on function public.cesi_vacancy_access(uuid) to authenticated;

create table if not exists public.vacancy_applications (
  id uuid primary key default gen_random_uuid(),
  vacancy_id text not null check (length(vacancy_id) between 1 and 200),
  user_id uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  message text not null default '' check (length(message) <= 2000),
  status text not null default 'pendiente' check (status in ('pendiente', 'aceptada', 'rechazada')),
  created_at timestamptz not null default now(),
  unique (vacancy_id, user_id)
);
create index if not exists vacancy_applications_vacancy_idx on public.vacancy_applications (vacancy_id, created_at);

alter table public.vacancy_applications enable row level security;
revoke all on public.vacancy_applications from anon, authenticated;
grant select, insert, update, delete on public.vacancy_applications to authenticated;

drop policy if exists "vacancy_applications: leer (las mías; la ceo, Directivo y RRHH, todas)" on public.vacancy_applications;
create policy "vacancy_applications: leer (las mías; la ceo, Directivo y RRHH, todas)" on public.vacancy_applications
  for select to authenticated
  using (user_id = (select auth.uid()) or public.cesi_vacancy_access((select auth.uid())));

drop policy if exists "vacancy_applications: postularse (alumnos y equipo, a una abierta)" on public.vacancy_applications;
create policy "vacancy_applications: postularse (alumnos y equipo, a una abierta)" on public.vacancy_applications
  for insert to authenticated
  with check (
    (user_id = (select auth.uid()) and status = 'pendiente'
      and public.cesi_is_member_or_student((select auth.uid())) and public.cesi_vacancy_is_open(vacancy_id))
    or public.cesi_vacancy_access((select auth.uid()))
  );

drop policy if exists "vacancy_applications: cambiar (la ceo, Directivo y RRHH)" on public.vacancy_applications;
create policy "vacancy_applications: cambiar (la ceo, Directivo y RRHH)" on public.vacancy_applications
  for update to authenticated
  using (public.cesi_vacancy_access((select auth.uid())))
  with check (public.cesi_vacancy_access((select auth.uid())));

drop policy if exists "vacancy_applications: borrar (la ceo, Directivo y RRHH)" on public.vacancy_applications;
create policy "vacancy_applications: borrar (la ceo, Directivo y RRHH)" on public.vacancy_applications
  for delete to authenticated
  using (public.cesi_vacancy_access((select auth.uid())));

-- Las vacantes abiertas, para alumnos y equipo (y la ceo, Directivo y RRHH): sin las notas internas.
create or replace function public.cesi_open_vacancies()
returns table (id text, title text, area text, description text, requirements text, hours_per_week text, seats integer, opened_at text, closes_at text)
language plpgsql
stable
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  v_me uuid := (select auth.uid());
begin
  if not (public.cesi_is_member_or_student(v_me) or public.cesi_vacancy_access(v_me)) then
    raise exception 'Sin permiso.' using errcode = '42501';
  end if;
  return query
    select v.id, coalesce(v.data ->> 'title', ''), coalesce(v.data ->> 'area', ''), coalesce(v.data ->> 'description', ''),
      coalesce(v.data ->> 'requirements', ''), coalesce(v.data ->> 'hoursPerWeek', ''),
      case when (v.data ->> 'seats') ~ '^[0-9]{1,4}$' then (v.data ->> 'seats')::integer end,
      coalesce(v.data ->> 'openedAt', ''), coalesce(v.data ->> 'closesAt', '')
    from public.vacancies v
    where v.deleted_at is null and v.user_id in (select p.id from public.profiles p where p.role = 'ceo')
      and coalesce(v.data ->> 'status', 'abierta') in ('abierta', 'open', 'in_progress')
    order by coalesce(v.data ->> 'openedAt', '') desc;
end;
$$;

-- Postulantes de una vacante, con su nombre (la ceo, Directivo y RRHH).
create or replace function public.cesi_vacancy_applicants(p_vacancy text)
returns table (id uuid, user_id uuid, name text, role text, message text, status text, created_at timestamptz)
language plpgsql
stable
security definer
set search_path = ''
as $$
#variable_conflict use_column
begin
  perform public.cesi_vacancy_me();
  return query
    select a.id, a.user_id, public.cesi_person_name(a.user_id),
      case when p.role = 'alumno' then 'Alumno' else coalesce((select ar.name from public.areas ar where ar.id = p.area), 'Equipo') end,
      a.message, a.status, a.created_at
    from public.vacancy_applications a
    join public.profiles p on p.id = a.user_id
    where a.vacancy_id = p_vacancy
    order by a.created_at;
end;
$$;

revoke all on function public.cesi_open_vacancies() from public, anon;
revoke all on function public.cesi_vacancy_applicants(text) from public, anon;
grant execute on function public.cesi_open_vacancies() to authenticated;
grant execute on function public.cesi_vacancy_applicants(text) to authenticated;

-- =============================================================================
-- PARTE B · El equipo en los cursos
-- =============================================================================

-- La cuenta actual si puede apuntarse a cursos (alumno o, ahora, equipo); si no, error.
create or replace function public.cesi_student_me()
returns uuid
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_me uuid := (select auth.uid());
begin
  if not exists (select 1 from public.profiles where id = v_me and role in ('alumno', 'equipo')) then
    raise exception 'Solo los alumnos y el equipo pueden apuntarse a los cursos.' using errcode = '42501';
  end if;
  return v_me;
end;
$$;

-- Cursos (ids) en los que está apuntada una cuenta (alumno o, ahora, equipo).
create or replace function public.cesi_student_courses(p_profile uuid)
returns setof text
language sql
stable
security definer
set search_path = ''
as $$
  select distinct c.value
  from public.profiles pr
  join public.students s
    on s.id = pr.linked_student_id and s.deleted_at is null
   and s.user_id in (select id from public.profiles where role = 'ceo')
  cross join lateral jsonb_array_elements_text(
    case when jsonb_typeof(s.data -> 'courseIds') = 'array' then s.data -> 'courseIds' else '[]'::jsonb end
  ) as c (value)
  join public.courses co on co.id = c.value and co.user_id = s.user_id and co.deleted_at is null
  where pr.id = p_profile and pr.role in ('alumno', 'equipo');
$$;

revoke all on function public.cesi_student_courses(uuid) from public, anon, authenticated;

-- Los cursos que da quien llama (para «Eres el profesor»).
create or replace function public.cesi_my_teacher_courses()
returns setof text
language sql
stable
security definer
set search_path = ''
as $$
  select public.cesi_teacher_courses((select auth.uid()));
$$;

revoke all on function public.cesi_my_teacher_courses() from public, anon;
grant execute on function public.cesi_my_teacher_courses() to authenticated;

-- Apuntarse a un curso: igual que en la parte 25, ahora también el equipo y nunca a uno suyo.
create or replace function public.cesi_student_enroll(p_course text)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_me uuid := public.cesi_student_me();
  v_ceo uuid := (select p.id from public.profiles p where p.role = 'ceo' order by p.created_at limit 1);
  v_course public.courses;
  v_status text;
  v_max integer;
  v_ficha record;
  v_ids jsonb;
  v_data jsonb;
begin
  if v_ceo is null then
    raise exception 'No hay cuenta de la dirección.' using errcode = '22023';
  end if;
  -- Uno a la vez por curso, para no pasarse de plazas.
  perform pg_advisory_xact_lock(hashtext('cesi_enroll:' || coalesce(p_course, '')));
  select * into v_course from public.courses where user_id = v_ceo and id = p_course and deleted_at is null;
  if not found then
    raise exception 'Ese curso ya no existe.' using errcode = '22023';
  end if;
  -- Nadie se apunta a un curso del que es el profesor (parte 39).
  if p_course in (select public.cesi_teacher_courses(v_me)) then
    raise exception 'Eres el profesor de este curso.' using errcode = '42501';
  end if;
  v_status := coalesce(v_course.data ->> 'status', 'borrador');
  if v_status not in ('inscripcion', 'en_curso') then
    raise exception 'Este curso no admite inscripciones ahora.' using errcode = '22023';
  end if;

  select * into v_ficha from public.cesi_student_ficha(v_me, v_ceo);
  v_ids := case when jsonb_typeof(v_ficha.o_data -> 'courseIds') = 'array' then v_ficha.o_data -> 'courseIds' else '[]'::jsonb end;
  if v_ids ? p_course then
    return jsonb_build_object('status', 'ok');
  end if;
  v_max := public.cesi_course_max_seats(v_course.data);
  if v_max is not null and public.cesi_course_enrolled(v_ceo, p_course) >= v_max then
    return jsonb_build_object('status', 'full');
  end if;

  v_data := v_ficha.o_data || jsonb_build_object(
    'courseIds', v_ids || to_jsonb(p_course),
    -- Cuándo se apuntó a cada curso (para la ficha del curso).
    'courseJoinedAt', coalesce(case when jsonb_typeof(v_ficha.o_data -> 'courseJoinedAt') = 'object' then v_ficha.o_data -> 'courseJoinedAt' end, '{}'::jsonb)
      || jsonb_build_object(p_course, to_char((now() at time zone 'Europe/Madrid')::date, 'YYYY-MM-DD'))
  );
  perform public.cesi_student_write(v_ceo, v_ficha.o_id, v_data, v_ficha.o_stamp);
  insert into public.team_edit_log (who, who_name, who_area, doc_table, doc_id, doc_name, action, before, after)
  values (v_me, public.cesi_person_name(v_me), coalesce((select case when role = 'equipo' then area end from public.profiles where id = v_me), 'alumno'), 'students', v_ficha.o_id, left(coalesce(v_data ->> 'name', ''), 200), 'edicion',
    jsonb_build_object('courseIds', v_ids), jsonb_build_object('courseIds', v_data -> 'courseIds'));
  return jsonb_build_object('status', 'ok');
end;
$$;

-- Las personas de un curso (parte 30): los inscritos del equipo, con la disponibilidad de su perfil.
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
    left join public.profiles pr on pr.linked_student_id = s.id and pr.role in ('alumno', 'equipo')
    left join public.account_profiles ap on ap.id = pr.id
    where s.user_id = v_ceo and s.deleted_at is null
      and jsonb_typeof(s.data -> 'courseIds') = 'array' and (s.data -> 'courseIds') ? p_course;
end;
$$;

-- -----------------------------------------------------------------------------
-- Link de la llamada de cada curso
-- -----------------------------------------------------------------------------

-- ¿Puede `p_profile` ver o cambiar el link de ese curso como responsable? (su profesor, la ceo y
-- Directivo, también el Coordinador)
create or replace function public.cesi_course_link_manager(p_profile uuid, p_course text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (select 1 from public.profiles where id = p_profile and (role = 'ceo' or (role = 'equipo' and area = 'direccion')))
    or p_course in (select public.cesi_teacher_courses(p_profile));
$$;

revoke all on function public.cesi_course_link_manager(uuid, text) from public, anon, authenticated;

-- Los links que puede ver quien llama: los de sus cursos (inscrito), los que da y, la ceo y
-- Directivo, todos.
create or replace function public.cesi_course_call_links()
returns table (course_id text, call_link text, can_edit boolean)
language plpgsql
stable
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  v_me uuid := (select auth.uid());
begin
  return query
    select co.id, coalesce(co.data ->> 'callLink', ''), public.cesi_course_link_manager(v_me, co.id)
    from public.courses co
    where co.deleted_at is null and co.user_id in (select id from public.profiles where role = 'ceo')
      and (public.cesi_course_link_manager(v_me, co.id) or co.id in (select public.cesi_student_courses(v_me)));
end;
$$;

-- Cambia el link de la llamada de un curso (su profesor, la ceo y Directivo). '' lo quita.
create or replace function public.cesi_course_set_link(p_course text, p_link text)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_me uuid := (select auth.uid());
  v_link text := trim(coalesce(p_link, ''));
  v_ceo uuid;
  v_old jsonb;
  v_stamp timestamptz;
  v_new timestamptz;
begin
  if not public.cesi_course_link_manager(v_me, p_course) then
    raise exception 'Solo el profesor del curso, la dirección y Directivo cambian el link.' using errcode = '42501';
  end if;
  if v_link <> '' and (v_link !~ '^https?://' or length(v_link) > 500) then
    raise exception 'El link tiene que empezar por https:// (como mucho 500 caracteres).' using errcode = '22023';
  end if;
  select co.user_id, co.data, co.updated_at into v_ceo, v_old, v_stamp
  from public.courses co
  where co.id = p_course and co.deleted_at is null and co.user_id in (select id from public.profiles where role = 'ceo')
  limit 1
  for update;
  if v_ceo is null then
    raise exception 'Ese curso ya no existe.' using errcode = '22023';
  end if;
  -- Más reciente que lo que tenga la ceo: le llega como un cambio de otro dispositivo suyo.
  v_new := greatest(clock_timestamp(), v_stamp + interval '1 millisecond');
  update public.courses co
  set data = v_old || jsonb_build_object('callLink', v_link, 'updatedAt', public.cesi_iso(v_new)), updated_at = v_new
  where co.user_id = v_ceo and co.id = p_course;
  if not public.is_ceo() then
    insert into public.team_edit_log (who, who_name, who_area, doc_table, doc_id, doc_name, action, before, after)
    values (v_me, public.cesi_person_name(v_me), (select area from public.profiles where id = v_me), 'courses', p_course,
      left(coalesce(v_old ->> 'name', ''), 200), 'edicion',
      jsonb_build_object('callLink', coalesce(v_old ->> 'callLink', '')), jsonb_build_object('callLink', v_link));
  end if;
end;
$$;

revoke all on function public.cesi_course_call_links() from public, anon;
revoke all on function public.cesi_course_set_link(text, text) from public, anon;
grant execute on function public.cesi_course_call_links() to authenticated;
grant execute on function public.cesi_course_set_link(text, text) to authenticated;

notify pgrst, 'reload schema';

-- Comprobación: la tabla de postulaciones con sus 4 reglas (4), las funciones nuevas con permiso
-- (6), el equipo ya puede apuntarse (true) y nadie se apunta a su propio curso (true).
select
  (select count(*) from pg_policies where schemaname = 'public' and tablename = 'vacancy_applications') as reglas_postulaciones,
  (select count(*) from unnest(array[
     'public.cesi_open_vacancies()', 'public.cesi_vacancy_applicants(text)', 'public.cesi_my_teacher_courses()',
     'public.cesi_course_call_links()', 'public.cesi_course_set_link(text, text)', 'public.cesi_student_enroll(text)'
   ]) as f (sig) where has_function_privilege('authenticated', f.sig, 'execute')) as funciones_con_permiso,
  position('''equipo''' in pg_get_functiondef('public.cesi_student_me()'::regprocedure)) > 0 as equipo_se_apunta,
  position('cesi_teacher_courses(v_me)' in pg_get_functiondef('public.cesi_student_enroll(text)'::regprocedure)) > 0 as sin_su_propio_curso;
