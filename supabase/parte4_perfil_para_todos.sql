-- =============================================================================
-- CIFA · Parte 4: perfil para todos (alumnos, equipo y ceo)
-- =============================================================================
-- Ejecutar en Supabase → SQL Editor (proyecto fvswxhfjclvadcoyuqyu), después de la parte 3
-- (supabase/parte3_portal_alumnos.sql). Se puede ejecutar más de una vez.
--
-- Qué hace:
--   · La tabla student_profiles pasa a llamarse account_profiles. Se conservan todas las filas,
--     los ids y los perfiles ya completados de los alumnos (es un cambio de nombre, no una copia).
--   · Ahora también el equipo y la ceo pueden crear y editar SU perfil. Cada cuenta lee y edita
--     solo el suyo; la ceo lee todos. Una cuenta pendiente, ninguno.
--   · TEMPORAL: student_profiles queda como vista de account_profiles, para que la versión
--     publicada de la app siga funcionando mientras Vercel publica la nueva. Para quitarla más
--     adelante, el DROP VIEW comentado del final.
--   · No toca weekly_availability (mi disponibilidad de «Buscar hueco»).
-- No borra datos ni cambia ningún id.

-- Comprobación: tienen que estar hechas las partes 1a, 2 y 3.
do $$
begin
  if to_regclass('public.profiles') is null or to_regprocedure('public.is_ceo()') is null then
    raise exception 'Falta la parte 1a (supabase/parte1a_cuentas_papeles.sql): ejecútala antes.';
  end if;
  if to_regprocedure('public.my_role()') is null then
    raise exception 'Falta la parte 2 (supabase/parte2_papeles_permisos.sql): ejecútala antes.';
  end if;
  if to_regprocedure('public.cesi_valid_student_week(jsonb)') is null then
    raise exception 'Falta la parte 3 (supabase/parte3_portal_alumnos.sql): ejecútala antes.';
  end if;
end;
$$;

-- La comprobación de availability se evalúa con los permisos de quien guarda.
revoke all on function public.cesi_valid_student_week(jsonb) from public, anon;
grant execute on function public.cesi_valid_student_week(jsonb) to authenticated;

-- ---------------------------------------------------------------------------
-- Perfil de cada cuenta: alumnos, equipo y ceo (parte 4; antes, student_profiles)
-- ---------------------------------------------------------------------------
--   id            la cuenta (profiles.id)
--   full_name     nombre y apellidos
--   discord       usuario de Discord ('' si no lo da)
--   country       país (ISO 3166-1 alfa-2) y time_zone (zona IANA de ese país)
--   birthday      cumpleaños sin año, 'MM-DD' ('' si no lo da)
--   availability  disponibilidad semanal en su hora local (ver cesi_valid_student_week)
--   completed_at  cuándo completó el perfil (null: un alumno o una persona de equipo aún no puede
--                 usar la app; a la ceo solo se le avisa)
-- Un alumno se une a mi ficha de Alumnos con profiles.linked_student_id (lo pone la ceo en Accesos).
-- Base del calendario compartido. Mi disponibilidad de «Buscar hueco» (weekly_availability) va aparte.

-- La tabla de la parte 3 (student_profiles) pasa a llamarse account_profiles, con sus filas, sus
-- ids y sus permisos. Solo la primera vez: después student_profiles ya es una vista.
do $$
declare
  c record;
begin
  if to_regclass('public.account_profiles') is null
     and exists (select 1 from pg_class where oid = to_regclass('public.student_profiles') and relkind = 'r') then
    alter table public.student_profiles rename to account_profiles;
  end if;
  -- Restricciones (y la clave primaria) con el nombre nuevo.
  if to_regclass('public.account_profiles') is not null then
    for c in
      select conname from pg_constraint
      where conrelid = 'public.account_profiles'::regclass and conname like 'student\_profiles\_%'
    loop
      execute format('alter table public.account_profiles rename constraint %I to %I',
        c.conname, 'account_profiles_' || substr(c.conname, length('student_profiles_') + 1));
    end loop;
  end if;
end;
$$;

create table if not exists public.account_profiles (
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
  constraint account_profiles_complete check (
    completed_at is null
    or (length(trim(full_name)) > 0 and country <> '' and time_zone <> '' and availability is not null)
  )
);

-- updated_at lo pone el servidor en cada cambio.
create or replace function public.cesi_account_profiles_touch()
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

revoke all on function public.cesi_account_profiles_touch() from public, anon, authenticated;

drop trigger if exists student_profiles_touch on public.account_profiles;
drop trigger if exists account_profiles_touch on public.account_profiles;
create trigger account_profiles_touch
  before insert or update on public.account_profiles
  for each row execute function public.cesi_account_profiles_touch();
