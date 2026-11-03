-- =============================================================================
-- CIFA · Parte 28: sin Vacantes, puesto en Directivo y Organigrama
-- =============================================================================
-- Ejecutar en Supabase → SQL Editor (proyecto fvswxhfjclvadcoyuqyu), después de la parte 27
-- (supabase/parte27_directivo_sin_areas.sql). Se puede ejecutar más de una vez. No borra datos:
-- la tabla de vacantes y los candidatos se quedan como están.
--
-- Qué hace:
--   · Vacantes deja de verse: el permiso 'vacantes' pasa a 'none' en todas las áreas y en los
--     permisos propios de cada persona.
--   · profiles.direction_role: el puesto de las personas de Directivo ('director', 'subdirector',
--     'secretario' o 'coordinador'; null si no tiene). Solo lo cambia la ceo (como el área).
--   · cesi_org_chart(): las cuentas de la ceo y del equipo con su nombre, área, puesto, zona
--     horaria, desde cuándo son de equipo y sus horas fichadas este mes. La pueden leer la ceo y el
--     equipo (los alumnos no). Las horas de los demás solo llegan a la ceo y a Directivo; cada
--     persona ve las suyas. El jefe de cada uno se calcula en la app: Director → las áreas (menos
--     Profesor); Coordinador → los profesores; el equipo directivo → la ceo.

do $$
begin
  if to_regprocedure('public.cesi_screen_data(text, uuid, text)') is null
     or not exists (select 1 from public.area_permissions where area = 'direccion' and screen = 'vacantes' and level = 'none') then
    raise exception 'Falta la parte 27 (supabase/parte27_directivo_sin_areas.sql): ejecútala antes.';
  end if;
end;
$$;

-- -----------------------------------------------------------------------------
-- Vacantes: sin permiso para nadie del equipo
-- -----------------------------------------------------------------------------
insert into public.area_permissions (area, screen, level)
select a.id, 'vacantes', 'none' from public.areas a
on conflict (area, screen) do update set level = excluded.level;

update public.profile_permissions set level = 'none' where screen = 'vacantes' and level <> 'none';

-- -----------------------------------------------------------------------------
-- Puesto dentro de Directivo
-- -----------------------------------------------------------------------------
alter table public.profiles add column if not exists direction_role text;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'profiles_direction_role_check') then
    alter table public.profiles add constraint profiles_direction_role_check
      check (direction_role is null or direction_role in ('director', 'subdirector', 'secretario', 'coordinador'));
  end if;
end;
$$;

-- Solo la ceo cambia las cuentas (política «profiles: cambiar (solo la ceo)»); esta columna, como
-- las demás que ya se pueden cambiar.
grant update (direction_role) on public.profiles to authenticated;

-- -----------------------------------------------------------------------------
-- Organigrama
-- -----------------------------------------------------------------------------
create or replace function public.cesi_org_chart()
returns table (
  id uuid, name text, role text, area text, direction_role text,
  time_zone text, member_since timestamptz, month_minutes integer, linked_team_id text
)
language plpgsql
stable
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  v_me uuid := (select auth.uid());
  v_role text;
  v_area text;
  v_all_hours boolean;
  v_month timestamptz;
begin
  select p.role, p.area into v_role, v_area from public.profiles p where p.id = v_me;
  if v_role is null or v_role not in ('ceo', 'equipo') then
    raise exception 'Sin permiso.' using errcode = '42501';
  end if;
  v_all_hours := v_role = 'ceo' or v_area = 'direccion';
  v_month := date_trunc('month', now() at time zone public.cesi_zone_of(v_me)) at time zone public.cesi_zone_of(v_me);
  return query
    select p.id,
      public.cesi_person_name(p.id),
      p.role,
      case when p.role = 'equipo' then p.area end,
      case when p.role = 'equipo' and p.area = 'direccion' then p.direction_role end,
      public.cesi_zone_of(p.id),
      case when p.role = 'equipo' then coalesce(p.role_set_at, p.created_at) end,
      case when v_all_hours or p.id = v_me then (
        select coalesce(sum(extract(epoch from (ce.clock_out - ce.clock_in)) / 60), 0)::integer
        from public.clock_entries ce
        where ce.profile_id = p.id and ce.clock_out is not null and ce.clock_in >= v_month
      ) end,
      -- La ficha de Equipo solo le sirve a quien puede abrirla (la app decide si sale el botón).
      p.linked_team_id
    from public.profiles p
    where p.role in ('ceo', 'equipo')
    order by 2;
end;
$$;

revoke all on function public.cesi_org_chart() from public, anon;
grant execute on function public.cesi_org_chart() to authenticated;

notify pgrst, 'reload schema';

-- Comprobación: ninguna área con vacantes (0), la columna del puesto (true), la función con
-- permiso (true) y cuántas personas de Directivo tienen ya puesto.
select
  (select count(*) from public.area_permissions where screen = 'vacantes' and level <> 'none') as areas_con_vacantes,
  exists (select 1 from information_schema.columns
          where table_schema = 'public' and table_name = 'profiles' and column_name = 'direction_role') as columna_puesto,
  has_function_privilege('authenticated', 'public.cesi_org_chart()', 'execute') as organigrama,
  (select count(*) from public.profiles where role = 'equipo' and area = 'direccion' and direction_role is not null) as directivos_con_puesto;
