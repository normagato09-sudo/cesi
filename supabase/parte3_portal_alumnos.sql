-- =============================================================================
-- CIFA · Portal de alumnos, paso 1: perfil del alumno
-- =============================================================================
-- Ejecutar en Supabase → SQL Editor (proyecto fvswxhfjclvadcoyuqyu), después de las partes 1a,
-- 1b y 2. No hace falta cambiar nada a mano.
--
-- Qué hace:
--   · Tabla nueva student_profiles: el perfil que rellena cada alumno (nombre, Discord, país, zona
--     horaria, cumpleaños sin año y disponibilidad semanal en su hora local). Una fila por cuenta.
--   · El alumno solo lee, crea y edita SU fila (y solo si su papel es 'alumno'); la ceo las lee
--     todas. Su papel y a quién está unido siguen en profiles, que solo cambia la ceo.
-- No cambia ninguna tabla que ya exista, no borra datos y se puede ejecutar más de una vez.

-- Comprobación: tienen que estar hechas las partes 1a y 2.
do $$
begin
  if to_regclass('public.profiles') is null or to_regprocedure('public.is_ceo()') is null then
    raise exception 'Falta la parte 1a (supabase/parte1a_cuentas_papeles.sql): ejecútala antes.';
  end if;
  if to_regprocedure('public.my_role()') is null then
    raise exception 'Falta la parte 2 (supabase/parte2_papeles_permisos.sql): ejecútala antes.';
  end if;
end;
$$;

-- ¿Es una disponibilidad del portal válida (o null)? Mismo formato que los horarios de la app:
-- [{ day: 0..6, enabled, slots: [{ start: 'HH:mm', end }] }], 7 días, de 00:00 a 23:59, cada
-- franja termina después de empezar (ninguna cruza la medianoche). Hasta 12 franjas por día
-- (se marca hora a hora).
create or replace function public.cesi_valid_student_week(p_week jsonb)
returns boolean
language plpgsql
immutable
set search_path = ''
as $$
declare
  e jsonb;
  s jsonb;
  seen int[] := '{}';
  hhmm constant text := '^([01][0-9]|2[0-3]):[0-5][0-9]$';
begin
  if p_week is null or jsonb_typeof(p_week) = 'null' then
    return true;
  end if;
  if jsonb_typeof(p_week) <> 'array' or jsonb_array_length(p_week) <> 7 then
    return false;
  end if;
  for e in select value from jsonb_array_elements(p_week) loop
    if jsonb_typeof(e) <> 'object'
      or exists (select 1 from jsonb_object_keys(e) k where k not in ('day', 'enabled', 'slots'))
      or jsonb_typeof(e -> 'day') is distinct from 'number'
      or jsonb_typeof(e -> 'enabled') is distinct from 'boolean'
      or jsonb_typeof(e -> 'slots') is distinct from 'array' then
      return false;
    end if;
    if (e ->> 'day') !~ '^[0-6]$' or (e ->> 'day')::int = any (seen) then
      return false;
    end if;
    seen := seen || (e ->> 'day')::int;
    if jsonb_array_length(e -> 'slots') > 12 then
      return false;
    end if;
    for s in select value from jsonb_array_elements(e -> 'slots') loop
      if jsonb_typeof(s) <> 'object'
        or exists (select 1 from jsonb_object_keys(s) k where k not in ('start', 'end'))
        or jsonb_typeof(s -> 'start') is distinct from 'string'
        or jsonb_typeof(s -> 'end') is distinct from 'string'
        or (s ->> 'start') !~ hhmm or (s ->> 'end') !~ hhmm then
        return false;
      end if;
      if (s ->> 'end')::time <= (s ->> 'start')::time then
        return false;
      end if;
    end loop;
  end loop;
  return true;
end;
$$;

-- La usa la comprobación de la columna availability, que se evalúa con los permisos del alumno.
revoke all on function public.cesi_valid_student_week(jsonb) from public, anon;
grant execute on function public.cesi_valid_student_week(jsonb) to authenticated;