drop function if exists public.cesi_student_profiles_touch();

-- RLS: cada cuenta (alumno, equipo o ceo), solo su fila; la ceo lee todas. Una cuenta pendiente,
-- ninguna. Nadie ve todavía el perfil de los demás (llegará con el calendario compartido). Nadie
-- la borra desde la app (se borra sola si se borra la cuenta).
alter table public.account_profiles enable row level security;
drop policy if exists "student_profiles: leer el mío (la ceo, todos)" on public.account_profiles;
drop policy if exists "student_profiles: crear el mío" on public.account_profiles;
drop policy if exists "student_profiles: editar el mío" on public.account_profiles;
drop policy if exists "account_profiles: leer el mío (la ceo, todos)" on public.account_profiles;
drop policy if exists "account_profiles: crear el mío" on public.account_profiles;
drop policy if exists "account_profiles: editar el mío" on public.account_profiles;
create policy "account_profiles: leer el mío (la ceo, todos)" on public.account_profiles
  for select to authenticated
  using ((id = (select auth.uid()) and (select public.my_role()) in ('alumno', 'equipo', 'ceo')) or (select public.is_ceo()));
create policy "account_profiles: crear el mío" on public.account_profiles
  for insert to authenticated
  with check (id = (select auth.uid()) and (select public.my_role()) in ('alumno', 'equipo', 'ceo'));
create policy "account_profiles: editar el mío" on public.account_profiles
  for update to authenticated
  using (id = (select auth.uid()) and (select public.my_role()) in ('alumno', 'equipo', 'ceo'))
  with check (id = (select auth.uid()) and (select public.my_role()) in ('alumno', 'equipo', 'ceo'));

revoke all on public.account_profiles from anon;
revoke all on public.account_profiles from authenticated;
grant select on public.account_profiles to authenticated;
grant insert (id, full_name, discord, country, time_zone, birthday, availability, completed_at) on public.account_profiles to authenticated;
grant update (full_name, discord, country, time_zone, birthday, availability, completed_at) on public.account_profiles to authenticated;

-- TEMPORAL: student_profiles como vista de account_profiles, para que la versión anterior de la
-- app siga leyendo y guardando mientras Vercel publica la nueva. security_invoker: se aplican las
-- reglas de acceso de account_profiles con la cuenta de quien consulta. Quitarla cuando la nueva
-- versión esté publicada (DROP VIEW al final de supabase/parte4_perfil_para_todos.sql).
create or replace view public.student_profiles
with (security_invoker = true)
as
  select id, full_name, discord, country, time_zone, birthday, availability, completed_at, created_at, updated_at
  from public.account_profiles;

revoke all on public.student_profiles from anon;
revoke all on public.student_profiles from authenticated;
grant select on public.student_profiles to authenticated;
grant insert (id, full_name, discord, country, time_zone, birthday, availability, completed_at) on public.student_profiles to authenticated;
grant update (full_name, discord, country, time_zone, birthday, availability, completed_at) on public.student_profiles to authenticated;

notify pgrst, 'reload schema';

-- Comprobación: account_profiles es una tabla con sus 3 políticas, student_profiles una vista
-- (security_invoker) con las mismas filas, y cuántos perfiles hay completos por papel.
select
  (select relkind from pg_class where oid = to_regclass('public.account_profiles')) = 'r' as account_profiles_es_tabla,
  (select count(*) from pg_policies where schemaname = 'public' and tablename = 'account_profiles') as politicas,
  (select relkind from pg_class where oid = to_regclass('public.student_profiles')) = 'v' as student_profiles_es_vista,
  (select coalesce(reloptions, '{}') @> array['security_invoker=true'] from pg_class where oid = to_regclass('public.student_profiles')) as vista_security_invoker,
  (select count(*) from public.account_profiles) as perfiles,
  (select count(*) from public.student_profiles) as perfiles_por_la_vista,
  (select string_agg(format('%s: %s de %s', r.role, r.completos, r.total), ' · ' order by r.role)
     from (select p.role, count(a.completed_at) as completos, count(*) as total
             from public.profiles p left join public.account_profiles a on a.id = p.id
            where p.role in ('alumno', 'equipo', 'ceo') group by p.role) r) as completos_por_papel;

-- -----------------------------------------------------------------------------
-- MÁS ADELANTE (cuando la versión nueva de la app ya esté publicada en Vercel):
-- quitar la vista temporal. No borra ningún dato (los perfiles están en account_profiles).
-- drop view if exists public.student_profiles;
-- notify pgrst, 'reload schema';
-- -----------------------------------------------------------------------------
