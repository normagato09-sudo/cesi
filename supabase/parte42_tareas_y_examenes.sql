-- =============================================================================
-- CIFA · Parte 42: tareas y exámenes del aula (entregas y notas)
-- =============================================================================
-- Ejecutar en Supabase → SQL Editor (proyecto fvswxhfjclvadcoyuqyu), después de la parte 41
-- (supabase/parte41_aula.sql). Se puede ejecutar más de una vez. No borra datos.
--
-- Qué hace:
--   · course_tasks: el profesor crea una tarea o un examen en el aula de su curso: título,
--     instrucciones (con formato), archivo opcional, fecha límite y nota máxima (hasta 10).
--   · task_submissions: la entrega de cada inscrito (texto y/o archivo, en
--     cesi-aula/<curso>/subs/<cuenta>/...). Se puede cambiar hasta que esté corregida.
--     Estado: Pendiente (sin entrega), Entregada, Entregada tarde (después de la fecha límite) o
--     Corregida (con nota).
--   · El profesor ve las entregas de su curso y pone nota y comentario. La nota se guarda también
--     en las calificaciones (tabla grades de la parte 36, unida a la tarea con grades.task_id) pasada
--     a una nota sobre 10: así la «Media de notas» del curso junta las notas puestas a mano y las de
--     tareas y exámenes, y queda SIEMPRE en el perfil del alumno (en su ficha), aunque se desapunte o
--     el curso termine. Esas notas solo se cambian corrigiendo la entrega.
--   · Quién ve qué: cada inscrito, solo lo suyo; el profesor, lo de su curso; la ceo y Directivo,
--     todo (sin cambiar nada).
--   · Cambia (ampliándolas) funciones de la parte 36:
--       cesi_my_grades     también el equipo apuntado, y TODAS sus notas (también de cursos de los
--                          que ya se ha desapuntado o que han terminado);
--       cesi_grades_course las notas de tareas no se editan desde «Calificaciones» (can_edit false);
--       cesi_grade_save / cesi_grade_delete  no tocan las notas que vienen de una tarea.

do $$
begin
  if to_regprocedure('public.cesi_room_file_ok(text, text)') is null then
    raise exception 'Falta la parte 41 (supabase/parte41_aula.sql): ejecútala antes.';
  end if;
end;
$$;