-- ---------------------------------------------------------------------------
-- Perfil del alumno
-- ---------------------------------------------------------------------------
--   id            la cuenta (profiles.id)
--   full_name     nombre y apellidos
--   discord       usuario de Discord ('' si no lo da)
--   country       país (ISO 3166-1 alfa-2) y time_zone (zona IANA de ese país)
--   birthday      cumpleaños sin año, 'MM-DD' ('' si no lo da)
--   availability  disponibilidad semanal en su hora local (ver cesi_valid_student_week)
--   completed_at  cuándo completó el perfil (null: aún no puede usar el portal)
-- Se une a mi ficha de Alumnos con profiles.linked_student_id (lo pone la ceo en Accesos).
create table if not exists public.student_profiles (
  id uuid primary key references public.profiles (id) on delete cascade,
  full_name text not null default '' check (length(full_name) <= 120),
  discord text not null default '' check (length(discord) <= 40),
  country text not null default '' check (country = '' or country ~ '^[A-Z]{2}$'),
  time_zone text not null default '' check (length(time_zone) <= 64),
  birthday text not null default '' check (birthday = '' or birthday ~ '^(0[1-9]|1[0-2])-(0[1-9]|[12][0-9]|3[01])$'),
  availability jsonb check (public.cesi_valid_student_week(availability)),
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint student_profiles_complete check (
    completed_at is null
    or (length(trim(full_name)) > 0 and country <> '' and time_zone <> '' and availability is not null)
  )
);

-- updated_at lo pone el servidor en cada cambio.
create or replace function public.cesi_student_profiles_touch()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  if tg_op = 'UPDATE' then
    new.created_at := old.created_at;
  end if;
  return new;
end;
$$;

revoke all on function public.cesi_student_profiles_touch() from public, anon, authenticated;

drop trigger if exists student_profiles_touch on public.student_profiles;
create trigger student_profiles_touch
  before insert or update on public.student_profiles
  for each row execute function public.cesi_student_profiles_touch();

-- RLS: el alumno, solo su fila (y solo con papel 'alumno'); la ceo lee todas. Nadie la borra
-- desde la app (se borra sola si se borra la cuenta).
alter table public.student_profiles enable row level security;
drop policy if exists "student_profiles: leer el mío (la ceo, todos)" on public.student_profiles;
drop policy if exists "student_profiles: crear el mío" on public.student_profiles;
drop policy if exists "student_profiles: editar el mío" on public.student_profiles;
create policy "student_profiles: leer el mío (la ceo, todos)" on public.student_profiles
  for select to authenticated
  using ((id = (select auth.uid()) and (select public.my_role()) = 'alumno') or (select public.is_ceo()));
create policy "student_profiles: crear el mío" on public.student_profiles
  for insert to authenticated
  with check (id = (select auth.uid()) and (select public.my_role()) = 'alumno');
create policy "student_profiles: editar el mío" on public.student_profiles
  for update to authenticated
  using (id = (select auth.uid()) and (select public.my_role()) = 'alumno')
  with check (id = (select auth.uid()) and (select public.my_role()) = 'alumno');

revoke all on public.student_profiles from anon;
revoke all on public.student_profiles from authenticated;
grant select on public.student_profiles to authenticated;
grant insert (id, full_name, discord, country, time_zone, birthday, availability, completed_at) on public.student_profiles to authenticated;
grant update (full_name, discord, country, time_zone, birthday, availability, completed_at) on public.student_profiles to authenticated;

notify pgrst, 'reload schema';

-- Comprobación: la tabla, sus políticas (3) y cuántos alumnos han completado el perfil.
select
  to_regclass('public.student_profiles') is not null as tabla_creada,
  (select count(*) from pg_policies where schemaname = 'public' and tablename = 'student_profiles') as politicas,
  (select count(*) from public.student_profiles where completed_at is not null) as perfiles_completos;
