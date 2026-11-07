-- =============================================================================
-- CIFA · Parte 40: candidaturas a las vacantes (en la app y en una página pública)
-- =============================================================================
-- Ejecutar en Supabase → SQL Editor (proyecto fvswxhfjclvadcoyuqyu), después de la parte 39
-- (supabase/parte39_equipo_en_cursos.sql). Se puede ejecutar más de una vez. No borra datos.
--
-- Vacantes: las mismas de siempre (tabla public.vacancies de la ceo, parte 38). Quién las crea,
-- edita, abre y cierra no cambia: la ceo, Directivo y RRHH (parte 38).
--
-- Candidaturas (tabla nueva vacancy_applications, cerrada a todos: solo se usa con estas funciones):
--   · Alumnos y equipo se postulan a una vacante abierta desde la app (cesi_vacancy_apply): por
--     qué les interesa, experiencia, disponibilidad y contacto (Discord y correo). Su nombre y su
--     país salen de su perfil. Una por persona y vacante.
--   · Cualquiera, sin cuenta, desde la página pública /vacantes (cesi_public_apply): lo mismo con
--     nombre, correo y Discord (opcional) y la casilla de consentimiento. Contra el spam: un campo
--     oculto (si viene relleno no se guarda nada), límite de envíos (3 al día por correo, 5 por
--     hora por conexión y 40 por hora en total) y una por correo y vacante. La página pública solo
--     puede enviar y leer las vacantes abiertas: nunca leer candidaturas.
--   · Estado: 'nueva' | 'vista' | 'entrevista' | 'aceptada' | 'descartada'.
--   · Ven todas y cambian su estado: la ceo y RRHH. Directivo no (sigue como en la parte 38).
--   · Cada persona con cuenta ve las suyas y su estado (cesi_my_applications). Nadie más.
--   · Avisos de la ceo: las que aún no ha visto (ceo_seen_at vacío) salen en su Inicio y con un
--     número en el menú; se marcan vistas al abrir la vacante.

do $$
begin
  if to_regprocedure('public.cesi_vacancy_save(text, jsonb)') is null then
    raise exception 'Falta la parte 38 (supabase/parte38_vacantes.sql): ejecútala antes.';
  end if;
  if to_regprocedure('public.cesi_my_teacher_courses()') is null then
    raise exception 'Falta la parte 39 (supabase/parte39_equipo_en_cursos.sql): ejecútala antes.';
  end if;
end;
$$;

-- -----------------------------------------------------------------------------
-- Ayudas (internas: nadie las puede llamar)
-- -----------------------------------------------------------------------------

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

-- ¿Puede `p_profile` ver las candidaturas y cambiar su estado? (la ceo y RRHH)
create or replace function public.cesi_application_viewer(p_profile uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.profiles
    where id = p_profile and (role = 'ceo' or (role = 'equipo' and area = 'personas'))
  );
$$;

-- La cuenta actual si ve candidaturas; si no, error.
create or replace function public.cesi_application_me()
returns uuid
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_me uuid := (select auth.uid());
begin
  if not public.cesi_application_viewer(v_me) then
    raise exception 'Solo la dirección y RRHH ven las candidaturas.' using errcode = '42501';
  end if;
  return v_me;
end;
$$;

-- Texto limpio y recortado ('' si viene vacío).
create or replace function public.cesi_clip(p_text text, p_max integer)
returns text
language sql
immutable
set search_path = ''
as $$
  select left(trim(coalesce(p_text, '')), p_max);
$$;

revoke all on function public.cesi_vacancy_is_open(text) from public, anon, authenticated;
revoke all on function public.cesi_application_viewer(uuid) from public, anon, authenticated;
revoke all on function public.cesi_application_me() from public, anon, authenticated;
revoke all on function public.cesi_clip(text, integer) from public, anon, authenticated;

-- -----------------------------------------------------------------------------
-- La tabla
-- -----------------------------------------------------------------------------
create table if not exists public.vacancy_applications (
  id uuid primary key default gen_random_uuid(),
  vacancy_id text not null check (length(vacancy_id) between 1 and 200),
  created_at timestamptz not null default now()
);

