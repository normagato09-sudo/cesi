-- =============================================================================
-- CIFA · Parte 41: el Aula de cada curso (avisos y materiales)
-- =============================================================================
-- Ejecutar en Supabase → SQL Editor (proyecto fvswxhfjclvadcoyuqyu), después de la parte 40
-- (supabase/parte40_candidaturas.sql). Se puede ejecutar más de una vez. No borra datos.
--
-- Qué hace:
--   · Cada curso tiene su Aula. Entran: el profesor del curso, sus inscritos (alumnos y equipo
--     apuntado, con su ficha de alumno), Directivo y la ceo. Nadie más.
--   · Se abre sola el día de inicio del curso (data.startDate, hora de España): antes, los inscritos
--     solo ven «El aula se abre el …». El profesor, Directivo y la ceo entran antes para prepararla.
--     Un curso sin fecha de inicio tiene el aula abierta.
--   · course_posts: avisos y materiales (título, descripción con formato y archivo opcional). Solo
--     el profesor del curso publica, edita y borra.
--   · course_post_reads: lo que cada uno ya ha visto (para marcar «Nuevo»).
--   · Archivos: bucket privado «cesi-aula» (20 MB por archivo; pdf, imágenes, pptx, docx y xlsx).
--     Cada archivo va en la carpeta de su curso: <curso>/posts/... (y en la parte 42, tasks/ y
--     subs/<cuenta>/...). Las reglas de Storage miran el curso de la carpeta: solo lo abre quien
--     entra en esa aula.
--   · Las tablas están cerradas a todos: solo se usan con estas funciones.

do $$
begin
  if to_regprocedure('public.cesi_public_apply(text, text, text, text, text, text, text, boolean, text)') is null then
    raise exception 'Falta la parte 40 (supabase/parte40_candidaturas.sql): ejecútala antes.';
  end if;
  if to_regprocedure('public.cesi_grade_viewer(uuid)') is null then
    raise exception 'Falta la parte 36 (supabase/parte36_calificaciones.sql): ejecútala antes.';
  end if;
end;
$$;

-- -----------------------------------------------------------------------------
-- Ayudas
-- -----------------------------------------------------------------------------

-- El papel de `p_profile` en el aula de un curso: 'teacher' (su profesor), 'manager' (la ceo o
-- Directivo), 'student' (inscrito: alumno o equipo apuntado) o null (no entra).
create or replace function public.cesi_room_role(p_profile uuid, p_course text)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select case
    when p_profile is null or not exists (
      select 1 from public.courses co
      where co.id = p_course and co.deleted_at is null and co.user_id in (select id from public.profiles where role = 'ceo')
    ) then null
    when p_course in (select public.cesi_teacher_courses(p_profile)) then 'teacher'
    when public.cesi_grade_viewer(p_profile) then 'manager'
    when p_course in (select public.cesi_student_courses(p_profile)) then 'student'
  end;
$$;

-- El día en que se abre el aula (la fecha de inicio del curso; null: sin fecha, abierta).
create or replace function public.cesi_room_opens(p_course text)
returns date
language sql
stable
security definer
set search_path = ''
as $$
  select case when (co.data ->> 'startDate') ~ '^\d{4}-\d{2}-\d{2}$' then (co.data ->> 'startDate')::date end
  from public.courses co
  where co.id = p_course and co.deleted_at is null and co.user_id in (select id from public.profiles where role = 'ceo')
  limit 1;
$$;

