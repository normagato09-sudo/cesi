-- =============================================================================
-- CIFA · Parte 15: el Profesor ve solo sus cursos y sus alumnos, y pasa lista
-- =============================================================================
-- Ejecutar en Supabase → SQL Editor (proyecto fvswxhfjclvadcoyuqyu), después de la parte 14
-- (y de las 6 y 11, que ya están). Se puede ejecutar más de una vez. No borra datos ni cambia las
-- tablas, las reglas de acceso ni la sincronización de la ceo.
--
-- Qué hace:
--   · cesi_screen_data (Cursos, Alumnos y Asistencia): a una persona del área Profesor
--     (formacion) solo le devuelve sus cursos (los que tienen como profesor a la persona de
--     Equipo unida a su cuenta: courses.data.teacherId = profiles.linked_team_id), los alumnos
--     de esos cursos (con «Ver», sin email, teléfono, cumpleaños, notas ni Discord) y el pase de
--     lista y las clases sueltas de esos cursos. Dice también si puede pasar lista (canMark).
--     Directivo, la ceo y las demás áreas: como en la parte 11.
--   · cesi_teacher_attendance_save / cesi_teacher_attendance_clear: el profesor marca (o deja
--     sin marcar) a un alumno en una clase de un curso suyo. Comprueban que el curso es suyo, que
--     el alumno está en el curso y que la clase existe, y escriben en la tabla attendance de la
--     ceo con el mismo formato que su app. A la ceo le llega como un cambio de otro dispositivo
--     suyo (server_updated_at y Realtime), sin tocar su sincronización.
--   · Si la ceo y el profesor marcan al mismo alumno en la misma clase, gana el último cambio
--     (todo el registro), como entre dos dispositivos de la ceo. Si hubiera dos registros del
--     mismo alumno y clase, se queda el más reciente y el otro se borra.

do $$
begin
  if to_regclass('public.team_goals') is null then
    raise exception 'Falta la parte 14 (supabase/parte14_objetivos_del_mes.sql): ejecútala antes.';
  end if;
  if to_regprocedure('public.cesi_teacher_courses(uuid)') is null or to_regprocedure('public.cesi_course_classes(public.courses, timestamptz, timestamptz)') is null then
    raise exception 'Falta la parte 6 (supabase/parte6_calendario_compartido.sql): ejecútala antes.';
  end if;
  if to_regprocedure('public.cesi_level_for(uuid, text)') is null then
    raise exception 'Falta la parte 11 (supabase/parte11_pantallas_equipo.sql): ejecútala antes.';
  end if;
end;
$$;

-- -----------------------------------------------------------------------------
-- Ayudas
-- -----------------------------------------------------------------------------

