-- =============================================================================
-- CIFA · Parte 16: Alianzas (seguimiento de patrocinadores y colaboraciones)
-- =============================================================================
-- Ejecutar en Supabase → SQL Editor (proyecto fvswxhfjclvadcoyuqyu), después de la parte 15
-- (supabase/parte15_profesor_pasar_lista.sql). Se puede ejecutar más de una vez. No borra datos
-- ni cambia las tablas, las reglas de acceso ni la sincronización de la ceo.
--
-- Qué hace:
--   · Alianzas: «Contactos externos» pasa a «Editar» (crear y editar contactos externos; nunca
--     fichas de Equipo, alumnos ni candidatos).
--   · El seguimiento de alianza va dentro del contacto (data.alliance), con los datos de la ceo:
--       { type: 'patrocinador' | 'colaborador' | 'partner' | 'otro',
--         status: 'por_contactar' | 'contactado' | 'negociacion' | 'cerrado' | 'descartado',
--         offer, amount (€, o null), startDate, endDate ('AAAA-MM-DD' o ''),
--         nextStep, nextStepDate, ownerId, ownerName (persona de Alianzas o Directivo),
--         notes: [{ id, at, text, byId, by }], closedAt (cuándo se cerró), updatedAt }
--   · Lo ven Alianzas, Directivo y la ceo; las demás áreas ven los contactos sin el seguimiento.
--     Lo editan Alianzas y la ceo (la ceo, desde su app); Directivo solo lo ve.
--   · Alianzas escribe con funciones security definer (cesi_external_contact_save,
--     cesi_alliance_save, cesi_alliance_note_add, cesi_alliance_note_remove), que comprueban que la
--     cuenta es de Alianzas y que el contacto es externo, cambian solo esos campos sobre la versión
--     del servidor y la dejan como la más reciente: a la ceo le llega como un cambio de otro
--     dispositivo suyo. Si los dos editan el mismo contacto a la vez, gana la ficha que se guardó
--     la última; las notas se añaden sobre la versión del servidor.
--   · cesi_alliance_people: responsables posibles. cesi_alliance_stats: cerradas este mes y en
--     negociación (Directivo y la ceo).

do $$
begin
  if to_regprocedure('public.cesi_teacher_attendance_save(text, text, text, jsonb)') is null then
    raise exception 'Falta la parte 15 (supabase/parte15_profesor_pasar_lista.sql): ejecútala antes.';
  end if;
  if not exists (select 1 from public.areas where id = 'alianzas') then
    raise exception 'Falta el área Alianzas (id alianzas): ejecuta antes la parte 5.';
  end if;
end;
$$;

-- -----------------------------------------------------------------------------
-- Permisos: Alianzas puede editar Contactos externos
-- -----------------------------------------------------------------------------
insert into public.area_permissions (area, screen, level)
values ('alianzas', 'contactos', 'write')
on conflict (area, screen) do update set level = excluded.level;

-- -----------------------------------------------------------------------------
-- Ayudas
-- -----------------------------------------------------------------------------

-- Qué puede hacer `p_profile` con las alianzas: 'edit' (Alianzas y la ceo), 'view' (Directivo) o null.
create or replace function public.cesi_alliance_role(p_profile uuid)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select case
    when p.role = 'ceo' then 'edit'
    when p.role = 'equipo' and p.area = 'alianzas' then 'edit'
    when p.role = 'equipo' and p.area = 'direccion' then 'view'
  end
  from public.profiles p
  where p.id = p_profile;
$$;

-- ¿Es un contacto externo? (no es del equipo, ni candidato, ni está archivado)
create or replace function public.cesi_is_external_contact(p_data jsonb)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select not (p_data ? 'teamProfile' and jsonb_typeof(p_data -> 'teamProfile') = 'object')
    and not (jsonb_typeof(p_data -> 'candidacies') = 'array' and jsonb_array_length(p_data -> 'candidacies') > 0)
    and not coalesce((p_data ->> 'candidateOnly')::boolean, false)
    and not coalesce((p_data ->> 'archived')::boolean, false);
$$;

