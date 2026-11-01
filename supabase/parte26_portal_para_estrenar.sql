-- =============================================================================
-- CIFA · Parte 26: portal listo para estrenar (fase de alumnos, paso 1b)
-- =============================================================================
-- Ejecutar en Supabase → SQL Editor (proyecto fvswxhfjclvadcoyuqyu), después de la parte 25
-- (supabase/parte25_cursos_e_inscripciones.sql). Se puede ejecutar más de una vez. No borra ni
-- cambia datos ni tablas.
--
-- Qué hace:
--   · Las cuentas nuevas (correo, Google o Discord) entran como «alumno» en vez de «pendiente»,
--     con la fecha de alta en role_set_at (así salen en «Alumnos nuevos» del Inicio de la ceo).
--     Vuelve a escribir cesi_handle_new_user (de la parte 1b), igual que antes salvo el papel.
--   · Las cuentas que ya existen no cambian: las pendientes siguen pendientes.
--   · Si entra alguien del equipo, entra como alumno y la ceo le cambia el papel a «Equipo» en
--     Accesos (no se pierde nada: su perfil sigue igual).

do $$
begin
  if to_regprocedure('public.cesi_student_course_list()') is null then
    raise exception 'Falta la parte 25 (supabase/parte25_cursos_e_inscripciones.sql): ejecútala antes.';
  end if;
  if to_regprocedure('public.cesi_auth_display_name(jsonb)') is null
     or not exists (select 1 from information_schema.columns
                    where table_schema = 'public' and table_name = 'profiles' and column_name = 'role_set_at') then
    raise exception 'Faltan las partes 1b y 12: ejecútalas antes.';
  end if;
end;
$$;

-- Perfil de cada cuenta nueva (correo, Google o Discord), con papel 'alumno'.
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
  insert into public.profiles (id, email, display_name, role, auth_provider, discord_username, role_set_at)
  values (
    new.id,
    coalesce(new.email, ''),
    public.cesi_auth_display_name(v_meta),
    'alumno',
    left(v_provider, 40),
    public.cesi_discord_username(v_provider, v_meta),
    now()
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

notify pgrst, 'reload schema';

-- Comprobación: la función pone 'alumno' (true), el trigger está (true), nadie puede llamarla
-- (false) y cuántas cuentas hay de cada papel (las que ya existían no cambian).
select
  position('''alumno''' in pg_get_functiondef('public.cesi_handle_new_user()'::regprocedure)) > 0 as altas_como_alumno,
  exists (select 1 from pg_trigger where tgname = 'cesi_on_auth_user_created' and not tgisinternal) as trigger_activo,
  has_function_privilege('authenticated', 'public.cesi_handle_new_user()', 'execute') as llamable,
  (select string_agg(role || ': ' || n, ', ' order by role)
     from (select role, count(*) as n from public.profiles group by role) r) as cuentas_por_papel;