-- Instante en el formato de la app (como Date.toISOString(): 2030-11-04T17:00:00.000Z).
create or replace function public.cesi_iso(p timestamptz)
returns text
language sql
immutable
set search_path = ''
as $$
  select to_char(p at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"');
$$;

-- ¿Es `p_profile` del área Profesor (y no Directivo ni la ceo)? Entonces solo ve sus cursos.
create or replace function public.cesi_is_teacher_only(p_profile uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (select 1 from public.profiles where id = p_profile and role = 'equipo' and area = 'formacion');
$$;

revoke all on function public.cesi_iso(timestamptz) from public, anon, authenticated;
revoke all on function public.cesi_is_teacher_only(uuid) from public, anon, authenticated;

-- -----------------------------------------------------------------------------
-- Lo que necesita una pantalla (como en la parte 11; al Profesor, solo lo de sus cursos)
-- -----------------------------------------------------------------------------
--   teacher   true si solo se ven los cursos de esa persona (área Profesor)
--   canMark   puede pasar lista en sus clases (su propia cuenta, no «Ver como»)
-- «Ver como» el área Profesor sin elegir persona: sin cursos (no hay de quién).
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
  else
    v_level := public.cesi_level_for(v_who, p_screen);
    v_teacher := public.cesi_is_teacher_only(v_who);
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
    select case when v_full then c.data
      else (c.data - 'email' - 'phone' - 'notes' - 'photo') #- '{teamProfile,cv}' end as data
    from public.contacts c
    where c.user_id in (select id from ceo) and c.deleted_at is null
  ),
  c_flags as (
    select data,
      (data ? 'teamProfile' and jsonb_typeof(data -> 'teamProfile') = 'object') as team,
      (data ? 'teamProfile' and jsonb_typeof(data -> 'teamProfile') = 'object'
        and coalesce(data -> 'teamProfile' ->> 'status', 'active') <> 'former'
        and not coalesce((data ->> 'archived')::boolean, false)) as active,
      (coalesce((data ->> 'candidateOnly')::boolean, false) and not (data ? 'teamProfile' and jsonb_typeof(data -> 'teamProfile') = 'object')) as candidate_only,
      (jsonb_typeof(data -> 'candidacies') = 'array' and jsonb_array_length(data -> 'candidacies') > 0) as candidate
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
    'contacts', case p_screen
      when 'contactos' then coalesce((select jsonb_agg(data - 'candidacies' - 'candidateOnly') from c_flags where not active and not candidate_only), '[]'::jsonb)
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
-- Pasar lista (el profesor, en las clases de sus cursos)
-- -----------------------------------------------------------------------------

-- La clase de un curso del profesor: { course, ceo, start, end, timeZone }. Error si el curso no
-- es suyo, el alumno no está en él o la clase no existe (del horario, suelta o, si cambió el
-- horario, la que ya tiene pase de lista).
create or replace function public.cesi_teacher_class(p_course_id text, p_class_key text, p_student_id text,
  out o_ceo uuid, out o_start timestamptz, out o_end timestamptz, out o_zone text)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_me uuid := (select auth.uid());
  v_course public.courses;
  v_day date;
  v_extra jsonb;
begin
  if not public.cesi_is_teacher_only(v_me) or p_course_id is null
     or p_course_id not in (select c from public.cesi_teacher_courses(v_me) as c) then
    raise exception 'Solo puedes pasar lista en tus cursos.' using errcode = '42501';
  end if;
  select * into v_course from public.courses
  where id = p_course_id and deleted_at is null and user_id in (select id from public.profiles where role = 'ceo')
  limit 1;
  if not found then
    raise exception 'Ese curso ya no existe.' using errcode = '22023';
  end if;
  o_ceo := v_course.user_id;

  if not exists (
    select 1 from public.students s
    where s.user_id = o_ceo and s.id = p_student_id and s.deleted_at is null
      and jsonb_typeof(s.data -> 'courseIds') = 'array' and (s.data -> 'courseIds') ? p_course_id
  ) then
    raise exception 'Ese alumno no está en el curso.' using errcode = '22023';
  end if;

  if p_class_key like 'extra:%' then
    select x.data into v_extra from public.extra_classes x
    where x.user_id = o_ceo and x.id = substr(p_class_key, 7) and x.deleted_at is null and x.data ->> 'courseId' = p_course_id;
    if v_extra is not null then
      o_start := (v_extra ->> 'start')::timestamptz;
      o_end := (v_extra ->> 'end')::timestamptz;
      o_zone := v_extra ->> 'timeZone';
    end if;
  elsif p_class_key ~ '^\d{4}-\d{2}-\d{2}_\d{2}:\d{2}$' then
    v_day := substr(p_class_key, 1, 10)::date;
    select k.starts_at, k.ends_at into o_start, o_end
    from public.cesi_course_classes(v_course, (v_day - 2)::timestamptz, (v_day + 3)::timestamptz) k
    where k.class_key = p_class_key and not k.is_extra
    limit 1;
    o_zone := v_course.data -> 'schedule' ->> 'timeZone';
  end if;

  -- Si el horario cambió, la clase que ya tiene pase de lista.
  if o_start is null then
    select (a.data ->> 'classStart')::timestamptz, (a.data ->> 'classEnd')::timestamptz, a.data ->> 'timeZone'
    into o_start, o_end, o_zone
    from public.attendance a
    where a.user_id = o_ceo and a.deleted_at is null and a.data ->> 'courseId' = p_course_id and a.data ->> 'classKey' = p_class_key
    order by a.updated_at desc
    limit 1;
  end if;
  if o_start is null or o_end is null then
    raise exception 'Esa clase no existe.' using errcode = '22023';
  end if;
  o_zone := coalesce(nullif(o_zone, ''), 'Europe/Madrid');
end;
$$;

-- Marcar a un alumno: p_data { status, lateMinutes, arrivedAt, leftAt, justified, justification }
-- (lo demás lo pone la función). Devuelve el registro guardado (el de la app de la ceo).
create or replace function public.cesi_teacher_attendance_save(p_course_id text, p_class_key text, p_student_id text, p_data jsonb)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_class record;
  v_status text := p_data ->> 'status';
  v_late integer;
  v_arrived timestamptz;
  v_left timestamptz;
  v_justified boolean := coalesce((p_data ->> 'justified')::boolean, false);
  v_reason text := trim(coalesce(p_data ->> 'justification', ''));
  v_old public.attendance;
  v_id text;
  v_stamp timestamptz;
  v_data jsonb;
begin
  select * into v_class from public.cesi_teacher_class(p_course_id, p_class_key, p_student_id);

  if coalesce(v_status, '') not in ('present', 'late', 'absent') then
    raise exception 'Estado de asistencia no válido.' using errcode = '22023';
  end if;
  if v_status = 'late' and (p_data ->> 'lateMinutes') is not null then
    v_late := case when (p_data ->> 'lateMinutes') ~ '^\d{1,3}$' then (p_data ->> 'lateMinutes')::integer end;
    if v_late is null or v_late not between 1 and 600 then
      raise exception 'Los minutos de retraso tienen que ser un número del 1 al 600.' using errcode = '22023';
    end if;
  end if;
  if v_status <> 'absent' then
    begin
      v_arrived := (p_data ->> 'arrivedAt')::timestamptz;
      v_left := (p_data ->> 'leftAt')::timestamptz;
    exception when others then
      raise exception 'Hora de entrada o de salida no válida.' using errcode = '22023';
    end;
    if v_arrived is null or v_left is null or v_left <= v_arrived
       or v_arrived < v_class.o_start - interval '3 hours' or v_left > v_class.o_end + interval '3 hours' then
      raise exception 'La entrada y la salida tienen que estar entre 3 h antes del inicio y 3 h después del fin de la clase.' using errcode = '22023';
    end if;
  end if;
  if v_status = 'present' then
    v_justified := false;
    v_reason := '';
  end if;
  if not v_justified then
    v_reason := '';
  end if;
  if length(v_reason) > 500 then
    raise exception 'El motivo puede tener como mucho 500 caracteres.' using errcode = '22023';
  end if;

  -- El registro de ese alumno y clase (el más reciente si hubiera varios).
  select * into v_old from public.attendance a
  where a.user_id = v_class.o_ceo and a.deleted_at is null
    and a.data ->> 'courseId' = p_course_id and a.data ->> 'classKey' = p_class_key and a.data ->> 'studentId' = p_student_id
  order by a.updated_at desc
  limit 1
  for update;

  -- Siempre más reciente que lo guardado (aunque el reloj de un dispositivo vaya adelantado).
  v_stamp := greatest(clock_timestamp(), coalesce(v_old.updated_at + interval '1 millisecond', '-infinity'));
  v_id := coalesce(v_old.id, gen_random_uuid()::text);
  v_data := coalesce(v_old.data, '{}'::jsonb) || jsonb_build_object(
    'id', v_id,
    'courseId', p_course_id,
    'classKey', p_class_key,
    'classStart', public.cesi_iso(v_class.o_start),
    'classEnd', public.cesi_iso(v_class.o_end),
    'timeZone', v_class.o_zone,
    'studentId', p_student_id,
    'status', v_status,
    'lateMinutes', v_late,
    'arrivedAt', case when v_status = 'absent' then null else public.cesi_iso(v_arrived) end,
    'leftAt', case when v_status = 'absent' then null else public.cesi_iso(v_left) end,
    'justified', v_justified,
    'justification', v_reason,
    'createdAt', coalesce(v_old.data ->> 'createdAt', public.cesi_iso(v_stamp)),
    'updatedAt', public.cesi_iso(v_stamp)
  );

  insert into public.attendance (user_id, id, data, updated_at, deleted_at)
  values (v_class.o_ceo, v_id, v_data, v_stamp, null)
  on conflict (user_id, id) do update set data = excluded.data, updated_at = excluded.updated_at, deleted_at = null;

  -- Otros registros del mismo alumno y clase: se borran (como en la app, se queda el más reciente).
  update public.attendance a
  set deleted_at = v_stamp, updated_at = greatest(v_stamp, a.updated_at + interval '1 millisecond')
  where a.user_id = v_class.o_ceo and a.deleted_at is null and a.id <> v_id
    and a.data ->> 'courseId' = p_course_id and a.data ->> 'classKey' = p_class_key and a.data ->> 'studentId' = p_student_id;

  return v_data;
end;
$$;

-- Dejar a un alumno sin marcar en una clase de un curso del profesor.
create or replace function public.cesi_teacher_attendance_clear(p_course_id text, p_class_key text, p_student_id text)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_class record;
  v_now timestamptz := clock_timestamp();
begin
  select * into v_class from public.cesi_teacher_class(p_course_id, p_class_key, p_student_id);
  update public.attendance a
  set deleted_at = v_now, updated_at = greatest(v_now, a.updated_at + interval '1 millisecond')
  where a.user_id = v_class.o_ceo and a.deleted_at is null
    and a.data ->> 'courseId' = p_course_id and a.data ->> 'classKey' = p_class_key and a.data ->> 'studentId' = p_student_id;
end;
$$;

-- -----------------------------------------------------------------------------
-- Permisos de las funciones
-- -----------------------------------------------------------------------------
revoke all on function public.cesi_teacher_class(text, text, text) from public, anon, authenticated;
revoke all on function public.cesi_screen_data(text, uuid, text) from public, anon;
revoke all on function public.cesi_teacher_attendance_save(text, text, text, jsonb) from public, anon;
revoke all on function public.cesi_teacher_attendance_clear(text, text, text) from public, anon;
grant execute on function public.cesi_screen_data(text, uuid, text) to authenticated;
grant execute on function public.cesi_teacher_attendance_save(text, text, text, jsonb) to authenticated;
grant execute on function public.cesi_teacher_attendance_clear(text, text, text) to authenticated;

notify pgrst, 'reload schema';

-- Comprobación: las 3 funciones con permiso (true) y las internas sin él (false), y cuántos
-- profesores tienen cursos.
select
  has_function_privilege('authenticated', 'public.cesi_screen_data(text, uuid, text)', 'execute')
    and has_function_privilege('authenticated', 'public.cesi_teacher_attendance_save(text, text, text, jsonb)', 'execute')
    and has_function_privilege('authenticated', 'public.cesi_teacher_attendance_clear(text, text, text)', 'execute') as funciones,
  has_function_privilege('authenticated', 'public.cesi_teacher_class(text, text, text)', 'execute') as interna,
  (select count(*) from public.profiles p
     where p.role = 'equipo' and p.area = 'formacion'
       and exists (select 1 from public.cesi_teacher_courses(p.id))) as profesores_con_cursos;