-- Solo una persona de Alianzas escribe con estas funciones (la ceo, desde su app).
create or replace function public.cesi_alliance_writer()
returns uuid
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_me uuid := (select auth.uid());
begin
  if not exists (select 1 from public.profiles where id = v_me and role = 'equipo' and area = 'alianzas') then
    raise exception 'Solo Alianzas puede cambiar los contactos externos y su seguimiento.' using errcode = '42501';
  end if;
  return v_me;
end;
$$;

-- 'AAAA-MM-DD' válido o ''.
create or replace function public.cesi_day_or_empty(p text)
returns text
language plpgsql
immutable
set search_path = ''
as $$
begin
  if coalesce(p, '') = '' then
    return '';
  end if;
  if p !~ '^\d{4}-\d{2}-\d{2}$' then
    raise exception 'Fecha no válida.' using errcode = '22023';
  end if;
  perform p::date;
  return p;
exception when invalid_datetime_format or datetime_field_overflow then
  raise exception 'Fecha no válida.' using errcode = '22023';
end;
$$;

revoke all on function public.cesi_alliance_role(uuid) from public, anon, authenticated;
revoke all on function public.cesi_is_external_contact(jsonb) from public, anon, authenticated;
revoke all on function public.cesi_alliance_writer() from public, anon, authenticated;
revoke all on function public.cesi_day_or_empty(text) from public, anon, authenticated;

-- -----------------------------------------------------------------------------
-- Lo que necesita una pantalla (como en la parte 15; el seguimiento de alianza solo para
-- Alianzas, Directivo y la ceo)
-- -----------------------------------------------------------------------------
--   alliance      ve el seguimiento de alianza
--   allianceEdit  puede crear y editar contactos externos y su seguimiento (su propia cuenta)
create or replace function public.cesi_screen_data(p_screen text, p_as uuid default null, p_area text default null)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_me uuid := (select auth.uid());
  v_who uuid := v_me;
  v_level text;
  v_full boolean;
  v_teacher boolean;
  v_alliance text;
  v_out jsonb;