-- ¿Puede `p_profile` ver lo de dentro del aula? (el profesor, la ceo y Directivo, siempre; los
-- inscritos, desde el día de inicio)
create or replace function public.cesi_room_can_enter(p_profile uuid, p_course text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select case public.cesi_room_role(p_profile, p_course)
    when 'teacher' then true
    when 'manager' then true
    when 'student' then coalesce(public.cesi_room_opens(p_course) <= (now() at time zone 'Europe/Madrid')::date, true)
    else false
  end;
$$;

-- Reglas de los archivos del bucket cesi-aula (las usan las reglas de Storage, con la cuenta que
-- llama). Carpetas: <curso>/posts/..., <curso>/tasks/... (lo del profesor) y
-- <curso>/subs/<cuenta>/... (lo que entrega cada inscrito, parte 42).
--   leer:   posts y tasks, quien entra en el aula; subs, el dueño, el profesor, la ceo y Directivo.
--   subir:  posts y tasks, el profesor; subs, el propio inscrito con el aula abierta.
--   borrar: posts y tasks, el profesor; subs, el dueño.
create or replace function public.cesi_room_file_ok(p_name text, p_action text)
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_me uuid := (select auth.uid());
  v_parts text[] := string_to_array(coalesce(p_name, ''), '/');
  v_course text := v_parts[1];
  v_kind text := v_parts[2];
  v_role text;
begin
  if v_me is null or coalesce(array_length(v_parts, 1), 0) < 3 or v_course = '' then
    return false;
  end if;
  v_role := public.cesi_room_role(v_me, v_course);
  if v_role is null then
    return false;
  end if;
  if v_kind in ('posts', 'tasks') then
    return case p_action
      when 'read' then public.cesi_room_can_enter(v_me, v_course)
      else v_role = 'teacher'
    end;
  end if;
  if v_kind = 'subs' and coalesce(array_length(v_parts, 1), 0) >= 4 then
    return case p_action
      when 'read' then v_parts[3] = v_me::text or v_role in ('teacher', 'manager')
      when 'write' then v_parts[3] = v_me::text and v_role = 'student' and public.cesi_room_can_enter(v_me, v_course)
      when 'delete' then v_parts[3] = v_me::text
      else false
    end;
  end if;
  return false;
end;
$$;

revoke all on function public.cesi_room_role(uuid, text) from public, anon, authenticated;
revoke all on function public.cesi_room_opens(text) from public, anon, authenticated;
revoke all on function public.cesi_room_can_enter(uuid, text) from public, anon, authenticated;
-- La usan las reglas de Storage con la cuenta que llama: tiene que poder ejecutarse (solo dice
-- sí o no sobre la cuenta que llama).
revoke all on function public.cesi_room_file_ok(text, text) from public, anon;
grant execute on function public.cesi_room_file_ok(text, text) to authenticated;

-- -----------------------------------------------------------------------------
-- Tablas
-- -----------------------------------------------------------------------------
create table if not exists public.course_posts (
  id uuid primary key default gen_random_uuid(),
  course_id text not null check (length(course_id) between 1 and 200),
  kind text not null default 'aviso' check (kind in ('aviso', 'material')),
  title text not null check (length(title) between 1 and 160),
  body text not null default '' check (length(body) <= 5000),
  file_path text check (file_path is null or length(file_path) <= 500),
  file_name text not null default '' check (length(file_name) <= 200),
  file_type text not null default '' check (length(file_type) <= 120),
  file_size integer not null default 0 check (file_size >= 0 and file_size <= 20971520),
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists course_posts_course_idx on public.course_posts (course_id, created_at desc);

create table if not exists public.course_post_reads (
  profile_id uuid not null references public.profiles (id) on delete cascade,
  post_id uuid not null references public.course_posts (id) on delete cascade,
  read_at timestamptz not null default now(),
  primary key (profile_id, post_id)
);

alter table public.course_posts enable row level security;
alter table public.course_post_reads enable row level security;
revoke all on public.course_posts from public, anon, authenticated;
revoke all on public.course_post_reads from public, anon, authenticated;

-- -----------------------------------------------------------------------------
-- Archivos: bucket privado cesi-aula
-- -----------------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('cesi-aula', 'cesi-aula', false, 20971520, array[
  'application/pdf',
  'image/jpeg', 'image/png', 'image/gif', 'image/webp',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
])
on conflict (id) do update
  set public = false,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "cesi-aula: leer" on storage.objects;
drop policy if exists "cesi-aula: subir" on storage.objects;
drop policy if exists "cesi-aula: borrar" on storage.objects;

create policy "cesi-aula: leer" on storage.objects
  for select to authenticated
  using (bucket_id = 'cesi-aula' and public.cesi_room_file_ok(name, 'read'));

create policy "cesi-aula: subir" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'cesi-aula' and public.cesi_room_file_ok(name, 'write'));

create policy "cesi-aula: borrar" on storage.objects
  for delete to authenticated
  using (bucket_id = 'cesi-aula' and public.cesi_room_file_ok(name, 'delete'));
-- Sin regla para cambiar: un archivo no se sobrescribe (se sube uno nuevo).

-- -----------------------------------------------------------------------------
-- Leer
-- -----------------------------------------------------------------------------

-- Datos del aula para quien llama: nombre del curso, día en que se abre, si ya está abierta,
-- su papel y si puede publicar. Error si no entra.
create or replace function public.cesi_room_info(p_course text)
returns table (course_id text, course_name text, opens_on date, is_open boolean, my_role text, can_post boolean)
language plpgsql
stable
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  v_me uuid := (select auth.uid());
  v_role text := public.cesi_room_role(v_me, p_course);
begin
  if v_role is null then
    raise exception 'No tienes acceso a esta aula.' using errcode = '42501';
  end if;
  return query
    select co.id, coalesce(nullif(trim(co.data ->> 'name'), ''), 'Curso'), public.cesi_room_opens(p_course),
      coalesce(public.cesi_room_opens(p_course) <= (now() at time zone 'Europe/Madrid')::date, true),
      v_role, v_role = 'teacher'
    from public.courses co
    where co.id = p_course and co.deleted_at is null and co.user_id in (select id from public.profiles where role = 'ceo')
    limit 1;
end;
$$;

-- Avisos y materiales del aula, lo más reciente primero. is_new: no lo había visto (solo para los
-- inscritos). Vacío si el aula aún no se ha abierto para quien llama.
create or replace function public.cesi_room_posts(p_course text)
returns table (
  id uuid, kind text, title text, body text, file_path text, file_name text, file_type text,
  file_size integer, author text, created_at timestamptz, updated_at timestamptz, is_new boolean
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
begin
  if v_role is null then
    raise exception 'No tienes acceso a esta aula.' using errcode = '42501';
  end if;
  if not public.cesi_room_can_enter(v_me, p_course) then
    return;
  end if;
  return query
    select p.id, p.kind, p.title, p.body, p.file_path, p.file_name, p.file_type, p.file_size,
      coalesce(public.cesi_person_name(p.created_by), 'Profesor'), p.created_at, p.updated_at,
      v_role = 'student' and not exists (select 1 from public.course_post_reads r where r.post_id = p.id and r.profile_id = v_me)
    from public.course_posts p
    where p.course_id = p_course
    order by p.created_at desc;
end;
$$;

-- Marca como vistos todos los avisos y materiales del aula (para quien llama).
create or replace function public.cesi_room_mark_read(p_course text)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_me uuid := (select auth.uid());
begin
  if not public.cesi_room_can_enter(v_me, p_course) then
    return;
  end if;
  insert into public.course_post_reads (profile_id, post_id)
  select v_me, p.id from public.course_posts p where p.course_id = p_course
  on conflict do nothing;
end;
$$;

-- -----------------------------------------------------------------------------
-- Escribir (solo el profesor del curso)
-- -----------------------------------------------------------------------------

-- Publica o cambia un aviso o material (p_id null: nuevo). El archivo, ya subido a
-- cesi-aula/<curso>/posts/...; p_file_path null: sin archivo. Devuelve su id.
create or replace function public.cesi_room_post_save(
  p_id uuid, p_course text, p_kind text, p_title text, p_body text,
  p_file_path text, p_file_name text, p_file_type text, p_file_size integer
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
  v_body text := trim(coalesce(p_body, ''));
  v_path text := nullif(trim(coalesce(p_file_path, '')), '');
  v_id uuid;
begin
  if public.cesi_room_role(v_me, p_course) is distinct from 'teacher' then
    raise exception 'Solo el profesor del curso publica en el aula.' using errcode = '42501';
  end if;
  if p_kind not in ('aviso', 'material') then
    raise exception 'Elige aviso o material.' using errcode = '22023';
  end if;
  if length(v_title) = 0 or length(v_title) > 160 then
    raise exception 'Escribe el título (como mucho 160 caracteres).' using errcode = '22023';
  end if;
  if length(v_body) > 5000 then
    raise exception 'La descripción puede tener como mucho 5000 caracteres.' using errcode = '22023';
  end if;
  if v_path is not null and v_path not like p_course || '/posts/%' then
    raise exception 'El archivo no es de este curso.' using errcode = '42501';
  end if;
  if coalesce(p_file_size, 0) < 0 or coalesce(p_file_size, 0) > 20971520 then
    raise exception 'El archivo puede tener como mucho 20 MB.' using errcode = '22023';
  end if;
  if p_id is null then
    insert into public.course_posts (course_id, kind, title, body, file_path, file_name, file_type, file_size, created_by)
    values (p_course, p_kind, v_title, v_body, v_path,
      case when v_path is null then '' else left(coalesce(p_file_name, ''), 200) end,
      case when v_path is null then '' else left(coalesce(p_file_type, ''), 120) end,
      case when v_path is null then 0 else coalesce(p_file_size, 0) end, v_me)
    returning id into v_id;
  else
    update public.course_posts p
    set kind = p_kind, title = v_title, body = v_body, file_path = v_path,
      file_name = case when v_path is null then '' else left(coalesce(p_file_name, ''), 200) end,
      file_type = case when v_path is null then '' else left(coalesce(p_file_type, ''), 120) end,
      file_size = case when v_path is null then 0 else coalesce(p_file_size, 0) end,
      updated_at = now()
    where p.id = p_id and p.course_id = p_course
    returning p.id into v_id;
    if v_id is null then
      raise exception 'Ese aviso ya no existe.' using errcode = '22023';
    end if;
  end if;
  return v_id;
end;
$$;

-- Borra un aviso o material (el profesor de su curso). Devuelve la ruta de su archivo (o null)
-- para borrarlo también de Storage.
create or replace function public.cesi_room_post_delete(p_id uuid)
returns text
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_me uuid := (select auth.uid());
  v_course text;
  v_path text;
begin
  select course_id, file_path into v_course, v_path from public.course_posts where id = p_id;
  if v_course is null or public.cesi_room_role(v_me, v_course) is distinct from 'teacher' then
    raise exception 'Solo el profesor del curso borra lo del aula.' using errcode = '42501';
  end if;
  delete from public.course_posts where id = p_id;
  return v_path;
end;
$$;

revoke all on function public.cesi_room_info(text) from public, anon;
revoke all on function public.cesi_room_posts(text) from public, anon;
revoke all on function public.cesi_room_mark_read(text) from public, anon;
revoke all on function public.cesi_room_post_save(uuid, text, text, text, text, text, text, text, integer) from public, anon;
revoke all on function public.cesi_room_post_delete(uuid) from public, anon;
grant execute on function public.cesi_room_info(text) to authenticated;
grant execute on function public.cesi_room_posts(text) to authenticated;
grant execute on function public.cesi_room_mark_read(text) to authenticated;
grant execute on function public.cesi_room_post_save(uuid, text, text, text, text, text, text, text, integer) to authenticated;
grant execute on function public.cesi_room_post_delete(uuid) to authenticated;

notify pgrst, 'reload schema';

-- Comprobación: las tablas cerradas (false, false), el bucket privado con 20 MB (false, 20971520),
-- sus 3 reglas (3), las 5 funciones con permiso (5) y las ayudas internas sin él (0).
select
  has_table_privilege('authenticated', 'public.course_posts', 'select') as cuentas_leen_avisos,
  has_table_privilege('anon', 'public.course_posts', 'select') as anon_lee_avisos,
  (select public from storage.buckets where id = 'cesi-aula') as bucket_publico,
  (select file_size_limit from storage.buckets where id = 'cesi-aula') as limite_bytes,
  (select count(*) from pg_policies where schemaname = 'storage' and policyname like 'cesi-aula:%') as reglas_storage,
  (select count(*) from unnest(array[
     'public.cesi_room_info(text)', 'public.cesi_room_posts(text)', 'public.cesi_room_mark_read(text)',
     'public.cesi_room_post_save(uuid, text, text, text, text, text, text, text, integer)', 'public.cesi_room_post_delete(uuid)'
   ]) f (sig) where has_function_privilege('authenticated', f.sig, 'execute')) as funciones,
  (select count(*) from unnest(array['public.cesi_room_role(uuid, text)', 'public.cesi_room_opens(text)', 'public.cesi_room_can_enter(uuid, text)']) f (sig)
     where has_function_privilege('authenticated', f.sig, 'execute')) as ayudas_con_permiso;
