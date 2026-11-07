-- =============================================================================
-- CIFA · Parte 44: generar certificados desde la app (amplía la parte 43; solo la ceo)
-- =============================================================================
-- Ejecutar en Supabase → SQL Editor (proyecto fvswxhfjclvadcoyuqyu), después de la parte 43
-- (supabase/parte43_certificados.sql). Se puede ejecutar más de una vez. No borra datos ni quita
-- nada de la parte 43: solo añade.
--
-- Qué hace:
--   · course_certificates (parte 43) gana: code (código de verificación CIFA-AÑO-0001, único),
--     generated_at (si el PDF lo ha generado la app), person_name (el nombre que sale en el PDF),
--     las firmas y el logo usados y si salen media y asistencia.
--   · certificate_signatures: «Firmas» (imagen PNG/JPG, nombre y cargo). teacher_id: la ficha de
--     Equipo del profesor al que pertenece (para ponerla sola en sus cursos); is_ceo_default: la de
--     la ceo (firma derecha por defecto).
--   · certificate_logos: «Logos» de empresas colaboradoras (imagen y nombre).
--   · certificate_course_settings: las firmas, el logo y si salen media y asistencia en cada curso
--     (los usa «Generar todos»).
--   · Las imágenes van al bucket privado de la parte 43 (cesi-certificados), en firmas/ y logos/:
--     ahora admite también PNG y JPG (la app las limita a 2 MB).
--   · Todo, solo la ceo: como en la parte 43, cada regla exige ser la ceo (ni Directivo ni nadie más).

do $$
begin
  if to_regclass('public.course_certificates') is null then
    raise exception 'Falta la parte 43 (supabase/parte43_certificados.sql): ejecútala antes.';
  end if;
end;
$$;

-- -----------------------------------------------------------------------------
-- Certificados (parte 43), ampliados
-- -----------------------------------------------------------------------------
alter table public.course_certificates add column if not exists code text;
alter table public.course_certificates add column if not exists generated_at timestamptz;
alter table public.course_certificates add column if not exists person_name text not null default '';
alter table public.course_certificates add column if not exists left_signature_id uuid;
alter table public.course_certificates add column if not exists right_signature_id uuid;
alter table public.course_certificates add column if not exists logo_id uuid;
alter table public.course_certificates add column if not exists show_stats boolean not null default true;
alter table public.course_certificates drop constraint if exists course_certificates_code_ok;
alter table public.course_certificates add constraint course_certificates_code_ok
  check (code is null or code ~ '^CIFA-[0-9]{4}-[0-9]{4,6}$');
alter table public.course_certificates drop constraint if exists course_certificates_person_name_ok;
alter table public.course_certificates add constraint course_certificates_person_name_ok check (length(person_name) <= 160);
create unique index if not exists course_certificates_code_idx on public.course_certificates (code) where code is not null;

-- -----------------------------------------------------------------------------
-- Firmas, logos y ajustes de cada curso
-- -----------------------------------------------------------------------------
create table if not exists public.certificate_signatures (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(name) between 1 and 120),
  title text not null default '' check (length(title) <= 120),
  file_path text not null check (length(file_path) between 1 and 500),
  file_type text not null check (file_type in ('image/png', 'image/jpeg')),
  teacher_id text check (teacher_id is null or length(teacher_id) between 1 and 200),
  is_ceo_default boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.certificate_logos (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(name) between 1 and 120),
  file_path text not null check (length(file_path) between 1 and 500),
  file_type text not null check (file_type in ('image/png', 'image/jpeg')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.certificate_course_settings (
  course_id text primary key check (length(course_id) between 1 and 200),
  left_signature_id uuid references public.certificate_signatures (id) on delete set null,
  right_signature_id uuid references public.certificate_signatures (id) on delete set null,
  logo_id uuid references public.certificate_logos (id) on delete set null,
  show_stats boolean not null default true,
  updated_at timestamptz not null default now()
);

-- Solo la ceo (igual que course_certificates en la parte 43).
do $$
declare
  t text;
begin
  foreach t in array array['certificate_signatures', 'certificate_logos', 'certificate_course_settings'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke all on public.%I from public, anon, authenticated', t);
    execute format('grant select, insert, update, delete on public.%I to authenticated', t);
    execute format('drop policy if exists %I on public.%I', t || ': solo la ceo (leer)', t);
    execute format('drop policy if exists %I on public.%I', t || ': solo la ceo (crear)', t);
    execute format('drop policy if exists %I on public.%I', t || ': solo la ceo (cambiar)', t);
    execute format('drop policy if exists %I on public.%I', t || ': solo la ceo (borrar)', t);
    execute format('create policy %I on public.%I for select to authenticated using ((select public.is_ceo()))', t || ': solo la ceo (leer)', t);
    execute format('create policy %I on public.%I for insert to authenticated with check ((select public.is_ceo()))', t || ': solo la ceo (crear)', t);
    execute format('create policy %I on public.%I for update to authenticated using ((select public.is_ceo())) with check ((select public.is_ceo()))', t || ': solo la ceo (cambiar)', t);
    execute format('create policy %I on public.%I for delete to authenticated using ((select public.is_ceo()))', t || ': solo la ceo (borrar)', t);
  end loop;
end;
$$;

-- Una sola firma «de la ceo» por defecto.
create unique index if not exists certificate_signatures_ceo_default_idx on public.certificate_signatures (is_ceo_default) where is_ceo_default;

-- -----------------------------------------------------------------------------
-- Bucket cesi-certificados (parte 43): también imágenes de firmas y logos
-- -----------------------------------------------------------------------------
-- Sus reglas de la parte 43 no cambian: leer, subir y borrar, solo la ceo.
update storage.buckets
set public = false,
    allowed_mime_types = array['application/pdf', 'image/png', 'image/jpeg']
where id = 'cesi-certificados';

notify pgrst, 'reload schema';

-- Comprobación: todas las reglas de las tablas de certificados son solo de la ceo (16 con
-- solo_ceo = true y 0 sin ella), el bucket sigue privado (false) con PNG y JPG, ningún permiso
-- para anon (false) y cuántos certificados tienen ya código.
select
  (select count(*) from pg_policies
     where schemaname = 'public' and tablename in ('course_certificates', 'certificate_signatures', 'certificate_logos', 'certificate_course_settings')
       and (coalesce(qual, '') || coalesce(with_check, '')) like '%is_ceo%') as reglas_solo_ceo,
  (select count(*) from pg_policies
     where schemaname = 'public' and tablename in ('course_certificates', 'certificate_signatures', 'certificate_logos', 'certificate_course_settings')
       and (coalesce(qual, '') || coalesce(with_check, '')) not like '%is_ceo%') as reglas_sin_ceo,
  (select public from storage.buckets where id = 'cesi-certificados') as bucket_publico,
  (select allowed_mime_types from storage.buckets where id = 'cesi-certificados') as tipos,
  has_table_privilege('anon', 'public.certificate_signatures', 'select') as anon_lee_firmas,
  (select count(*) from public.course_certificates where code is not null) as con_codigo;
