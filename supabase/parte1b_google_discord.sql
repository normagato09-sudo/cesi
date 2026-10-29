-- =============================================================================
-- CIFA · Parte 1b: entrar con Google y con Discord
-- =============================================================================
-- Ejecutar en Supabase → SQL Editor (proyecto fvswxhfjclvadcoyuqyu), después de la parte 1a
-- (supabase/parte1a_cuentas_papeles.sql).
--
-- Qué hace:
--   · profiles.auth_provider: con qué se registró la cuenta ('email', 'google' o 'discord').
--   · profiles.discord_username: su nombre de usuario de Discord (solo cuentas de Discord).
--   · El perfil de cada cuenta nueva toma el nombre que venga de Google o Discord.
--   · Rellena lo mismo en los perfiles que ya hay (el nombre solo si está vacío).
-- No hace falta cambiar nada a mano, no borra datos y se puede ejecutar más de una vez.

alter table public.profiles add column if not exists auth_provider text not null default ''
  check (length(auth_provider) <= 40);
alter table public.profiles add column if not exists discord_username text
  check (discord_username is null or length(discord_username) <= 100);

-- Nombre de una cuenta según lo que manda Google o Discord (vacío si no manda ninguno).
-- Discord: global_name (el nombre visible) o, si no, el nombre de usuario.
create or replace function public.cesi_auth_display_name(p_meta jsonb)
returns text
language sql
immutable
set search_path = ''
as $$
  select left(coalesce(
    nullif(trim(p_meta -> 'custom_claims' ->> 'global_name'), ''),
    nullif(trim(p_meta ->> 'global_name'), ''),
    nullif(trim(p_meta ->> 'full_name'), ''),
    nullif(trim(regexp_replace(coalesce(p_meta ->> 'name', ''), '#0+$', '')), ''),
    nullif(trim(p_meta ->> 'user_name'), ''),
    nullif(trim(p_meta ->> 'preferred_username'), ''),
    ''
  ), 120);
$$;

-- Nombre de usuario de Discord (null si la cuenta no es de Discord).
create or replace function public.cesi_discord_username(p_provider text, p_meta jsonb)
returns text
language sql
immutable
set search_path = ''
as $$
  select case when p_provider = 'discord' then left(coalesce(
    nullif(trim(p_meta ->> 'user_name'), ''),
    nullif(trim(p_meta ->> 'preferred_username'), ''),
    nullif(trim(regexp_replace(coalesce(p_meta ->> 'name', ''), '#0+$', '')), ''),
    nullif(trim(p_meta ->> 'full_name'), '')
  ), 100) end;
$$;

revoke all on function public.cesi_auth_display_name(jsonb) from public, anon, authenticated;
revoke all on function public.cesi_discord_username(text, jsonb) from public, anon, authenticated;

-- Perfil de cada cuenta nueva (correo, Google o Discord), con papel 'pendiente'.
create or replace function public.cesi_handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_provider text := coalesce(new.raw_app_meta_data ->> 'provider', 'email');
  v_meta jsonb := coalesce(new.raw_user_meta_data, '{}'::jsonb);
begin
  insert into public.profiles (id, email, display_name, role, auth_provider, discord_username)
  values (
    new.id,
    coalesce(new.email, ''),
    public.cesi_auth_display_name(v_meta),
    'pendiente',
    left(v_provider, 40),
    public.cesi_discord_username(v_provider, v_meta)
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

revoke all on function public.cesi_handle_new_user() from public, anon, authenticated;

-- El trigger ya existe desde la parte 1a; se vuelve a crear igual por si acaso.
drop trigger if exists cesi_on_auth_user_created on auth.users;
create trigger cesi_on_auth_user_created
  after insert on auth.users
  for each row execute function public.cesi_handle_new_user();

-- Perfiles que ya hay: proveedor, usuario de Discord y nombre (solo si está vacío). No toca papeles
-- ni enlaces.
update public.profiles p
set
  auth_provider = left(coalesce(u.raw_app_meta_data ->> 'provider', 'email'), 40),
  discord_username = coalesce(
    p.discord_username,
    public.cesi_discord_username(coalesce(u.raw_app_meta_data ->> 'provider', 'email'), coalesce(u.raw_user_meta_data, '{}'::jsonb))
  ),
  display_name = case
    when trim(p.display_name) = '' then public.cesi_auth_display_name(coalesce(u.raw_user_meta_data, '{}'::jsonb))
    else p.display_name
  end
from auth.users u
where u.id = p.id
  and (p.auth_provider = '' or (p.discord_username is null and u.raw_app_meta_data ->> 'provider' = 'discord') or trim(p.display_name) = '');

-- Que la API vea las columnas nuevas enseguida.
notify pgrst, 'reload schema';

-- Comprobación.
select email, display_name, role, auth_provider, discord_username from public.profiles order by created_at;
