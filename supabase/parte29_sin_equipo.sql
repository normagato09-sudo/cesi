-- =============================================================================
-- CIFA · Parte 29: sin la pantalla Equipo
-- =============================================================================
-- Ejecutar en Supabase → SQL Editor (proyecto fvswxhfjclvadcoyuqyu), después de la parte 28
-- (supabase/parte28_organigrama.sql). Se puede ejecutar más de una vez. No borra datos ni tablas:
-- las fichas de Equipo (contacts con teamProfile) y las vacantes se quedan como están.
--
-- Qué hace:
--   · El permiso 'equipo' pasa a 'none' en todas las áreas y en los permisos propios de cada
--     persona (como 'vacantes' en la parte 28).
--   · cesi_ceo_doc_patch: igual que en la parte 20, pero RRHH ya no puede cambiar fichas de Equipo
--     ni vacantes (eran las pantallas Equipo y Vacantes, que ya no existen). Directivo sigue
--     gestionando Cursos igual.
--
-- No toca a la ceo: la ceo no usa area_permissions ni profile_permissions (siempre puede todo) y
-- cesi_ceo_doc_patch es solo para el equipo (la ceo guarda sus datos directamente).
-- No toca Accesos: no cambia la tabla profiles (papel, área, puesto, «Unida a») ni sus permisos.

do $$
begin
  if to_regprocedure('public.cesi_org_chart()') is null then
    raise exception 'Falta la parte 28 (supabase/parte28_organigrama.sql): ejecútala antes.';
  end if;
  if to_regprocedure('public.cesi_ceo_doc_patch(text, text, jsonb, jsonb, boolean)') is null then
    raise exception 'Falta la parte 20 (supabase/parte20_editar_segun_permisos.sql): ejecútala antes.';
  end if;
end;
$$;

-- -----------------------------------------------------------------------------
-- Equipo: sin permiso para nadie del equipo
-- -----------------------------------------------------------------------------
insert into public.area_permissions (area, screen, level)
select a.id, 'equipo', 'none' from public.areas a
on conflict (area, screen) do update set level = excluded.level;

update public.profile_permissions set level = 'none' where screen = 'equipo' and level <> 'none';

-- -----------------------------------------------------------------------------
-- Cambios del equipo en los datos de la ceo: sin RRHH
-- -----------------------------------------------------------------------------
create or replace function public.cesi_ceo_doc_patch(p_table text, p_id text, p_patch jsonb, p_before jsonb, p_create boolean default false)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_me uuid := (select auth.uid());
  v_area text;
  v_ceo uuid;
  v_old jsonb;
  v_stamp_old timestamptz;
  v_new jsonb;
  v_stamp timestamptz;
  v_key text;
  v_changed jsonb := '{}'::jsonb;
  v_was jsonb := '{}'::jsonb;
  v_patch jsonb := coalesce(p_patch, '{}'::jsonb);
  v_before jsonb := coalesce(p_before, '{}'::jsonb);
  v_rrhh boolean;
  v_dir boolean;
