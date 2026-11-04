-- =============================================================================
-- CIFA · Parte 36: Calificaciones (fase de alumnos)
-- =============================================================================
-- Ejecutar en Supabase → SQL Editor (proyecto fvswxhfjclvadcoyuqyu), después de la parte 35
-- (supabase/parte35_buzon.sql). Se puede ejecutar más de una vez. No borra ni cambia datos,
-- tablas ni funciones de antes: solo añade.
--
-- Qué hace:
--   · grades: las notas de cada alumno (su ficha de Alumnos) en un curso: actividad, fecha, nota de
--     0 a 10 y comentario opcional.
--   · Solo el profesor de ese curso las pone, cambia y borra, y solo a alumnos de ese curso.
--   · El alumno ve solo las suyas (cesi_my_grades). La ceo y Directivo solo ven (también las
--     medias de cada curso y alumno, cesi_grade_summary).
--   · Nadie toca la tabla directamente; solo con estas funciones.

do $$
begin
  if to_regprocedure('public.cesi_mailbox_list()') is null then
    raise exception 'Falta la parte 35 (supabase/parte35_buzon.sql): ejecútala antes.';
  end if;
end;
$$;

create table if not exists public.grades (
  id uuid primary key default gen_random_uuid(),
  course_id text not null check (length(course_id) between 1 and 200),
  student_id text not null check (length(student_id) between 1 and 200),
  activity text not null check (length(activity) between 1 and 120),
  day date not null,
  score numeric(4, 2) not null check (score >= 0 and score <= 10),
  comment text not null default '' check (length(comment) <= 500),
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists grades_course_idx on public.grades (course_id, student_id, day);

alter table public.grades enable row level security;
revoke all on public.grades from anon, authenticated;

-- -----------------------------------------------------------------------------
-- Ayudas
-- -----------------------------------------------------------------------------

-- ¿Es `p_profile` el profesor de ese curso?
create or replace function public.cesi_grade_teacher(p_profile uuid, p_course text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select p_course in (select public.cesi_teacher_courses(p_profile));
$$;

-- ¿Puede ver las notas de todos? (la ceo y Directivo)
create or replace function public.cesi_grade_viewer(p_profile uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (select 1 from public.profiles where id = p_profile and (role = 'ceo' or (role = 'equipo' and area = 'direccion')));
$$;

-- ¿Está ese alumno (su ficha) en ese curso?
create or replace function public.cesi_grade_enrolled(p_course text, p_student text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.students s
    where s.id = p_student and s.deleted_at is null
      and s.user_id in (select id from public.profiles where role = 'ceo')
      and jsonb_typeof(s.data -> 'courseIds') = 'array' and (s.data -> 'courseIds') ? p_course
  );
$$;

revoke all on function public.cesi_grade_teacher(uuid, text) from public, anon, authenticated;
revoke all on function public.cesi_grade_viewer(uuid) from public, anon, authenticated;
revoke all on function public.cesi_grade_enrolled(text, text) from public, anon, authenticated;

-- -----------------------------------------------------------------------------
-- Leer
-- -----------------------------------------------------------------------------

-- Las notas de un curso: su profesor (can_edit), la ceo y Directivo (solo ver).
create or replace function public.cesi_grades_course(p_course text)
returns table (
  id uuid, student_id text, student_name text, activity text, day date, score numeric,
  comment text, can_edit boolean, updated_at timestamptz
)
language plpgsql
stable
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  v_me uuid := (select auth.uid());
  v_teacher boolean := public.cesi_grade_teacher(v_me, p_course);
begin
  if not (v_teacher or public.cesi_grade_viewer(v_me)) then
    raise exception 'Sin permiso.' using errcode = '42501';
  end if;
  return query
    select g.id, g.student_id,
      coalesce((select nullif(trim(s.data ->> 'name'), '') from public.students s
                where s.id = g.student_id and s.user_id in (select id from public.profiles where role = 'ceo') limit 1), 'Alumno'),
      g.activity, g.day, g.score, g.comment, v_teacher, g.updated_at
    from public.grades g
    where g.course_id = p_course
    order by g.day desc, g.activity;
end;
$$;

-- Las mías (alumno): solo las de la ficha unida a mi cuenta y de mis cursos.
create or replace function public.cesi_my_grades()
returns table (id uuid, course_id text, course_name text, activity text, day date, score numeric, comment text)
language plpgsql
stable
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  v_me uuid := (select auth.uid());
  v_student text;
begin
  select p.linked_student_id into v_student from public.profiles p where p.id = v_me and p.role = 'alumno';
  if not found then
    raise exception 'Sin permiso.' using errcode = '42501';
  end if;
  if v_student is null then
    return;
  end if;
  return query
    select g.id, g.course_id,
      coalesce((select nullif(trim(co.data ->> 'name'), '') from public.courses co
                where co.id = g.course_id and co.deleted_at is null
                  and co.user_id in (select id from public.profiles where role = 'ceo') limit 1), 'Curso'),
      g.activity, g.day, g.score, g.comment
    from public.grades g
    where g.student_id = v_student
      and g.course_id in (select public.cesi_student_courses(v_me))
    order by g.day desc, g.activity;
end;
$$;

-- Medias (para «Media de notas» de los cursos y de cada alumno): la ceo y Directivo, de todos; el
-- profesor, de sus cursos. Una fila por curso y alumno (student_id null: la del curso entero).
create or replace function public.cesi_grade_summary()
returns table (course_id text, student_id text, average numeric, count integer)
language plpgsql
stable
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  v_me uuid := (select auth.uid());
  v_all boolean := public.cesi_grade_viewer(v_me);
begin
  if not (v_all or exists (select 1 from public.cesi_teacher_courses(v_me))) then
    raise exception 'Sin permiso.' using errcode = '42501';
  end if;
  return query
    select g.course_id, g.student_id, round(avg(g.score), 2), count(*)::integer
    from public.grades g
    where v_all or g.course_id in (select public.cesi_teacher_courses(v_me))
    group by grouping sets ((g.course_id, g.student_id), (g.course_id));
end;
$$;

-- -----------------------------------------------------------------------------
-- Escribir (solo el profesor del curso)
-- -----------------------------------------------------------------------------

-- Pone o cambia una nota (p_id null: nueva). Devuelve su id.
create or replace function public.cesi_grade_save(
  p_id uuid, p_course text, p_student text, p_activity text, p_day date, p_score numeric, p_comment text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_me uuid := (select auth.uid());
  v_activity text := trim(coalesce(p_activity, ''));
  v_comment text := trim(coalesce(p_comment, ''));
  v_id uuid;
begin
  if not public.cesi_grade_teacher(v_me, p_course) then
    raise exception 'Solo el profesor del curso pone notas.' using errcode = '42501';
  end if;
  if not public.cesi_grade_enrolled(p_course, p_student) then
    raise exception 'Ese alumno no está en el curso.' using errcode = '42501';
  end if;
  if length(v_activity) = 0 or length(v_activity) > 120 then
    raise exception 'Escribe la actividad (como mucho 120 caracteres).' using errcode = '22023';
  end if;
  if p_day is null then
    raise exception 'Pon la fecha.' using errcode = '22023';
  end if;
  if p_score is null or p_score < 0 or p_score > 10 then
    raise exception 'La nota va de 0 a 10.' using errcode = '22023';
  end if;
  if length(v_comment) > 500 then
    raise exception 'El comentario puede tener como mucho 500 caracteres.' using errcode = '22023';
  end if;
  if p_id is null then
    insert into public.grades (course_id, student_id, activity, day, score, comment, created_by)
    values (p_course, p_student, v_activity, p_day, round(p_score, 2), v_comment, v_me)
    returning id into v_id;
  else
    update public.grades g
    set student_id = p_student, activity = v_activity, day = p_day, score = round(p_score, 2), comment = v_comment, updated_at = now()
    where g.id = p_id and g.course_id = p_course
    returning g.id into v_id;
    if v_id is null then
      raise exception 'Esa nota ya no existe.' using errcode = '22023';
    end if;
  end if;
  return v_id;
end;
$$;

-- Borra una nota (el profesor de su curso).
create or replace function public.cesi_grade_delete(p_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_me uuid := (select auth.uid());
  v_course text;
begin
  select course_id into v_course from public.grades where id = p_id;
  if v_course is null or not public.cesi_grade_teacher(v_me, v_course) then
    raise exception 'Solo el profesor del curso borra sus notas.' using errcode = '42501';
  end if;
  delete from public.grades where id = p_id;
end;
$$;

revoke all on function public.cesi_grades_course(text) from public, anon;
revoke all on function public.cesi_my_grades() from public, anon;
revoke all on function public.cesi_grade_summary() from public, anon;
revoke all on function public.cesi_grade_save(uuid, text, text, text, date, numeric, text) from public, anon;
revoke all on function public.cesi_grade_delete(uuid) from public, anon;
grant execute on function public.cesi_grades_course(text) to authenticated;
grant execute on function public.cesi_my_grades() to authenticated;
grant execute on function public.cesi_grade_summary() to authenticated;
grant execute on function public.cesi_grade_save(uuid, text, text, text, date, numeric, text) to authenticated;
grant execute on function public.cesi_grade_delete(uuid) to authenticated;

notify pgrst, 'reload schema';

-- Comprobación: la tabla (true), las 5 funciones con permiso (5) y las ayudas sin él (0).
select
  to_regclass('public.grades') is not null as tabla,
  (select count(*) from unnest(array[
     'public.cesi_grades_course(text)', 'public.cesi_my_grades()', 'public.cesi_grade_summary()',
     'public.cesi_grade_save(uuid, text, text, text, date, numeric, text)', 'public.cesi_grade_delete(uuid)'
   ]) as f (sig) where has_function_privilege('authenticated', f.sig, 'execute')) as funciones_con_permiso,
  (select count(*) from unnest(array[
     'public.cesi_grade_teacher(uuid, text)', 'public.cesi_grade_viewer(uuid)', 'public.cesi_grade_enrolled(text, text)'
   ]) as f (sig) where has_function_privilege('authenticated', f.sig, 'execute')) as ayudas_con_permiso;
