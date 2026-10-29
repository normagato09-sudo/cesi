-- =============================================================================
-- CIFA · Parte 1a: perfiles, papeles y accesos
-- =============================================================================
-- Ejecutar en Supabase → SQL Editor (proyecto fvswxhfjclvadcoyuqyu).
--
-- ANTES DE EJECUTAR: cambia TU_CORREO_AQUI por el correo con el que entras en la app (sale dos
-- veces: en la comprobación de justo debajo y en el update del final; con Edición → Reemplazar
-- → «Reemplazar todo» se cambian las dos). Esa cuenta queda como 'ceo'. Si el correo no es de
-- ninguna cuenta, el script se para al principio sin cambiar nada.
--
-- Qué hace:
--   · public.profiles: un perfil por cuenta (email, nombre, papel y a quién está unida).
--   · Al crearse una cuenta en auth.users se crea su perfil con papel 'pendiente'; también se
--     crea el de las cuentas que ya existen y no lo tienen.
--   · public.is_ceo(): ¿la cuenta actual es ceo? (para las políticas).
--   · RLS de profiles: cada cuenta lee su perfil; solo la ceo lee todos y cambia papeles y
--     enlaces. Nadie puede cambiarse su propio papel.
-- Las tablas que ya había NO cambian: siguen con "cada usuario solo ve lo suyo" y todas sus
-- filas son de la cuenta ceo, así que equipo, alumno y pendiente no ven nada de ellas.
-- No borra datos y se puede ejecutar más de una vez (no vuelve a cambiar los papeles que ya
-- hayas puesto en Accesos).

-- Comprobación: el correo tiene que ser de una cuenta que exista.
do $$
declare
  v_email text := lower(trim('TU_CORREO_AQUI'));
begin
  if v_email = '' or v_email = lower('TU_CORREO' || '_AQUI') then
    raise exception 'Cambia TU_CORREO_AQUI por tu correo (en la comprobación y en el update del final) y vuelve a ejecutar.';
  end if;
  if not exists (select 1 from auth.users where lower(email) = v_email) then
    raise exception 'No hay ninguna cuenta con el correo %. Revisa el correo y vuelve a ejecutar.', v_email;
  end if;
end;
$$;

-- ---------------------------------------------------------------------------
-- Perfiles
-- ---------------------------------------------------------------------------
--   id                 la cuenta (auth.users.id)
--   email              el de la cuenta al crearse el perfil
--   display_name       nombre (el de la cuenta, si lo trae; si no, vacío)
--   role               'ceo' | 'equipo' | 'alumno' | 'pendiente' (por defecto 'pendiente')
--   linked_team_id     persona de Equipo a la que está unida: id del contacto (contacts.id,
--                      con teamProfile) de la cuenta ceo, o null
--   linked_student_id  alumno al que está unida: id del alumno (students.id) de la cuenta ceo,
--                      o null
-- Los enlaces no llevan clave foránea: contacts y students tienen como clave (user_id, id).
create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  email text not null default '',
  display_name text not null default '' check (length(display_name) <= 120),
  role text not null default 'pendiente' check (role in ('ceo', 'equipo', 'alumno', 'pendiente')),
  linked_team_id text check (linked_team_id is null or length(linked_team_id) between 1 and 200),
  linked_student_id text check (linked_student_id is null or length(linked_student_id) between 1 and 200),
  created_at timestamptz not null default now()
);

-- ¿La cuenta actual es ceo? security definer: lee profiles sin pasar por su RLS (así las
-- políticas de profiles pueden usarla sin recursión).
create or replace function public.is_ceo()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.profiles where id = (select auth.uid()) and role = 'ceo'
  );
$$;

revoke all on function public.is_ceo() from public, anon;
grant execute on function public.is_ceo() to authenticated;

-- Perfil de cada cuenta nueva, con papel 'pendiente'.
create or replace function public.cesi_handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, email, display_name, role)
  values (
    new.id,
    coalesce(new.email, ''),
    left(coalesce(new.raw_user_meta_data ->> 'full_name', new.raw_user_meta_data ->> 'name', ''), 120),
    'pendiente'
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

revoke all on function public.cesi_handle_new_user() from public, anon, authenticated;

drop trigger if exists cesi_on_auth_user_created on auth.users;
create trigger cesi_on_auth_user_created
  after insert on auth.users
  for each row execute function public.cesi_handle_new_user();

-- Nadie puede cambiarse su propio papel (tampoco la ceo quitárselo). Desde el SQL Editor no
-- hay cuenta (auth.uid() es null), así que ahí sí se puede.
create or replace function public.cesi_profiles_guard()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if old.id = (select auth.uid()) and new.role is distinct from old.role then
    raise exception 'No puedes cambiar tu propio papel.' using errcode = '42501';
  end if;
  return new;
end;
$$;

revoke all on function public.cesi_profiles_guard() from public, anon, authenticated;

drop trigger if exists profiles_guard on public.profiles;
create trigger profiles_guard
  before update on public.profiles
  for each row execute function public.cesi_profiles_guard();

-- Perfiles de las cuentas que ya existen (no toca los que ya hay).
insert into public.profiles (id, email, display_name, role)
select
  u.id,
  coalesce(u.email, ''),
  left(coalesce(u.raw_user_meta_data ->> 'full_name', u.raw_user_meta_data ->> 'name', ''), 120),
  'pendiente'
from auth.users u
on conflict (id) do nothing;

-- RLS: cada cuenta lee su perfil; la ceo lee todos y es la única que los cambia.
-- Los perfiles solo los crea el trigger y no se borran desde la app.
alter table public.profiles enable row level security;
drop policy if exists "profiles: leer el mío (la ceo, todos)" on public.profiles;
drop policy if exists "profiles: cambiar (solo la ceo)" on public.profiles;
create policy "profiles: leer el mío (la ceo, todos)" on public.profiles
  for select to authenticated using (id = (select auth.uid()) or (select public.is_ceo()));
create policy "profiles: cambiar (solo la ceo)" on public.profiles
  for update to authenticated using ((select public.is_ceo())) with check ((select public.is_ceo()));

revoke all on public.profiles from anon;
revoke insert, update, delete on public.profiles from authenticated;
grant select on public.profiles to authenticated;
grant update (display_name, role, linked_team_id, linked_student_id) on public.profiles to authenticated;

-- Tu cuenta, ceo (el mismo correo que en la comprobación del principio).
update public.profiles p
set role = 'ceo'
from auth.users u
where u.id = p.id
  and lower(u.email) = lower(trim('TU_CORREO_AQUI'))
  and p.role <> 'ceo';

-- Tiene que haber una ceo: si no, la app no te dejaría entrar.
do $$
begin
  if not exists (select 1 from public.profiles where role = 'ceo') then
    raise exception 'No ha quedado ninguna cuenta como ceo: revisa el correo del update del final y vuelve a ejecutar.';
  end if;
end;
$$;

-- Que la API vea la tabla nueva enseguida.
notify pgrst, 'reload schema';

-- Comprobación: debería salir tu cuenta con role = 'ceo'.
select email, role, created_at from public.profiles order by created_at;
