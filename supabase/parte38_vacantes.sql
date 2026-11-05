-- =============================================================================
-- CIFA · Parte 38: vuelve Vacantes (solo la ceo, Directivo y RRHH)
-- =============================================================================
-- Ejecutar en Supabase → SQL Editor (proyecto fvswxhfjclvadcoyuqyu), después de la parte 37
-- (supabase/parte37_mensajes_alumnos.sql). Se puede ejecutar más de una vez. No borra datos ni
-- tablas ni cambia funciones de antes: solo añade.
--
-- Reutiliza la tabla que ya existe, public.vacancies (la de la ceo, que se sincroniza con su app):
-- cada vacante va entera en `data` (como los cursos), ahora con estos campos:
--   title, area (Directivo, Profesor, Alianzas, RRHH, Finanzas, Legal, Media, Técnico,
--   Ciberseguridad, Moderación), description, requirements, hoursPerWeek (texto, p. ej. «3-5 h»),
--   seats (plazas, número), status ('abierta' | 'en_pausa' | 'cerrada'; las antiguas 'open' e
--   'in_progress' se leen como abierta y 'filled' como cerrada), openedAt (publicación,
--   'AAAA-MM-DD'), closesAt (cierre, opcional), internalNotes, createdBy (nombre de quien la
--   creó), createdAt y updatedAt. Lo demás que ya tuviera cada vacante se conserva.
--
-- Quién: la ceo (con su app, como siempre) y las personas de equipo de Directivo o RRHH (con estas
-- funciones, que lo comprueban). Nadie más las puede ni leer: la tabla sigue cerrada para todos los
-- demás (sus reglas de la parte 2 no cambian) y estas funciones rechazan a cualquier otra cuenta.
-- Cada cambio de Directivo o RRHH le llega a la ceo como de otro dispositivo suyo y queda en
-- «Cambios del equipo».

do $$
begin
  if to_regprocedure('public.cesi_chat_report(uuid, text)') is null then
    raise exception 'Falta la parte 37 (supabase/parte37_mensajes_alumnos.sql): ejecútala antes.';
  end if;
  if to_regclass('public.vacancies') is null or to_regclass('public.team_edit_log') is null then
    raise exception 'Faltan las partes 2 y 20: ejecútalas antes.';
  end if;
end;
$$;

-- -----------------------------------------------------------------------------
-- Ayudas
-- -----------------------------------------------------------------------------

-- ¿Puede `p_profile` ver y cambiar las vacantes? (la ceo, Directivo y RRHH)
create or replace function public.cesi_vacancy_access(p_profile uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.profiles
    where id = p_profile and (role = 'ceo' or (role = 'equipo' and area in ('direccion', 'personas')))
  );
$$;

-- La cuenta actual si puede usar Vacantes; si no, error.
create or replace function public.cesi_vacancy_me()
returns uuid
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_me uuid := (select auth.uid());
begin
  if not public.cesi_vacancy_access(v_me) then
    raise exception 'No tienes acceso a Vacantes.' using errcode = '42501';
  end if;
  return v_me;
end;
$$;

revoke all on function public.cesi_vacancy_access(uuid) from public, anon, authenticated;
revoke all on function public.cesi_vacancy_me() from public, anon, authenticated;

-- -----------------------------------------------------------------------------
-- Leer
-- -----------------------------------------------------------------------------

-- Las vacantes (de la ceo), sin las borradas.
create or replace function public.cesi_vacancies_list()
returns table (id text, data jsonb, updated_at timestamptz)
language plpgsql
stable
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  v_me uuid := public.cesi_vacancy_me();
begin
  return query
    select v.id, v.data, v.updated_at
    from public.vacancies v
    where v.deleted_at is null and v.user_id in (select p.id from public.profiles p where p.role = 'ceo')
    order by v.updated_at desc;
end;
$$;

-- -----------------------------------------------------------------------------
-- Escribir
-- -----------------------------------------------------------------------------

-- Crea (p_id null) o cambia una vacante con los campos de p_data (los que no vienen se quedan como
-- estaban). Devuelve la vacante guardada.
create or replace function public.cesi_vacancy_save(p_id text, p_data jsonb)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_me uuid := public.cesi_vacancy_me();
  v_ceo uuid;
  v_id text := p_id;
  v_old jsonb;
  v_old_stamp timestamptz;
  v_patch jsonb := coalesce(p_data, '{}'::jsonb);
  v_title text := trim(coalesce(p_data ->> 'title', ''));
  v_status text := coalesce(p_data ->> 'status', 'abierta');
  v_stamp timestamptz;
  v_data jsonb;