-- -----------------------------------------------------------------------------
-- Tablas
-- -----------------------------------------------------------------------------
create table if not exists public.course_tasks (
  id uuid primary key default gen_random_uuid(),
  course_id text not null check (length(course_id) between 1 and 200),
  kind text not null default 'tarea' check (kind in ('tarea', 'examen')),
  title text not null check (length(title) between 1 and 120),
  instructions text not null default '' check (length(instructions) <= 5000),
  file_path text check (file_path is null or length(file_path) <= 500),
  file_name text not null default '' check (length(file_name) <= 200),
  file_type text not null default '' check (length(file_type) <= 120),
  file_size integer not null default 0 check (file_size >= 0 and file_size <= 20971520),
  due_at timestamptz not null,
  max_score numeric(4, 2) not null default 10 check (max_score > 0 and max_score <= 10),
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists course_tasks_course_idx on public.course_tasks (course_id, due_at);

create table if not exists public.task_submissions (
  id uuid primary key default gen_random_uuid(),
  task_id uuid not null references public.course_tasks (id) on delete cascade,
  course_id text not null,
  profile_id uuid not null references public.profiles (id) on delete cascade,
  student_id text not null,
  text_answer text not null default '' check (length(text_answer) <= 5000),
  file_path text check (file_path is null or length(file_path) <= 500),
  file_name text not null default '' check (length(file_name) <= 200),
  file_type text not null default '' check (length(file_type) <= 120),
  file_size integer not null default 0 check (file_size >= 0 and file_size <= 20971520),
  submitted_at timestamptz not null default now(),
  score numeric(4, 2) check (score is null or (score >= 0 and score <= 10)),
  feedback text not null default '' check (length(feedback) <= 1000),
  graded_at timestamptz,
  graded_by uuid references public.profiles (id) on delete set null,
  unique (task_id, profile_id)
);
create index if not exists task_submissions_task_idx on public.task_submissions (task_id);

alter table public.course_tasks enable row level security;
alter table public.task_submissions enable row level security;
revoke all on public.course_tasks from public, anon, authenticated;
revoke all on public.task_submissions from public, anon, authenticated;

-- Las notas de tareas en las calificaciones (una por tarea y alumno).
alter table public.grades add column if not exists task_id uuid;
create unique index if not exists grades_task_student_idx on public.grades (task_id, student_id) where task_id is not null;

-- -----------------------------------------------------------------------------
-- Ayudas
-- -----------------------------------------------------------------------------

-- Estado de una entrega: 'pendiente' | 'entregada' | 'tarde' | 'corregida'.
create or replace function public.cesi_submission_status(p_submitted timestamptz, p_due timestamptz, p_score numeric)
returns text
language sql
immutable
set search_path = ''
as $$
  select case
    when p_submitted is null then 'pendiente'
    when p_score is not null then 'corregida'
    when p_submitted > p_due then 'tarde'
    else 'entregada'
  end;
$$;

revoke all on function public.cesi_submission_status(timestamptz, timestamptz, numeric) from public, anon, authenticated;

-- -----------------------------------------------------------------------------
-- Leer
-- -----------------------------------------------------------------------------

drop function if exists public.cesi_room_tasks(text);

-- Tareas y exámenes del aula. Para un inscrito, con su entrega (estado, texto, archivo, nota y
-- comentario: solo la suya). Para el profesor, la ceo y Directivo, cuántos han entregado y cuántas
-- hay corregidas. Vacío si el aula aún no se ha abierto para quien llama.
create or replace function public.cesi_room_tasks(p_course text)
returns table (
  id uuid, kind text, title text, instructions text, file_path text, file_name text, file_type text, file_size integer,
  due_at timestamptz, max_score numeric, created_at timestamptz,
  my_status text, my_text text, my_file_path text, my_file_name text, my_file_size integer,
  my_submitted_at timestamptz, my_score numeric, my_feedback text,
  submitted_count integer, graded_count integer
)
language plpgsql
stable
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  v_me uuid := (select auth.uid());
  v_role text := public.cesi_room_role(v_me, p_course);
  v_student boolean := v_role = 'student';
begin
  if v_role is null then
    raise exception 'No tienes acceso a esta aula.' using errcode = '42501';
  end if;
  if not public.cesi_room_can_enter(v_me, p_course) then
    return;
  end if;
  return query
    select t.id, t.kind, t.title, t.instructions, t.file_path, t.file_name, t.file_type, t.file_size, t.due_at, t.max_score, t.created_at,
      case when v_student then public.cesi_submission_status(s.submitted_at, t.due_at, s.score) end,
      case when v_student then s.text_answer end,
      case when v_student then s.file_path end,
      case when v_student then s.file_name end,
      case when v_student then s.file_size end,
      case when v_student then s.submitted_at end,
      case when v_student then s.score end,
      case when v_student then s.feedback end,
      case when not v_student then (select count(*)::integer from public.task_submissions x where x.task_id = t.id) end,
      case when not v_student then (select count(*)::integer from public.task_submissions x where x.task_id = t.id and x.score is not null) end
    from public.course_tasks t
    left join public.task_submissions s on v_student and s.task_id = t.id and s.profile_id = v_me
    where t.course_id = p_course
    order by t.due_at desc, t.created_at desc;
end;
$$;

-- Las entregas de una tarea (el profesor del curso, la ceo y Directivo): cada inscrito del curso
-- (aunque no haya entregado: Pendiente) y quien entregó aunque ya no esté inscrito.
create or replace function public.cesi_course_task_submissions(p_task uuid)
returns table (
  submission_id uuid, student_id text, student_name text, status text, text_answer text,
  file_path text, file_name text, file_size integer, submitted_at timestamptz, score numeric,
  feedback text, can_grade boolean
)
language plpgsql
stable
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  v_me uuid := (select auth.uid());
  v_task public.course_tasks;
  v_role text;
begin
  select * into v_task from public.course_tasks where id = p_task;
  if not found then
    raise exception 'Esa tarea ya no existe.' using errcode = '22023';
  end if;
  v_role := public.cesi_room_role(v_me, v_task.course_id);
  if v_role is null or v_role not in ('teacher', 'manager') then
    raise exception 'Solo el profesor del curso, la dirección y Directivo ven las entregas.' using errcode = '42501';
  end if;
  return query
    with inscritos as (
      select s.id as sid, coalesce(nullif(trim(s.data ->> 'name'), ''), 'Alumno') as sname
      from public.students s
      where s.deleted_at is null and s.user_id in (select id from public.profiles where role = 'ceo')
        and jsonb_typeof(s.data -> 'courseIds') = 'array' and (s.data -> 'courseIds') ? v_task.course_id
    ),
    gente as (
      select i.sid, i.sname from inscritos i
      union
      select x.student_id, coalesce((select nullif(trim(s.data ->> 'name'), '') from public.students s
        where s.id = x.student_id and s.user_id in (select id from public.profiles where role = 'ceo') limit 1), 'Alumno')
      from public.task_submissions x where x.task_id = p_task and x.student_id not in (select sid from inscritos)
    )
    select x.id, g.sid, g.sname, public.cesi_submission_status(x.submitted_at, v_task.due_at, x.score),
      coalesce(x.text_answer, ''), x.file_path, coalesce(x.file_name, ''), coalesce(x.file_size, 0), x.submitted_at,
      x.score, coalesce(x.feedback, ''), v_role = 'teacher' and x.id is not null
    from gente g
    left join public.task_submissions x on x.task_id = p_task and x.student_id = g.sid
    order by (x.id is null), g.sname;
end;
$$;

-- -----------------------------------------------------------------------------
-- El profesor: crear, cambiar y borrar tareas
-- -----------------------------------------------------------------------------
create or replace function public.cesi_course_task_save(
  p_id uuid, p_course text, p_kind text, p_title text, p_instructions text,
  p_file_path text, p_file_name text, p_file_type text, p_file_size integer,
  p_due_at timestamptz, p_max_score numeric
)
returns uuid
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_me uuid := (select auth.uid());
  v_title text := trim(coalesce(p_title, ''));
  v_text text := trim(coalesce(p_instructions, ''));
  v_path text := nullif(trim(coalesce(p_file_path, '')), '');
  v_id uuid;
begin
  if public.cesi_room_role(v_me, p_course) is distinct from 'teacher' then
    raise exception 'Solo el profesor del curso crea tareas y exámenes.' using errcode = '42501';
  end if;
  if p_kind not in ('tarea', 'examen') then
    raise exception 'Elige tarea o examen.' using errcode = '22023';
  end if;
  if length(v_title) = 0 or length(v_title) > 120 then
    raise exception 'Escribe el título (como mucho 120 caracteres).' using errcode = '22023';
  end if;
  if length(v_text) > 5000 then
    raise exception 'Las instrucciones pueden tener como mucho 5000 caracteres.' using errcode = '22023';
  end if;
  if p_due_at is null then
    raise exception 'Pon la fecha límite.' using errcode = '22023';
  end if;
  if p_max_score is null or p_max_score <= 0 or p_max_score > 10 then
    raise exception 'La nota máxima va de 0,5 a 10.' using errcode = '22023';
  end if;
  if v_path is not null and v_path not like p_course || '/tasks/%' then
    raise exception 'El archivo no es de este curso.' using errcode = '42501';
  end if;
  if coalesce(p_file_size, 0) < 0 or coalesce(p_file_size, 0) > 20971520 then
    raise exception 'El archivo puede tener como mucho 20 MB.' using errcode = '22023';
  end if;
  if p_id is null then
    insert into public.course_tasks (course_id, kind, title, instructions, file_path, file_name, file_type, file_size, due_at, max_score, created_by)
    values (p_course, p_kind, v_title, v_text, v_path,
      case when v_path is null then '' else left(coalesce(p_file_name, ''), 200) end,
      case when v_path is null then '' else left(coalesce(p_file_type, ''), 120) end,
      case when v_path is null then 0 else coalesce(p_file_size, 0) end,
      p_due_at, round(p_max_score, 2), v_me)
    returning id into v_id;
  else
    if exists (select 1 from public.task_submissions x where x.task_id = p_id and x.score is not null)
      and round(p_max_score, 2) <> (select max_score from public.course_tasks where id = p_id) then
      raise exception 'Ya hay entregas corregidas: la nota máxima no se puede cambiar.' using errcode = '22023';
    end if;
    update public.course_tasks t
    set kind = p_kind, title = v_title, instructions = v_text, file_path = v_path,
      file_name = case when v_path is null then '' else left(coalesce(p_file_name, ''), 200) end,
      file_type = case when v_path is null then '' else left(coalesce(p_file_type, ''), 120) end,
      file_size = case when v_path is null then 0 else coalesce(p_file_size, 0) end,
      due_at = p_due_at, max_score = round(p_max_score, 2), updated_at = now()
    where t.id = p_id and t.course_id = p_course
    returning t.id into v_id;
    if v_id is null then
      raise exception 'Esa tarea ya no existe.' using errcode = '22023';
    end if;
    -- El nombre de la actividad en las calificaciones sigue al título.
    update public.grades g set activity = v_title, updated_at = now() where g.task_id = p_id and g.activity <> v_title;
  end if;
  return v_id;
end;
$$;

-- Borra una tarea (el profesor; nunca si ya tiene entregas corregidas: las notas se quedan).
-- Devuelve las rutas de sus archivos (la tarea y las entregas) para borrarlos de Storage.
create or replace function public.cesi_course_task_delete(p_id uuid)
returns text[]
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_me uuid := (select auth.uid());
  v_task public.course_tasks;
  v_paths text[];
begin
  select * into v_task from public.course_tasks where id = p_id;
  if not found or public.cesi_room_role(v_me, v_task.course_id) is distinct from 'teacher' then
    raise exception 'Solo el profesor del curso borra sus tareas.' using errcode = '42501';
  end if;
  if exists (select 1 from public.task_submissions x where x.task_id = p_id and x.score is not null) then
    raise exception 'Esta tarea ya tiene entregas corregidas: no se puede borrar (las notas se quedan).' using errcode = '22023';
  end if;
  select array_remove(array_agg(x.file_path), null) into v_paths from public.task_submissions x where x.task_id = p_id;
  delete from public.course_tasks where id = p_id;
  return array_remove(coalesce(v_paths, '{}') || v_task.file_path, null);
end;
$$;

-- -----------------------------------------------------------------------------
-- El inscrito: entregar (o cambiar su entrega hasta que esté corregida)
-- -----------------------------------------------------------------------------
-- Devuelve la ruta del archivo anterior si se ha cambiado (para borrarlo de Storage) o null.
create or replace function public.cesi_course_task_submit(
  p_task uuid, p_text text, p_file_path text, p_file_name text, p_file_type text, p_file_size integer
)
returns text
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_me uuid := (select auth.uid());
  v_task public.course_tasks;
  v_student text := (select linked_student_id from public.profiles where id = v_me);
  v_text text := trim(coalesce(p_text, ''));
  v_path text := nullif(trim(coalesce(p_file_path, '')), '');
  v_old public.task_submissions;
begin
  select * into v_task from public.course_tasks where id = p_task;
  if not found then
    raise exception 'Esa tarea ya no existe.' using errcode = '22023';
  end if;
  if public.cesi_room_role(v_me, v_task.course_id) is distinct from 'student' or v_student is null
    or not public.cesi_room_can_enter(v_me, v_task.course_id) then
    raise exception 'Solo los inscritos del curso entregan.' using errcode = '42501';
  end if;
  if v_text = '' and v_path is null then
    raise exception 'Escribe tu respuesta o adjunta un archivo.' using errcode = '22023';
  end if;
  if length(v_text) > 5000 then
    raise exception 'La respuesta puede tener como mucho 5000 caracteres.' using errcode = '22023';
  end if;
  if v_path is not null and v_path not like v_task.course_id || '/subs/' || v_me::text || '/%' then
    raise exception 'El archivo no es tuyo.' using errcode = '42501';
  end if;
  if coalesce(p_file_size, 0) < 0 or coalesce(p_file_size, 0) > 20971520 then
    raise exception 'El archivo puede tener como mucho 20 MB.' using errcode = '22023';
  end if;
  select * into v_old from public.task_submissions where task_id = p_task and profile_id = v_me for update;
  if found and v_old.score is not null then
    raise exception 'Tu entrega ya está corregida: no se puede cambiar.' using errcode = '22023';
  end if;
  insert into public.task_submissions (task_id, course_id, profile_id, student_id, text_answer, file_path, file_name, file_type, file_size, submitted_at)
  values (p_task, v_task.course_id, v_me, v_student, v_text, v_path,
    case when v_path is null then '' else left(coalesce(p_file_name, ''), 200) end,
    case when v_path is null then '' else left(coalesce(p_file_type, ''), 120) end,
    case when v_path is null then 0 else coalesce(p_file_size, 0) end, now())
  on conflict (task_id, profile_id) do update
    set text_answer = excluded.text_answer, file_path = excluded.file_path, file_name = excluded.file_name,
      file_type = excluded.file_type, file_size = excluded.file_size, submitted_at = now();
  return case when v_old.file_path is not null and v_old.file_path is distinct from v_path then v_old.file_path end;
end;
$$;

-- -----------------------------------------------------------------------------
-- El profesor: corregir (nota y comentario) → también en las calificaciones
-- -----------------------------------------------------------------------------
create or replace function public.cesi_course_task_grade(p_submission uuid, p_score numeric, p_feedback text)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_me uuid := (select auth.uid());
  v_sub public.task_submissions;
  v_task public.course_tasks;
  v_feedback text := trim(coalesce(p_feedback, ''));
  v_over10 numeric;
begin
  select * into v_sub from public.task_submissions where id = p_submission for update;
  if not found then
    raise exception 'Esa entrega ya no existe.' using errcode = '22023';
  end if;
  select * into v_task from public.course_tasks where id = v_sub.task_id;
  if public.cesi_room_role(v_me, v_task.course_id) is distinct from 'teacher' then
    raise exception 'Solo el profesor del curso corrige.' using errcode = '42501';
  end if;
  if p_score is null or p_score < 0 or p_score > v_task.max_score then
    raise exception 'La nota va de 0 a %.', v_task.max_score using errcode = '22023';
  end if;
  if length(v_feedback) > 1000 then
    raise exception 'El comentario puede tener como mucho 1000 caracteres.' using errcode = '22023';
  end if;
  update public.task_submissions
  set score = round(p_score, 2), feedback = v_feedback, graded_at = now(), graded_by = v_me
  where id = p_submission;
  -- En las calificaciones, sobre 10 (se queda en la ficha del alumno para siempre).
  v_over10 := round(p_score * 10 / v_task.max_score, 2);
  insert into public.grades (course_id, student_id, activity, day, score, comment, created_by, task_id)
  values (v_task.course_id, v_sub.student_id, left(v_task.title, 120), (v_task.due_at at time zone 'Europe/Madrid')::date,
    v_over10, left(v_feedback, 500), v_me, v_task.id)
  on conflict (task_id, student_id) where task_id is not null do update
    set score = excluded.score, comment = excluded.comment, activity = excluded.activity, day = excluded.day, updated_at = now();
end;
$$;

-- -----------------------------------------------------------------------------
-- Calificaciones (parte 36), ampliadas
-- -----------------------------------------------------------------------------

-- Las notas de un curso: las de tareas no se editan aquí (se cambian corrigiendo la entrega).
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
      g.activity, g.day, g.score, g.comment, v_teacher and g.task_id is null, g.updated_at
    from public.grades g
    where g.course_id = p_course
    order by g.day desc, g.activity;
end;
$$;

-- Las mías: todas las notas de la ficha unida a mi cuenta (alumno o equipo apuntado), también de
-- cursos de los que ya me he desapuntado o que han terminado.
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
  select p.linked_student_id into v_student from public.profiles p where p.id = v_me and p.role in ('alumno', 'equipo');
  if not found then
    raise exception 'Sin permiso.' using errcode = '42501';
  end if;
  if v_student is null then
    return;
  end if;
  return query
    select g.id, g.course_id,
      coalesce((select nullif(trim(co.data ->> 'name'), '') from public.courses co
                where co.id = g.course_id and co.user_id in (select id from public.profiles where role = 'ceo') limit 1), 'Curso'),
      g.activity, g.day, g.score, g.comment
    from public.grades g
    where g.student_id = v_student
    order by g.day desc, g.activity;
end;
$$;

-- Poner o cambiar una nota a mano (como en la parte 36), sin tocar las que vienen de una tarea.
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
    if exists (select 1 from public.grades where id = p_id and task_id is not null) then
      raise exception 'Esta nota viene de una tarea: se cambia al corregir la entrega en el aula.' using errcode = '22023';
    end if;
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

-- Borrar una nota puesta a mano (el profesor de su curso); las de tareas, no.
create or replace function public.cesi_grade_delete(p_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_me uuid := (select auth.uid());
  v_course text;
  v_task uuid;
begin
  select course_id, task_id into v_course, v_task from public.grades where id = p_id;
  if v_course is null or not public.cesi_grade_teacher(v_me, v_course) then
    raise exception 'Solo el profesor del curso borra sus notas.' using errcode = '42501';
  end if;
  if v_task is not null then
    raise exception 'Esta nota viene de una tarea: no se borra (queda en la ficha del alumno).' using errcode = '22023';
  end if;
  delete from public.grades where id = p_id;
end;
$$;

-- -----------------------------------------------------------------------------
-- Permisos de las funciones
-- -----------------------------------------------------------------------------
revoke all on function public.cesi_room_tasks(text) from public, anon;
revoke all on function public.cesi_course_task_submissions(uuid) from public, anon;
revoke all on function public.cesi_course_task_save(uuid, text, text, text, text, text, text, text, integer, timestamptz, numeric) from public, anon;
revoke all on function public.cesi_course_task_delete(uuid) from public, anon;
revoke all on function public.cesi_course_task_submit(uuid, text, text, text, text, integer) from public, anon;
revoke all on function public.cesi_course_task_grade(uuid, numeric, text) from public, anon;
revoke all on function public.cesi_grades_course(text) from public, anon;
revoke all on function public.cesi_my_grades() from public, anon;
revoke all on function public.cesi_grade_save(uuid, text, text, text, date, numeric, text) from public, anon;
revoke all on function public.cesi_grade_delete(uuid) from public, anon;
grant execute on function public.cesi_room_tasks(text) to authenticated;
grant execute on function public.cesi_course_task_submissions(uuid) to authenticated;
grant execute on function public.cesi_course_task_save(uuid, text, text, text, text, text, text, text, integer, timestamptz, numeric) to authenticated;
grant execute on function public.cesi_course_task_delete(uuid) to authenticated;
grant execute on function public.cesi_course_task_submit(uuid, text, text, text, text, integer) to authenticated;
grant execute on function public.cesi_course_task_grade(uuid, numeric, text) to authenticated;
grant execute on function public.cesi_grades_course(text) to authenticated;
grant execute on function public.cesi_my_grades() to authenticated;
grant execute on function public.cesi_grade_save(uuid, text, text, text, date, numeric, text) to authenticated;
grant execute on function public.cesi_grade_delete(uuid) to authenticated;

notify pgrst, 'reload schema';

-- Comprobación: las tablas cerradas (false, false), las 6 funciones nuevas con permiso (6), las
-- notas unidas a tareas (columna task_id: true) y cuántas tareas y entregas hay.
select
  has_table_privilege('authenticated', 'public.course_tasks', 'select') as cuentas_leen_tareas,
  has_table_privilege('authenticated', 'public.task_submissions', 'select') as cuentas_leen_entregas,
  (select count(*) from unnest(array[
     'public.cesi_room_tasks(text)', 'public.cesi_course_task_submissions(uuid)',
     'public.cesi_course_task_save(uuid, text, text, text, text, text, text, text, integer, timestamptz, numeric)',
     'public.cesi_course_task_delete(uuid)', 'public.cesi_course_task_submit(uuid, text, text, text, text, integer)', 'public.cesi_course_task_grade(uuid, numeric, text)'
   ]) f (sig) where has_function_privilege('authenticated', f.sig, 'execute')) as funciones,
  exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'grades' and column_name = 'task_id') as notas_de_tareas,
  (select count(*) from public.course_tasks) as tareas,
  (select count(*) from public.task_submissions) as entregas;
