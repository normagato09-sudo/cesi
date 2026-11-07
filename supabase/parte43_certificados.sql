-- =============================================================================
-- CIFA · Parte 43: Certificados (solo la ceo)
-- =============================================================================
-- Ejecutar en Supabase → SQL Editor (proyecto fvswxhfjclvadcoyuqyu), después de la parte 42
-- (supabase/parte42_tareas_y_examenes.sql). Se puede ejecutar más de una vez. No borra datos.
--
-- Qué hace:
--   · course_certificates: por cada alumno (su ficha) de un curso terminado, «Certificado emitido»
--     con su fecha y el PDF del certificado (subido a mano; más adelante, «Generar certificado»).
--   · Solo la ceo: ni Directivo ni nadie del equipo ni los alumnos la pueden leer ni cambiar.
--   · PDF en el bucket privado «cesi-certificados» (solo PDF, 10 MB), que solo abre la ceo.
--     Ruta: <curso>/<alumno>/<id>.pdf.

do $$
begin
  if to_regprocedure('public.cesi_course_task_grade(uuid, numeric, text)') is null then
    raise exception 'Falta la parte 42 (supabase/parte42_tareas_y_examenes.sql): ejecútala antes.';
  end if;
end;
$$;

create table if not exists public.course_certificates (
  id uuid primary key default gen_random_uuid(),
  course_id text not null check (length(course_id) between 1 and 200),
  student_id text not null check (length(student_id) between 1 and 200),
  issued_on date not null,
  file_path text check (file_path is null or length(file_path) <= 500),
  file_name text not null default '' check (length(file_name) <= 200),
  file_size integer not null default 0 check (file_size >= 0 and file_size <= 10485760),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (course_id, student_id)
);

-- Solo la ceo (como sus tablas de la parte 2).
alter table public.course_certificates enable row level security;
revoke all on public.course_certificates from public, anon, authenticated;
grant select, insert, update, delete on public.course_certificates to authenticated;

drop policy if exists "course_certificates: solo la ceo (leer)" on public.course_certificates;
drop policy if exists "course_certificates: solo la ceo (crear)" on public.course_certificates;
drop policy if exists "course_certificates: solo la ceo (cambiar)" on public.course_certificates;
drop policy if exists "course_certificates: solo la ceo (borrar)" on public.course_certificates;
create policy "course_certificates: solo la ceo (leer)" on public.course_certificates
  for select to authenticated using ((select public.is_ceo()));
create policy "course_certificates: solo la ceo (crear)" on public.course_certificates
  for insert to authenticated with check ((select public.is_ceo()));
create policy "course_certificates: solo la ceo (cambiar)" on public.course_certificates
  for update to authenticated using ((select public.is_ceo())) with check ((select public.is_ceo()));
create policy "course_certificates: solo la ceo (borrar)" on public.course_certificates
  for delete to authenticated using ((select public.is_ceo()));

-- PDF de los certificados: bucket privado, solo la ceo.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('cesi-certificados', 'cesi-certificados', false, 10485760, array['application/pdf'])
on conflict (id) do update
  set public = false,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "cesi-certificados: solo la ceo (leer)" on storage.objects;
drop policy if exists "cesi-certificados: solo la ceo (subir)" on storage.objects;
drop policy if exists "cesi-certificados: solo la ceo (borrar)" on storage.objects;
create policy "cesi-certificados: solo la ceo (leer)" on storage.objects
  for select to authenticated using (bucket_id = 'cesi-certificados' and (select public.is_ceo()));
create policy "cesi-certificados: solo la ceo (subir)" on storage.objects
  for insert to authenticated with check (bucket_id = 'cesi-certificados' and (select public.is_ceo()));
create policy "cesi-certificados: solo la ceo (borrar)" on storage.objects
  for delete to authenticated using (bucket_id = 'cesi-certificados' and (select public.is_ceo()));

notify pgrst, 'reload schema';

-- Comprobación: todas las reglas son solo de la ceo (7 con solo_ceo = true), el bucket es privado
-- (false) y cuántos certificados hay.
select
  (select count(*) from pg_policies
     where ((schemaname = 'public' and tablename = 'course_certificates') or (schemaname = 'storage' and policyname like 'cesi-certificados:%'))
       and (coalesce(qual, '') || coalesce(with_check, '')) like '%is_ceo%') as reglas_solo_ceo,
  (select public from storage.buckets where id = 'cesi-certificados') as bucket_publico,
  has_table_privilege('anon', 'public.course_certificates', 'select') as anon_lee,
  (select count(*) from public.course_certificates) as certificados;