begin
  if jsonb_typeof(v_patch) <> 'object' then
    raise exception 'Datos no válidos.' using errcode = '22023';
  end if;
  if length(v_title) = 0 or length(v_title) > 120 then
    raise exception 'Escribe el título (como mucho 120 caracteres).' using errcode = '22023';
  end if;
  if v_status not in ('abierta', 'en_pausa', 'cerrada') then
    raise exception 'Estado no válido.' using errcode = '22023';
  end if;
  if coalesce(p_data ->> 'area', '') not in ('Directivo', 'Profesor', 'Alianzas', 'RRHH', 'Finanzas', 'Legal', 'Media', 'Técnico', 'Ciberseguridad', 'Moderación') then
    raise exception 'Elige el área.' using errcode = '22023';
  end if;
  if p_data ? 'seats' and p_data -> 'seats' <> 'null'::jsonb
     and not (jsonb_typeof(p_data -> 'seats') = 'number' and (p_data ->> 'seats')::numeric between 1 and 1000) then
    raise exception 'Las plazas van de 1 a 1000.' using errcode = '22023';
  end if;
  if coalesce(p_data ->> 'openedAt', '') !~ '^\d{4}-\d{2}-\d{2}$' then
    raise exception 'Pon la fecha de publicación.' using errcode = '22023';
  end if;
  if coalesce(p_data ->> 'closesAt', '') <> '' and (p_data ->> 'closesAt' !~ '^\d{4}-\d{2}-\d{2}$' or p_data ->> 'closesAt' < p_data ->> 'openedAt') then
    raise exception 'La fecha de cierre tiene que ser posterior a la de publicación.' using errcode = '22023';
  end if;
  if length(coalesce(p_data ->> 'description', '')) > 4000 or length(coalesce(p_data ->> 'requirements', '')) > 4000
     or length(coalesce(p_data ->> 'internalNotes', '')) > 4000 or length(coalesce(p_data ->> 'hoursPerWeek', '')) > 40 then
    raise exception 'Algún dato es demasiado largo.' using errcode = '22023';
  end if;
  -- Nunca se cambian por aquí el id ni las fechas de la ficha.
  v_patch := v_patch - 'id' - 'createdAt' - 'updatedAt' - 'createdBy';

  select id into v_ceo from public.profiles where role = 'ceo' order by created_at limit 1;
  if v_ceo is null then
    raise exception 'No hay cuenta de la dirección.' using errcode = '22023';
  end if;
  if v_id is null then
    v_id := 'vac_' || replace(gen_random_uuid()::text, '-', '');
    v_old := jsonb_build_object('createdAt', public.cesi_iso(clock_timestamp()), 'createdBy', public.cesi_person_name(v_me));
  else
    select v.data, v.updated_at into v_old, v_old_stamp
    from public.vacancies v
    where v.user_id = v_ceo and v.id = v_id and v.deleted_at is null
    for update;
    if v_old is null then
      raise exception 'Esa vacante ya no existe.' using errcode = '22023';
    end if;
  end if;

  -- Más reciente que lo que tenga la ceo: le llega como un cambio de otro dispositivo suyo.
  v_stamp := greatest(clock_timestamp(), coalesce(v_old_stamp + interval '1 millisecond', '-infinity'));
  v_data := v_old || v_patch || jsonb_build_object('id', v_id, 'updatedAt', public.cesi_iso(v_stamp));
  insert into public.vacancies (user_id, id, data, updated_at, deleted_at)
  values (v_ceo, v_id, v_data, v_stamp, null)
  on conflict (user_id, id) do update set data = excluded.data, updated_at = excluded.updated_at, deleted_at = null;

  if not public.is_ceo() then
    insert into public.team_edit_log (who, who_name, who_area, doc_table, doc_id, doc_name, action, before, after)
    values (v_me, public.cesi_person_name(v_me), (select area from public.profiles where id = v_me), 'vacancies', v_id,
      left(v_title, 200), case when p_id is null then 'alta' else 'edicion' end,
      case when p_id is null then null else v_old end, v_data);
  end if;
  return v_data;
end;
$$;

-- Borra una vacante (como la ceo al borrarla en su app: queda marcada como borrada y se
-- sincroniza; no se toca nada más).
create or replace function public.cesi_vacancy_delete(p_id text)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_me uuid := public.cesi_vacancy_me();
  v_old jsonb;
  v_old_stamp timestamptz;
  v_ceo uuid;
begin
  select id into v_ceo from public.profiles where role = 'ceo' order by created_at limit 1;
  select v.data, v.updated_at into v_old, v_old_stamp
  from public.vacancies v
  where v.user_id = v_ceo and v.id = p_id and v.deleted_at is null
  for update;
  if v_old is null then
    raise exception 'Esa vacante ya no existe.' using errcode = '22023';
  end if;
  update public.vacancies v
  set deleted_at = greatest(clock_timestamp(), v_old_stamp + interval '1 millisecond'),
    updated_at = greatest(clock_timestamp(), v_old_stamp + interval '1 millisecond')
  where v.user_id = v_ceo and v.id = p_id;
  if not public.is_ceo() then
    insert into public.team_edit_log (who, who_name, who_area, doc_table, doc_id, doc_name, action, before, after)
    values (v_me, public.cesi_person_name(v_me), (select area from public.profiles where id = v_me), 'vacancies', p_id,
      left(coalesce(v_old ->> 'title', ''), 200), 'baja', v_old, null);
  end if;
end;
$$;

revoke all on function public.cesi_vacancies_list() from public, anon;
revoke all on function public.cesi_vacancy_save(text, jsonb) from public, anon;
revoke all on function public.cesi_vacancy_delete(text) from public, anon;
grant execute on function public.cesi_vacancies_list() to authenticated;
grant execute on function public.cesi_vacancy_save(text, jsonb) to authenticated;
grant execute on function public.cesi_vacancy_delete(text) to authenticated;

notify pgrst, 'reload schema';

-- Comprobación: las 3 funciones con permiso (3), las ayudas sin él (0), la tabla sigue cerrada para
-- el resto (sus reglas siguen pidiendo ser la ceo: true) y cuántas vacantes hay.
select
  (select count(*) from unnest(array[
     'public.cesi_vacancies_list()', 'public.cesi_vacancy_save(text, jsonb)', 'public.cesi_vacancy_delete(text)'
   ]) as f (sig) where has_function_privilege('authenticated', f.sig, 'execute')) as funciones_con_permiso,
  (select count(*) from unnest(array['public.cesi_vacancy_access(uuid)', 'public.cesi_vacancy_me()']) as f (sig)
     where has_function_privilege('authenticated', f.sig, 'execute')) as ayudas_con_permiso,
  not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'vacancies' and coalesce(qual, with_check, '') not like '%is_ceo%') as tabla_solo_ceo,
  (select count(*) from public.vacancies where deleted_at is null) as vacantes;