begin
  if p_as is not null and p_as <> v_who then
    if not public.is_ceo() then
      raise exception 'Sin permiso.' using errcode = '42501';
    end if;
    v_who := p_as;
  end if;
  if p_screen is null or p_screen not in ('contactos', 'equipo', 'vacantes', 'cursos', 'alumnos', 'asistencia') then
    raise exception 'Pantalla no válida.' using errcode = '22023';
  end if;
  if p_area is not null then
    -- «Ver como» un área (solo la ceo): sus permisos.
    if not public.is_ceo() then
      raise exception 'Sin permiso.' using errcode = '42501';
    end if;
    v_level := coalesce((select ap.level from public.area_permissions ap where ap.area = p_area and ap.screen = p_screen), 'none');
    v_teacher := p_area = 'formacion';
    v_alliance := case when p_area = 'alianzas' then 'edit' when p_area = 'direccion' then 'view' end;
  else
    v_level := public.cesi_level_for(v_who, p_screen);
    v_teacher := public.cesi_is_teacher_only(v_who);
    v_alliance := public.cesi_alliance_role(v_who);
  end if;
  if v_level not in ('read', 'write') then
    raise exception 'No tienes acceso a esta pantalla.' using errcode = '42501';
  end if;
  v_full := v_level = 'write';

  with
  ceo as (select id from public.profiles where role = 'ceo'),
  -- Cursos del profesor (ninguno en «Ver como» un área sin persona).
  my_courses as (
    select c.id from public.cesi_teacher_courses(case when p_area is null then v_who end) as c (id)
  ),
  -- Contactos (con «Ver», sin email, teléfono, notas ni foto; sin CV de equipo).
  c_all as (
    select case when v_full then c0.data
      else (c0.data - 'email' - 'phone' - 'notes' - 'photo') #- '{teamProfile,cv}' end as data
    from (select case when v_alliance is null then c.data - 'alliance' else c.data end as data, c.user_id, c.deleted_at from public.contacts c) c0
    where c0.user_id in (select id from ceo) and c0.deleted_at is null
  ),
  c_flags as (
    select data,
      (data ? 'teamProfile' and jsonb_typeof(data -> 'teamProfile') = 'object') as team,
      (data ? 'teamProfile' and jsonb_typeof(data -> 'teamProfile') = 'object'
        and coalesce(data -> 'teamProfile' ->> 'status', 'active') <> 'former'
        and not coalesce((data ->> 'archived')::boolean, false)) as active,
      (coalesce((data ->> 'candidateOnly')::boolean, false) and not (data ? 'teamProfile' and jsonb_typeof(data -> 'teamProfile') = 'object')) as candidate_only,
      (jsonb_typeof(data -> 'candidacies') = 'array' and jsonb_array_length(data -> 'candidacies') > 0) as candidate,
      public.cesi_is_external_contact(data) as external
    from c_all
  ),
  -- Candidaturas: con «Ver», sin CV ni notas.
  c_cand as (
    select case when v_full then data
      else jsonb_set(data, '{candidacies}', coalesce((
        select jsonb_agg(x - 'cv' - 'notes') from jsonb_array_elements(data -> 'candidacies') as x
      ), '[]'::jsonb)) end as data
    from c_flags
    where candidate
  ),
  -- Profesores (para los cursos): solo lo que hace falta para nombrarlos y su disponibilidad.
  c_teachers as (
    select jsonb_build_object(
      'id', data ->> 'id', 'name', data ->> 'name', 'country', data -> 'country', 'timeZone', data -> 'timeZone',
      'availability', data -> 'availability',
      'teamProfile', jsonb_build_object('status', data -> 'teamProfile' -> 'status', 'area', data -> 'teamProfile' -> 'area',
        'role', data -> 'teamProfile' -> 'role', 'roles', data -> 'teamProfile' -> 'roles')
    ) as data
    from c_flags
    where team
  ),
  courses as (
    select co.data from public.courses co
    where co.user_id in (select id from ceo) and co.deleted_at is null
      and (not v_teacher or co.id in (select id from my_courses))
  ),
  -- Alumnos (con «Ver», sin email, teléfono, cumpleaños, notas ni Discord). Al profesor, solo los
  -- de sus cursos y, en courseIds, solo esos cursos.
  s_rows as (
    select case when v_full then s.data else s.data - 'email' - 'phone' - 'birthday' - 'notes' - 'discord' end as data
    from public.students s
    where s.user_id in (select id from ceo) and s.deleted_at is null
      and (not v_teacher or (
        jsonb_typeof(s.data -> 'courseIds') = 'array'
        and exists (select 1 from jsonb_array_elements_text(s.data -> 'courseIds') x where x in (select id from my_courses))
      ))
  ),
  s_all as (
    select case when v_teacher then jsonb_set(data, '{courseIds}', coalesce((
        select jsonb_agg(x) from jsonb_array_elements_text(data -> 'courseIds') x where x in (select id from my_courses)
      ), '[]'::jsonb)) else data end as data
    from s_rows
  )
  select jsonb_build_object(
    'level', v_level,
    'teacher', v_teacher,
    'canMark', v_teacher and p_area is null and v_who = v_me,
    'alliance', v_alliance is not null,
    'allianceEdit', coalesce(v_alliance = 'edit', false) and p_area is null and v_who = v_me and not public.is_ceo(),
    'contacts', case p_screen
      -- external: contacto externo (lo puede editar Alianzas).
      when 'contactos' then coalesce((select jsonb_agg((data - 'candidacies' - 'candidateOnly') || jsonb_build_object('external', external)) from c_flags where not active and not candidate_only), '[]'::jsonb)
      when 'equipo' then coalesce((select jsonb_agg(data - 'candidacies' - 'candidateOnly') from c_flags where team), '[]'::jsonb)
      when 'vacantes' then coalesce((select jsonb_agg(data) from c_cand), '[]'::jsonb)
      else coalesce((select jsonb_agg(data) from c_teachers), '[]'::jsonb)
    end,
    'groups', case when p_screen in ('contactos', 'equipo') then coalesce((
        select jsonb_agg(g.data) from public.groups g where g.user_id in (select id from ceo) and g.deleted_at is null
      ), '[]'::jsonb) else '[]'::jsonb end,
    'vacancies', case when p_screen = 'vacantes' then coalesce((
        select jsonb_agg(v.data) from public.vacancies v where v.user_id in (select id from ceo) and v.deleted_at is null
      ), '[]'::jsonb) else '[]'::jsonb end,
    'courses', case when p_screen in ('cursos', 'alumnos', 'asistencia') then coalesce((select jsonb_agg(data) from courses), '[]'::jsonb) else '[]'::jsonb end,
    'students', case when p_screen in ('cursos', 'alumnos', 'asistencia') then coalesce((select jsonb_agg(data) from s_all), '[]'::jsonb) else '[]'::jsonb end,
    'attendance', case when p_screen in ('cursos', 'alumnos', 'asistencia') then coalesce((
        select jsonb_agg(a.data) from public.attendance a
        where a.user_id in (select id from ceo) and a.deleted_at is null
          and (not v_teacher or a.data ->> 'courseId' in (select id from my_courses))
      ), '[]'::jsonb) else '[]'::jsonb end,
    'extraClasses', case when p_screen in ('cursos', 'alumnos', 'asistencia') then coalesce((
        select jsonb_agg(x.data) from public.extra_classes x
        where x.user_id in (select id from ceo) and x.deleted_at is null
          and (not v_teacher or x.data ->> 'courseId' in (select id from my_courses))
      ), '[]'::jsonb) else '[]'::jsonb end
  ) into v_out;
  return v_out;