begin
  select area into v_area from public.profiles where id = v_me and role = 'equipo';
  -- RRHH ya no cambia fichas de Equipo ni vacantes (parte 29).
  v_rrhh := false;
  v_dir := v_area = 'direccion';
  if p_table is null or p_table not in ('contacts', 'vacancies', 'courses', 'students', 'extra_classes') then
    raise exception 'Tabla no válida.' using errcode = '22023';
  end if;
  if not coalesce(case p_table
      when 'contacts' then v_rrhh
      when 'vacancies' then v_rrhh
      else v_dir
    end, false) then
    raise exception 'No tienes permiso para cambiar estos datos.' using errcode = '42501';
  end if;
  if p_id is null or length(p_id) not between 1 and 200 or jsonb_typeof(v_patch) <> 'object' or v_patch = '{}'::jsonb then
    raise exception 'Cambio no válido.' using errcode = '22023';
  end if;
  if v_patch ?| array['id', 'createdAt', 'updatedAt'] then
    raise exception 'Cambio no válido.' using errcode = '22023';
  end if;

  -- Qué campos puede tocar cada uno.
  if p_table = 'contacts' and v_patch ?| array['photo', 'alliance', 'external'] then
    raise exception 'RRHH no puede cambiar la foto ni la alianza de un contacto.' using errcode = '42501';
  end if;
  if p_table = 'students' and (select count(*) from jsonb_object_keys(v_patch) k where k <> 'courseIds') > 0 then
    raise exception 'De los alumnos solo se pueden cambiar sus cursos.' using errcode = '42501';
  end if;
  if p_table = 'students' and p_create then
    raise exception 'Directivo no puede crear alumnos.' using errcode = '42501';
  end if;
  if p_table = 'extra_classes' and not p_create then
    raise exception 'Directivo solo puede crear clases sueltas.' using errcode = '42501';
  end if;

  select id into v_ceo from public.profiles where role = 'ceo' order by created_at limit 1;
  if v_ceo is null then
    raise exception 'No hay cuenta de la dirección.' using errcode = '22023';
  end if;
  execute format('select data, updated_at from public.%I where user_id = $1 and id = $2 and deleted_at is null for update', p_table)
    into v_old, v_stamp_old using v_ceo, p_id;

  if p_create then
    if v_old is not null then
      raise exception 'Ya existe.' using errcode = '22023';
    end if;
    v_old := jsonb_build_object('createdAt', public.cesi_iso(clock_timestamp()));
  elsif v_old is null then
    raise exception 'Esa ficha ya no existe.' using errcode = '22023';
  else
    -- Si alguno de los campos ya no está como estaba al abrir la ficha, no se guarda nada.
    for v_key in select jsonb_object_keys(v_patch) loop
      if coalesce(v_old -> v_key, 'null'::jsonb) is distinct from coalesce(v_before -> v_key, 'null'::jsonb) then
        raise exception 'Esta ficha ha cambiado mientras la editabas; vuelve a cargarla.' using errcode = '40001';
      end if;
    end loop;
  end if;

  -- Contactos (RRHH): solo fichas de equipo o de candidatos (antes y después).
  if p_table = 'contacts' then
    if not p_create and not (
      (jsonb_typeof(v_old -> 'teamProfile') = 'object')
      or (jsonb_typeof(v_old -> 'candidacies') = 'array' and jsonb_array_length(v_old -> 'candidacies') > 0)
    ) then
      raise exception 'RRHH solo puede cambiar fichas de equipo y de candidatos.' using errcode = '42501';
    end if;
    if p_create and not (jsonb_typeof(v_patch -> 'candidacies') = 'array' and jsonb_array_length(v_patch -> 'candidacies') > 0) then
      raise exception 'RRHH solo puede crear candidatos.' using errcode = '42501';
    end if;
  end if;
  -- Clase suelta: de un curso que existe.
  if p_table = 'extra_classes' and not exists (
    select 1 from public.courses co where co.user_id = v_ceo and co.id = v_patch ->> 'courseId' and co.deleted_at is null
  ) then
    raise exception 'Ese curso no existe.' using errcode = '22023';
  end if;
  -- Inscripciones: solo en cursos que existen.
  if p_table = 'students' and jsonb_typeof(v_patch -> 'courseIds') <> 'array' then
    raise exception 'Cursos no válidos.' using errcode = '22023';
  end if;
  if p_table = 'students' and exists (
    select 1 from jsonb_array_elements_text(v_patch -> 'courseIds') x
    where not exists (select 1 from public.courses co where co.user_id = v_ceo and co.id = x and co.deleted_at is null)
      and not ((v_old -> 'courseIds') ? x)
  ) then
    raise exception 'Alguno de esos cursos no existe.' using errcode = '22023';
  end if;

  -- Los campos que de verdad cambian (para el registro).
  for v_key in select jsonb_object_keys(v_patch) loop
    if coalesce(v_old -> v_key, 'null'::jsonb) is distinct from (v_patch -> v_key) then
      v_changed := v_changed || jsonb_build_object(v_key, v_patch -> v_key);
      v_was := v_was || jsonb_build_object(v_key, coalesce(v_old -> v_key, 'null'::jsonb));
    end if;
  end loop;
  if v_changed = '{}'::jsonb and not p_create then
    return v_old;
  end if;

  v_stamp := greatest(clock_timestamp(), coalesce(v_stamp_old + interval '1 millisecond', '-infinity'));
  v_new := v_old || v_patch || jsonb_build_object('id', p_id, 'updatedAt', public.cesi_iso(v_stamp));
  execute format(
    'insert into public.%I (user_id, id, data, updated_at, deleted_at) values ($1, $2, $3, $4, null)
     on conflict (user_id, id) do update set data = excluded.data, updated_at = excluded.updated_at, deleted_at = null',
    p_table) using v_ceo, p_id, v_new, v_stamp;

  insert into public.team_edit_log (who, who_name, who_area, doc_table, doc_id, doc_name, action, before, after)
  values (v_me, public.cesi_person_name(v_me), v_area, p_table, p_id,
    left(coalesce(nullif(v_new ->> 'name', ''), nullif(v_new ->> 'title', ''), nullif(v_new ->> 'note', ''), ''), 200),
    case when p_create then 'alta' else 'edicion' end,
    case when p_create then null else v_was end, v_changed);
  return v_new;
end;
$$;

revoke all on function public.cesi_ceo_doc_patch(text, text, jsonb, jsonb, boolean) from public, anon;
grant execute on function public.cesi_ceo_doc_patch(text, text, jsonb, jsonb, boolean) to authenticated;

notify pgrst, 'reload schema';

-- Comprobación: ninguna área con Equipo (0), ningún permiso propio de Equipo (0), RRHH sin cambios
-- en las fichas (true) y la ceo sigue siendo la ceo (1).
select
  (select count(*) from public.area_permissions where screen = 'equipo' and level <> 'none') as areas_con_equipo,
  (select count(*) from public.profile_permissions where screen = 'equipo' and level <> 'none') as permisos_propios_con_equipo,
  position('v_rrhh := false' in pg_get_functiondef('public.cesi_ceo_doc_patch(text, text, jsonb, jsonb, boolean)'::regprocedure)) > 0 as rrhh_sin_fichas,
  (select count(*) from public.profiles where role = 'ceo') as cuentas_ceo;