-- Columnas (también si la tabla ya existía de un borrador anterior).
alter table public.vacancy_applications add column if not exists user_id uuid references public.profiles (id) on delete set null;
alter table public.vacancy_applications add column if not exists source text not null default 'cuenta';
alter table public.vacancy_applications add column if not exists name text not null default '';
alter table public.vacancy_applications add column if not exists country text not null default '';
alter table public.vacancy_applications add column if not exists email text not null default '';
alter table public.vacancy_applications add column if not exists discord text not null default '';
alter table public.vacancy_applications add column if not exists motivation text not null default '';
alter table public.vacancy_applications add column if not exists experience text not null default '';
alter table public.vacancy_applications add column if not exists availability text not null default '';
alter table public.vacancy_applications add column if not exists consent_at timestamptz;
alter table public.vacancy_applications add column if not exists status text not null default 'nueva';
alter table public.vacancy_applications add column if not exists ceo_seen_at timestamptz;
alter table public.vacancy_applications add column if not exists ip_hash text;
alter table public.vacancy_applications add column if not exists updated_at timestamptz not null default now();
alter table public.vacancy_applications alter column user_id drop not null;
alter table public.vacancy_applications alter column user_id drop default;
alter table public.vacancy_applications alter column status set default 'nueva';

-- Estados de un borrador anterior → los de ahora; y sus reglas de estado fuera.
do $$
declare
  r record;
begin
  for r in
    select conname from pg_constraint
    where conrelid = 'public.vacancy_applications'::regclass and contype = 'c'
      and pg_get_constraintdef(oid) like '%status%'
  loop
    execute format('alter table public.vacancy_applications drop constraint %I', r.conname);
  end loop;