end;
$$;

-- -----------------------------------------------------------------------------
-- Escribir en los contactos de la ceo
-- -----------------------------------------------------------------------------

-- Guarda la ficha y la deja como la más reciente (aunque el reloj de un dispositivo de la ceo vaya
-- adelantado). Devuelve la ficha guardada.
create or replace function public.cesi_contact_write(p_ceo uuid, p_id text, p_data jsonb, p_old_stamp timestamptz)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_stamp timestamptz := greatest(clock_timestamp(), coalesce(p_old_stamp + interval '1 millisecond', '-infinity'));
  v_data jsonb := p_data || jsonb_build_object('id', p_id, 'updatedAt', public.cesi_iso(v_stamp));
begin
  insert into public.contacts (user_id, id, data, updated_at, deleted_at)
  values (p_ceo, p_id, v_data, v_stamp, null)
  on conflict (user_id, id) do update set data = excluded.data, updated_at = excluded.updated_at, deleted_at = null;
  return v_data;
end;
$$;

-- La ficha de un contacto externo de la ceo, bloqueada para cambiarla. Error si no es externo.
create or replace function public.cesi_external_contact(p_id text, out o_ceo uuid, out o_data jsonb, out o_stamp timestamptz)
language plpgsql
volatile
security definer
set search_path = ''
as $$
begin
  select c.user_id, c.data, c.updated_at into o_ceo, o_data, o_stamp
  from public.contacts c
  where c.id = p_id and c.deleted_at is null and c.user_id in (select id from public.profiles where role = 'ceo')
  limit 1
  for update;
  if o_ceo is null then
    raise exception 'Ese contacto ya no existe.' using errcode = '22023';
  end if;
  if not public.cesi_is_external_contact(o_data) then
    raise exception 'Solo se pueden cambiar los contactos externos (no las fichas de Equipo, alumnos ni candidatos).' using errcode = '42501';
  end if;
end;
$$;

revoke all on function public.cesi_contact_write(uuid, text, jsonb, timestamptz) from public, anon, authenticated;
revoke all on function public.cesi_external_contact(text) from public, anon, authenticated;

-- Crear (p_id null) o editar un contacto externo (Alianzas). p_data: { name, email, phone,
-- organization, role, notes, groupIds, country, timeZone, availability }; lo demás de la ficha se
-- queda como está. Devuelve la ficha guardada.
create or replace function public.cesi_external_contact_save(p_id text, p_data jsonb)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_me uuid := public.cesi_alliance_writer();
  v_ceo uuid;
  v_old jsonb := '{}'::jsonb;
  v_stamp timestamptz;
  v_id text := p_id;
  v_name text := trim(coalesce(p_data ->> 'name', ''));
  v_patch jsonb;
begin
  if length(v_name) = 0 or length(v_name) > 200 then
    raise exception 'Escribe el nombre (como mucho 200 caracteres).' using errcode = '22023';
  end if;
  if coalesce(p_data ->> 'country', '') = '' or coalesce(p_data ->> 'timeZone', '') = '' then
    raise exception 'El país es obligatorio.' using errcode = '22023';
  end if;
  if length(coalesce(p_data ->> 'notes', '')) > 4000 or length(coalesce(p_data ->> 'email', '')) > 200
     or length(coalesce(p_data ->> 'phone', '')) > 60 or length(coalesce(p_data ->> 'organization', '')) > 200
     or length(coalesce(p_data ->> 'role', '')) > 200 then
    raise exception 'Algún dato es demasiado largo.' using errcode = '22023';
  end if;

  if v_id is null then
    select id into v_ceo from public.profiles where role = 'ceo' order by created_at limit 1;
    if v_ceo is null then
      raise exception 'No hay cuenta de la dirección.' using errcode = '22023';
    end if;
    v_id := gen_random_uuid()::text;
    v_old := jsonb_build_object('photo', null, 'createdAt', public.cesi_iso(clock_timestamp()));
  else
    select o_ceo, o_data, o_stamp into v_ceo, v_old, v_stamp from public.cesi_external_contact(v_id);
  end if;

  v_patch := jsonb_build_object(
    'name', v_name,
    'email', trim(coalesce(p_data ->> 'email', '')),
    'phone', trim(coalesce(p_data ->> 'phone', '')),
    'organization', trim(coalesce(p_data ->> 'organization', '')),
    'role', trim(coalesce(p_data ->> 'role', '')),
    'notes', trim(coalesce(p_data ->> 'notes', '')),
    'groupIds', case when jsonb_typeof(p_data -> 'groupIds') = 'array' then p_data -> 'groupIds' else '[]'::jsonb end,
    'country', p_data ->> 'country',
    'timeZone', p_data ->> 'timeZone',
    'countryUnreviewed', false,
    'availability', case when jsonb_typeof(p_data -> 'availability') = 'object' then p_data -> 'availability' else 'null'::jsonb end
  );
  return public.cesi_contact_write(v_ceo, v_id, v_old || v_patch, v_stamp);
end;
$$;

-- Guardar el seguimiento de alianza de un contacto externo (Alianzas). p_alliance: { type, status,
-- offer, amount, startDate, endDate, nextStep, nextStepDate, ownerId }. Las notas no se tocan
-- (van con las funciones de abajo). Al pasar a «cerrado» se guarda cuándo (closedAt).
create or replace function public.cesi_alliance_save(p_contact_id text, p_alliance jsonb)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_me uuid := public.cesi_alliance_writer();
  v_ceo uuid;
  v_data jsonb;
  v_stamp timestamptz;
  v_old jsonb;
  v_status text := p_alliance ->> 'status';
  v_type text := p_alliance ->> 'type';
  v_amount numeric;
  v_owner uuid;
  v_start text;
  v_end text;
begin
  select o_ceo, o_data, o_stamp into v_ceo, v_data, v_stamp from public.cesi_external_contact(p_contact_id);
  v_old := case when jsonb_typeof(v_data -> 'alliance') = 'object' then v_data -> 'alliance' else '{}'::jsonb end;

  if coalesce(v_type, '') not in ('patrocinador', 'colaborador', 'partner', 'otro') then
    raise exception 'Elige el tipo.' using errcode = '22023';
  end if;
  if coalesce(v_status, '') not in ('por_contactar', 'contactado', 'negociacion', 'cerrado', 'descartado') then
    raise exception 'Estado no válido.' using errcode = '22023';
  end if;
  if length(coalesce(p_alliance ->> 'offer', '')) > 2000 or length(coalesce(p_alliance ->> 'nextStep', '')) > 500 then
    raise exception 'El texto es demasiado largo.' using errcode = '22023';
  end if;
  if coalesce(p_alliance ->> 'amount', '') <> '' then
    if (p_alliance ->> 'amount') !~ '^\d{1,9}(\.\d{1,2})?$' then
      raise exception 'El importe tiene que ser un número de euros (sin signos).' using errcode = '22023';
    end if;
    v_amount := (p_alliance ->> 'amount')::numeric;
  end if;
  v_start := public.cesi_day_or_empty(p_alliance ->> 'startDate');
  v_end := public.cesi_day_or_empty(p_alliance ->> 'endDate');
  if v_start <> '' and v_end <> '' and v_end < v_start then
    raise exception 'El fin del acuerdo tiene que ser después del inicio.' using errcode = '22023';
  end if;
  if coalesce(p_alliance ->> 'ownerId', '') <> '' then
    begin
      v_owner := (p_alliance ->> 'ownerId')::uuid;
    exception when others then
      raise exception 'Responsable no válido.' using errcode = '22023';
    end;
    if not exists (select 1 from public.profiles where id = v_owner and role = 'equipo' and area in ('alianzas', 'direccion')) then
      raise exception 'El responsable tiene que ser de Alianzas o Directivo.' using errcode = '22023';
    end if;
  end if;

  v_data := v_data || jsonb_build_object('alliance', v_old || jsonb_build_object(
    'type', v_type,
    'status', v_status,
    'offer', trim(coalesce(p_alliance ->> 'offer', '')),
    'amount', v_amount,
    'startDate', v_start,
    'endDate', v_end,
    'nextStep', trim(coalesce(p_alliance ->> 'nextStep', '')),
    'nextStepDate', public.cesi_day_or_empty(p_alliance ->> 'nextStepDate'),
    'ownerId', v_owner,
    'ownerName', case when v_owner is null then '' else public.cesi_person_name(v_owner) end,
    'notes', case when jsonb_typeof(v_old -> 'notes') = 'array' then v_old -> 'notes' else '[]'::jsonb end,
    'closedAt', case
      when v_status <> 'cerrado' then null
      when v_old ->> 'status' = 'cerrado' and v_old ? 'closedAt' then v_old -> 'closedAt'
      else to_jsonb(public.cesi_iso(clock_timestamp()))
    end,
    'updatedAt', public.cesi_iso(clock_timestamp())
  ));
  return public.cesi_contact_write(v_ceo, p_contact_id, v_data, v_stamp);