end;
$$;
update public.vacancy_applications set status = case status when 'pendiente' then 'nueva' when 'rechazada' then 'descartada' else status end
where status in ('pendiente', 'rechazada');
-- Un borrador anterior guardaba el texto en «message»: pasa a «por qué te interesa».
do $$
begin
  if exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'vacancy_applications' and column_name = 'message') then
    execute 'update public.vacancy_applications set motivation = message where motivation = '''' and coalesce(message, '''') <> ''''';
  end if;
end;
$$;

alter table public.vacancy_applications drop constraint if exists vacancy_applications_status_ok;
alter table public.vacancy_applications add constraint vacancy_applications_status_ok
  check (status in ('nueva', 'vista', 'entrevista', 'aceptada', 'descartada'));
alter table public.vacancy_applications drop constraint if exists vacancy_applications_source_ok;
alter table public.vacancy_applications add constraint vacancy_applications_source_ok
  check (source in ('cuenta', 'publica'));
alter table public.vacancy_applications drop constraint if exists vacancy_applications_sizes_ok;
alter table public.vacancy_applications add constraint vacancy_applications_sizes_ok
  check (length(name) <= 120 and length(country) <= 80 and length(email) <= 200 and length(discord) <= 80
    and length(motivation) <= 2000 and length(experience) <= 2000 and length(availability) <= 500);

-- Una por cuenta y vacante; y una por correo y vacante en la página pública.
do $$
begin
  if not exists (select 1 from pg_constraint where conrelid = 'public.vacancy_applications'::regclass and conname = 'vacancy_applications_vacancy_id_user_id_key') then
    alter table public.vacancy_applications add constraint vacancy_applications_vacancy_id_user_id_key unique (vacancy_id, user_id);
  end if;
end;
$$;
create unique index if not exists vacancy_applications_public_email_idx
  on public.vacancy_applications (vacancy_id, lower(email)) where source = 'publica';
create index if not exists vacancy_applications_vacancy_idx on public.vacancy_applications (vacancy_id, created_at);
create index if not exists vacancy_applications_recent_idx on public.vacancy_applications (created_at desc);

-- Cerrada a todos: nadie la lee ni la escribe directamente (ni con cuenta ni sin ella). Las
-- reglas de un borrador anterior se quitan.
alter table public.vacancy_applications enable row level security;
revoke all on public.vacancy_applications from public, anon, authenticated;
drop policy if exists "vacancy_applications: leer (las mías; la ceo, Directivo y RRHH, todas)" on public.vacancy_applications;
drop policy if exists "vacancy_applications: postularse (alumnos y equipo, a una abierta)" on public.vacancy_applications;
drop policy if exists "vacancy_applications: cambiar (la ceo, Directivo y RRHH)" on public.vacancy_applications;
drop policy if exists "vacancy_applications: borrar (la ceo, Directivo y RRHH)" on public.vacancy_applications;

-- -----------------------------------------------------------------------------
-- Vacantes abiertas (para la app y para la página pública): sin datos internos
-- -----------------------------------------------------------------------------
drop function if exists public.cesi_open_vacancies();
create or replace function public.cesi_open_vacancies()
returns table (id text, title text, area text, description text, requirements text, hours_per_week text, seats integer, opened_at text, closes_at text)
language sql
stable
security definer
set search_path = ''
as $$
  select v.id, coalesce(v.data ->> 'title', ''), coalesce(v.data ->> 'area', ''), coalesce(v.data ->> 'description', ''),
    coalesce(v.data ->> 'requirements', ''), coalesce(v.data ->> 'hoursPerWeek', ''),
    case when (v.data ->> 'seats') ~ '^[0-9]{1,4}$' then (v.data ->> 'seats')::integer end,
    coalesce(v.data ->> 'openedAt', ''), coalesce(v.data ->> 'closesAt', '')
  from public.vacancies v
  where v.deleted_at is null and v.user_id in (select p.id from public.profiles p where p.role = 'ceo')
    and coalesce(v.data ->> 'status', 'abierta') in ('abierta', 'open', 'in_progress')
  order by coalesce(v.data ->> 'openedAt', '') desc, coalesce(v.data ->> 'title', '');
$$;

-- -----------------------------------------------------------------------------
-- Postularse con cuenta (alumnos y equipo)
-- -----------------------------------------------------------------------------
create or replace function public.cesi_vacancy_apply(
  p_vacancy text, p_motivation text, p_experience text, p_availability text, p_discord text, p_email text
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_me uuid := (select auth.uid());
  v_acc public.profiles;
  v_prof public.account_profiles;
  v_email text := lower(public.cesi_clip(p_email, 200));
begin
  select * into v_acc from public.profiles where id = v_me;
  if not found or v_acc.role not in ('alumno', 'equipo') then
    raise exception 'Solo los alumnos y el equipo se postulan desde la app.' using errcode = '42501';
  end if;
  if not public.cesi_vacancy_is_open(p_vacancy) then
    raise exception 'Esta vacante ya no está abierta.' using errcode = '22023';
  end if;
  if public.cesi_clip(p_motivation, 2000) = '' then
    raise exception 'Cuéntanos por qué te interesa.' using errcode = '22023';
  end if;
  if v_email <> '' and v_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then
    raise exception 'El correo no es válido.' using errcode = '22023';
  end if;
  if exists (select 1 from public.vacancy_applications a where a.vacancy_id = p_vacancy and a.user_id = v_me) then
    return jsonb_build_object('status', 'duplicate');
  end if;
  select * into v_prof from public.account_profiles where id = v_me;
  insert into public.vacancy_applications (vacancy_id, user_id, source, name, country, email, discord, motivation, experience, availability, status)
  values (p_vacancy, v_me, 'cuenta',
    left(coalesce(nullif(trim(v_prof.full_name), ''), nullif(trim(v_acc.display_name), ''), 'Sin nombre'), 120),
    left(coalesce(v_prof.country, ''), 80),
    coalesce(nullif(v_email, ''), lower(coalesce(v_acc.email, ''))),
    public.cesi_clip(p_discord, 80),
    public.cesi_clip(p_motivation, 2000), public.cesi_clip(p_experience, 2000), public.cesi_clip(p_availability, 500),
    'nueva');
  return jsonb_build_object('status', 'ok');
end;
$$;

-- -----------------------------------------------------------------------------
-- Postularse sin cuenta (página pública /vacantes)
-- -----------------------------------------------------------------------------
-- Devuelve { status: 'ok' | 'duplicate' | 'limit' }. p_website es el campo oculto: una persona no
-- lo ve ni lo rellena; si llega con algo es un robot y se contesta 'ok' sin guardar nada.
create or replace function public.cesi_public_apply(
  p_vacancy text, p_name text, p_email text, p_discord text, p_motivation text, p_experience text,
  p_availability text, p_consent boolean, p_website text default ''
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_name text := public.cesi_clip(p_name, 120);
  v_email text := lower(public.cesi_clip(p_email, 200));
  v_headers jsonb := coalesce(nullif(current_setting('request.headers', true), '')::jsonb, '{}'::jsonb);
  v_ip text := trim(split_part(coalesce(v_headers ->> 'x-forwarded-for', v_headers ->> 'x-real-ip', ''), ',', 1));
  v_ip_hash text;
begin
  if coalesce(trim(p_website), '') <> '' then
    return jsonb_build_object('status', 'ok');
  end if;
  if not coalesce(p_consent, false) then
    raise exception 'Tienes que aceptar el uso de tus datos.' using errcode = '22023';
  end if;
  if length(v_name) < 2 then
    raise exception 'Escribe tu nombre.' using errcode = '22023';
  end if;
  if v_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then
    raise exception 'El correo no es válido.' using errcode = '22023';
  end if;
  if public.cesi_clip(p_motivation, 2000) = '' then
    raise exception 'Cuéntanos por qué te interesa.' using errcode = '22023';
  end if;
  if not public.cesi_vacancy_is_open(p_vacancy) then
    raise exception 'Esta vacante ya no está abierta.' using errcode = '22023';
  end if;
  v_ip_hash := case when v_ip <> '' then encode(sha256(convert_to('cesi-vacantes:' || v_ip, 'UTF8')), 'hex') end;

  -- De uno en uno, para que los límites se cuenten bien.
  perform pg_advisory_xact_lock(hashtext('cesi_public_apply'));
  if (select count(*) from public.vacancy_applications a where a.source = 'publica' and a.created_at > now() - interval '1 hour') >= 40
    or (v_ip_hash is not null and (select count(*) from public.vacancy_applications a
          where a.source = 'publica' and a.ip_hash = v_ip_hash and a.created_at > now() - interval '1 hour') >= 5)
    or (select count(*) from public.vacancy_applications a
          where a.source = 'publica' and lower(a.email) = v_email and a.created_at > now() - interval '1 day') >= 3 then
    return jsonb_build_object('status', 'limit');
  end if;
  if exists (select 1 from public.vacancy_applications a where a.source = 'publica' and a.vacancy_id = p_vacancy and lower(a.email) = v_email) then
    return jsonb_build_object('status', 'duplicate');
  end if;

  insert into public.vacancy_applications (vacancy_id, user_id, source, name, email, discord, motivation, experience, availability, consent_at, status, ip_hash)
  values (p_vacancy, null, 'publica', v_name, v_email, public.cesi_clip(p_discord, 80),
    public.cesi_clip(p_motivation, 2000), public.cesi_clip(p_experience, 2000), public.cesi_clip(p_availability, 500),
    now(), 'nueva', v_ip_hash);
  return jsonb_build_object('status', 'ok');
end;
$$;

-- -----------------------------------------------------------------------------
-- Leer
-- -----------------------------------------------------------------------------

-- Las mías (cada cuenta, solo las suyas): la vacante y su estado.
create or replace function public.cesi_my_applications()
returns table (id uuid, vacancy_id text, title text, status text, created_at timestamptz)
language sql
stable
security definer
set search_path = ''
as $$
  select a.id, a.vacancy_id,
    coalesce((select nullif(v.data ->> 'title', '') from public.vacancies v
              where v.id = a.vacancy_id and v.user_id in (select p.id from public.profiles p where p.role = 'ceo') limit 1), 'Vacante'),
    a.status, a.created_at
  from public.vacancy_applications a
  where a.user_id = (select auth.uid()) and (select auth.uid()) is not null
  order by a.created_at desc;
$$;

-- Las candidaturas de una vacante (la ceo y RRHH).
create or replace function public.cesi_vacancy_applications(p_vacancy text)
returns table (
  id uuid, source text, kind text, name text, country text, email text, discord text,
  motivation text, experience text, availability text, status text, created_at timestamptz, ceo_seen boolean
)
language plpgsql
stable
security definer
set search_path = ''
as $$
#variable_conflict use_column
begin
  perform public.cesi_application_me();
  return query
    select a.id, a.source,
      case when a.source = 'publica' then 'Sin cuenta'
           when p.role = 'alumno' then 'Alumno'
           when p.role = 'equipo' then coalesce((select ar.name from public.areas ar where ar.id = p.area), 'Equipo')
           else 'Cuenta' end,
      a.name, a.country, a.email, a.discord, a.motivation, a.experience, a.availability, a.status, a.created_at,
      a.ceo_seen_at is not null
    from public.vacancy_applications a
    left join public.profiles p on p.id = a.user_id
    where a.vacancy_id = p_vacancy
    order by a.created_at desc;
end;
$$;

-- Cuántas tiene cada vacante y cuántas no ha visto la ceo (la ceo y RRHH).
create or replace function public.cesi_vacancy_application_counts()
returns table (vacancy_id text, total integer, unseen integer)
language plpgsql
stable
security definer
set search_path = ''
as $$
#variable_conflict use_column
begin
  perform public.cesi_application_me();
  return query
    select a.vacancy_id, count(*)::integer, (count(*) filter (where a.ceo_seen_at is null))::integer
    from public.vacancy_applications a
    group by a.vacancy_id;
end;
$$;

-- Avisos de la ceo: las que aún no ha visto (0 para cualquier otra cuenta).
create or replace function public.cesi_applications_unseen()
returns integer
language sql
stable
security definer
set search_path = ''
as $$
  select case when public.is_ceo() then (select count(*)::integer from public.vacancy_applications where ceo_seen_at is null) else 0 end;
$$;

-- -----------------------------------------------------------------------------
-- Cambiar
-- -----------------------------------------------------------------------------

-- El estado de una candidatura (la ceo y RRHH).
create or replace function public.cesi_application_set_status(p_id uuid, p_status text)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
begin
  perform public.cesi_application_me();
  if p_status not in ('nueva', 'vista', 'entrevista', 'aceptada', 'descartada') then
    raise exception 'Estado no válido.' using errcode = '22023';
  end if;
  update public.vacancy_applications set status = p_status, updated_at = now(),
    ceo_seen_at = case when public.is_ceo() then coalesce(ceo_seen_at, now()) else ceo_seen_at end
  where id = p_id;
end;
$$;

-- La ceo abre una vacante: sus candidaturas dejan de salir en los avisos.
create or replace function public.cesi_applications_mark_seen(p_vacancy text)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
begin
  if not public.is_ceo() then
    return;
  end if;
  update public.vacancy_applications set ceo_seen_at = now() where vacancy_id = p_vacancy and ceo_seen_at is null;
end;
$$;

-- -----------------------------------------------------------------------------
-- Permisos de las funciones
-- -----------------------------------------------------------------------------
revoke all on function public.cesi_open_vacancies() from public;
revoke all on function public.cesi_public_apply(text, text, text, text, text, text, text, boolean, text) from public;
revoke all on function public.cesi_vacancy_apply(text, text, text, text, text, text) from public, anon;
revoke all on function public.cesi_my_applications() from public, anon;
revoke all on function public.cesi_vacancy_applications(text) from public, anon;
revoke all on function public.cesi_vacancy_application_counts() from public, anon;
revoke all on function public.cesi_applications_unseen() from public, anon;
revoke all on function public.cesi_application_set_status(uuid, text) from public, anon;
revoke all on function public.cesi_applications_mark_seen(text) from public, anon;

-- La página pública (anon): solo ver las vacantes abiertas y enviar su candidatura.
grant execute on function public.cesi_open_vacancies() to anon, authenticated;
grant execute on function public.cesi_public_apply(text, text, text, text, text, text, text, boolean, text) to anon;
-- Con cuenta (cada función comprueba quién llama).
grant execute on function public.cesi_vacancy_apply(text, text, text, text, text, text) to authenticated;
grant execute on function public.cesi_my_applications() to authenticated;
grant execute on function public.cesi_vacancy_applications(text) to authenticated;
grant execute on function public.cesi_vacancy_application_counts() to authenticated;
grant execute on function public.cesi_applications_unseen() to authenticated;
grant execute on function public.cesi_application_set_status(uuid, text) to authenticated;
grant execute on function public.cesi_applications_mark_seen(text) to authenticated;

notify pgrst, 'reload schema';

-- Comprobación: la tabla cerrada (sin permisos para nadie: false, false), sin reglas de acceso (0),
-- la página pública solo con sus 2 funciones (2) y sin ninguna de leer candidaturas (0), y
-- cuántas candidaturas hay.
select
  has_table_privilege('anon', 'public.vacancy_applications', 'select') as anon_lee_tabla,
  has_table_privilege('authenticated', 'public.vacancy_applications', 'select') as cuentas_leen_tabla,
  (select count(*) from pg_policies where schemaname = 'public' and tablename = 'vacancy_applications') as reglas,
  (select count(*) from unnest(array['public.cesi_open_vacancies()', 'public.cesi_public_apply(text, text, text, text, text, text, text, boolean, text)']) f (sig)
     where has_function_privilege('anon', f.sig, 'execute')) as publica_puede,
  (select count(*) from unnest(array['public.cesi_my_applications()', 'public.cesi_vacancy_applications(text)', 'public.cesi_vacancy_application_counts()',
     'public.cesi_application_set_status(uuid, text)', 'public.cesi_vacancy_apply(text, text, text, text, text, text)']) f (sig)
     where has_function_privilege('anon', f.sig, 'execute')) as publica_no_puede,
  (select count(*) from public.vacancy_applications) as candidaturas;