end;
$$;

-- Añadir una nota al historial (Alianzas). Si el contacto aún no tenía seguimiento, se crea (otro,
-- por contactar).
create or replace function public.cesi_alliance_note_add(p_contact_id text, p_text text)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_me uuid := public.cesi_alliance_writer();
  v_ceo uuid;
  v_data jsonb;
  v_stamp timestamptz;
  v_alliance jsonb;
  v_text text := trim(coalesce(p_text, ''));
begin
  if length(v_text) = 0 or length(v_text) > 1000 then
    raise exception 'Escribe la nota (como mucho 1000 caracteres).' using errcode = '22023';
  end if;
  select o_ceo, o_data, o_stamp into v_ceo, v_data, v_stamp from public.cesi_external_contact(p_contact_id);
  v_alliance := case when jsonb_typeof(v_data -> 'alliance') = 'object' then v_data -> 'alliance'
    else jsonb_build_object('type', 'otro', 'status', 'por_contactar', 'offer', '', 'amount', null, 'startDate', '', 'endDate', '',
      'nextStep', '', 'nextStepDate', '', 'ownerId', null, 'ownerName', '', 'closedAt', null) end;
  v_alliance := v_alliance || jsonb_build_object(
    'notes', (case when jsonb_typeof(v_alliance -> 'notes') = 'array' then v_alliance -> 'notes' else '[]'::jsonb end)
      || jsonb_build_array(jsonb_build_object(
        'id', gen_random_uuid()::text, 'at', public.cesi_iso(clock_timestamp()), 'text', v_text,
        'byId', v_me, 'by', public.cesi_person_name(v_me))),
    'updatedAt', public.cesi_iso(clock_timestamp()));
  return public.cesi_contact_write(v_ceo, p_contact_id, v_data || jsonb_build_object('alliance', v_alliance), v_stamp);
end;
$$;

-- Quitar una nota del historial (Alianzas).
create or replace function public.cesi_alliance_note_remove(p_contact_id text, p_note_id text)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_me uuid := public.cesi_alliance_writer();
  v_ceo uuid;
  v_data jsonb;
  v_stamp timestamptz;
  v_alliance jsonb;
begin
  select o_ceo, o_data, o_stamp into v_ceo, v_data, v_stamp from public.cesi_external_contact(p_contact_id);
  if jsonb_typeof(v_data -> 'alliance') <> 'object' or jsonb_typeof(v_data -> 'alliance' -> 'notes') <> 'array' then
    return v_data;
  end if;
  v_alliance := (v_data -> 'alliance') || jsonb_build_object(
    'notes', coalesce((select jsonb_agg(n) from jsonb_array_elements(v_data -> 'alliance' -> 'notes') n where n ->> 'id' is distinct from p_note_id), '[]'::jsonb),
    'updatedAt', public.cesi_iso(clock_timestamp()));
  return public.cesi_contact_write(v_ceo, p_contact_id, v_data || jsonb_build_object('alliance', v_alliance), v_stamp);
end;
$$;

-- -----------------------------------------------------------------------------
-- Responsables y cifras
-- -----------------------------------------------------------------------------

-- Responsables posibles: las personas de Alianzas y de Directivo (para quien ve las alianzas).
create or replace function public.cesi_alliance_people()
returns table (id uuid, name text, area text)
language plpgsql
stable
security definer
set search_path = ''
as $$
#variable_conflict use_column
begin
  if public.cesi_alliance_role((select auth.uid())) is null then
    raise exception 'Sin permiso.' using errcode = '42501';
  end if;
  return query
    select p.id, public.cesi_person_name(p.id), p.area
    from public.profiles p
    where p.role = 'equipo' and p.area in ('alianzas', 'direccion')
    order by 2;
end;
$$;

-- Alianzas cerradas este mes (en la zona de quien mira) y en negociación. Directivo y la ceo
-- (p_as: «Ver como» de la ceo).
create or replace function public.cesi_alliance_stats(p_as uuid default null)
returns table (closed_month integer, negotiating integer)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_me uuid := public.cesi_home_viewer(p_as);
  v_zone text := public.cesi_zone_of(v_me);
  v_month timestamptz := date_trunc('month', now() at time zone v_zone) at time zone v_zone;
begin
  return query
  with a as (
    select c.data -> 'alliance' as al
    from public.contacts c
    where c.user_id in (select id from public.profiles where role = 'ceo') and c.deleted_at is null
      and jsonb_typeof(c.data -> 'alliance') = 'object' and public.cesi_is_external_contact(c.data)
  )
  select
    (select count(*) from a where al ->> 'status' = 'cerrado' and public.cesi_try_ts(al ->> 'closedAt') >= v_month)::integer,
    (select count(*) from a where al ->> 'status' = 'negociacion')::integer;
end;
$$;

-- -----------------------------------------------------------------------------
-- Permisos de las funciones
-- -----------------------------------------------------------------------------
revoke all on function public.cesi_screen_data(text, uuid, text) from public, anon;
revoke all on function public.cesi_external_contact_save(text, jsonb) from public, anon;
revoke all on function public.cesi_alliance_save(text, jsonb) from public, anon;
revoke all on function public.cesi_alliance_note_add(text, text) from public, anon;
revoke all on function public.cesi_alliance_note_remove(text, text) from public, anon;
revoke all on function public.cesi_alliance_people() from public, anon;
revoke all on function public.cesi_alliance_stats(uuid) from public, anon;
grant execute on function public.cesi_screen_data(text, uuid, text) to authenticated;
grant execute on function public.cesi_external_contact_save(text, jsonb) to authenticated;
grant execute on function public.cesi_alliance_save(text, jsonb) to authenticated;
grant execute on function public.cesi_alliance_note_add(text, text) to authenticated;
grant execute on function public.cesi_alliance_note_remove(text, text) to authenticated;
grant execute on function public.cesi_alliance_people() to authenticated;
grant execute on function public.cesi_alliance_stats(uuid) to authenticated;

notify pgrst, 'reload schema';

-- Comprobación: Alianzas con «Editar» en contactos, las 6 funciones con permiso (6), las internas
-- sin él (false) y cuántos contactos tienen ya seguimiento.
select
  (select level from public.area_permissions where area = 'alianzas' and screen = 'contactos') as alianzas_contactos,
  (select count(*) from unnest(array[
     'public.cesi_external_contact_save(text, jsonb)', 'public.cesi_alliance_save(text, jsonb)',
     'public.cesi_alliance_note_add(text, text)', 'public.cesi_alliance_note_remove(text, text)',
     'public.cesi_alliance_people()', 'public.cesi_alliance_stats(uuid)'
   ]) as f (sig) where has_function_privilege('authenticated', f.sig, 'execute')) as funciones_con_permiso,
  has_function_privilege('authenticated', 'public.cesi_contact_write(uuid, text, jsonb, timestamptz)', 'execute') as interna,
  (select count(*) from public.contacts c
     where c.deleted_at is null and jsonb_typeof(c.data -> 'alliance') = 'object') as con_seguimiento;
