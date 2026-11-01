-- =============================================================================
-- CIFA · Parte 25: cursos abiertos e inscripciones de los alumnos (fase de alumnos, paso 1)
-- =============================================================================
-- Ejecutar en Supabase → SQL Editor (proyecto fvswxhfjclvadcoyuqyu), después de la parte 24
-- (supabase/parte24_contactos_de_cada_persona.sql). Se puede ejecutar más de una vez. No borra ni
-- cambia datos, tablas ni funciones de antes: solo añade funciones nuevas.
--
-- Qué hace:
--   · El estado del curso (borrador / inscripción abierta / en curso / terminado), las plazas
--     máximas y las fechas van en la ficha del curso de la ceo (data.status, data.maxSeats,
--     data.startDate, data.endDate). Sin estado, un curso es «borrador» (no sale en el portal).
--   · cesi_student_course_list(): para un alumno, sus cursos (con clases hechas y total) y los
--     abiertos para apuntarse («Inscripción abierta» o «En curso», con plazas libres).
--   · cesi_student_enroll(curso) / cesi_student_unenroll(curso): apuntarse y desapuntarse. Se
--     comprueba en el servidor que el curso admite inscripciones y que quedan plazas (dos alumnos
--     a la vez no se quedan la misma última plaza). Si la cuenta no está unida a una ficha de
--     alumno, se crea una con los datos de su perfil (como «Crear alumno nuevo con sus datos» de
--     Accesos) y se une. Escriben en la ficha del alumno de la ceo (su lista de cursos) dejándola
--     como la más reciente: a la ceo le llega como un cambio de otro dispositivo suyo.
--   · Cada inscripción queda en el registro de cambios de la ceo (team_edit_log, «Alumno»).
--   · Las clases del curso salen solas en el calendario del alumno (parte 6).

do $$
begin
  if to_regclass('public.team_contacts') is null then
    raise exception 'Falta la parte 24 (supabase/parte24_contactos_de_cada_persona.sql): ejecútala antes.';
  end if;
  if to_regclass('public.team_edit_log') is null or to_regprocedure('public.cesi_course_classes(public.courses, timestamptz, timestamptz)') is null then
    raise exception 'Faltan las partes 6 y 20: ejecútalas antes.';
  end if;
end;
$$;

-- -----------------------------------------------------------------------------
-- Ayudas
-- -----------------------------------------------------------------------------

-- La cuenta actual, si es de un alumno (si no, error).
create or replace function public.cesi_student_me()
returns uuid
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_me uuid := (select auth.uid());
begin
  if not exists (select 1 from public.profiles where id = v_me and role = 'alumno') then
    raise exception 'Solo los alumnos pueden apuntarse a los cursos.' using errcode = '42501';
  end if;
  return v_me;
end;
$$;

-- Guarda la ficha de un alumno de la ceo y la deja como la más reciente (aunque el reloj de un
-- dispositivo de la ceo vaya adelantado). Devuelve la ficha guardada.
create or replace function public.cesi_student_write(p_ceo uuid, p_id text, p_data jsonb, p_old_stamp timestamptz)
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
  insert into public.students (user_id, id, data, updated_at, deleted_at)
  values (p_ceo, p_id, v_data, v_stamp, null)
  on conflict (user_id, id) do update set data = excluded.data, updated_at = excluded.updated_at, deleted_at = null;
  return v_data;
end;
$$;

-- Cuántos alumnos (fichas sin borrar) tiene un curso.
create or replace function public.cesi_course_enrolled(p_ceo uuid, p_course text)
returns integer
language sql
stable
security definer
set search_path = ''
as $$
  select count(*)::integer from public.students s
  where s.user_id = p_ceo and s.deleted_at is null
    and jsonb_typeof(s.data -> 'courseIds') = 'array' and (s.data -> 'courseIds') ? p_course;
$$;

-- Plazas máximas de un curso (null: sin límite).
create or replace function public.cesi_course_max_seats(p_data jsonb)
returns integer
language sql
immutable
set search_path = ''
as $$
  select case when (p_data ->> 'maxSeats') ~ '^[1-9][0-9]{0,3}$' then (p_data ->> 'maxSeats')::integer end;
$$;

revoke all on function public.cesi_student_me() from public, anon, authenticated;
revoke all on function public.cesi_student_write(uuid, text, jsonb, timestamptz) from public, anon, authenticated;
revoke all on function public.cesi_course_enrolled(uuid, text) from public, anon, authenticated;
revoke all on function public.cesi_course_max_seats(jsonb) from public, anon, authenticated;

-- -----------------------------------------------------------------------------
-- Leer: mis cursos y los abiertos
-- -----------------------------------------------------------------------------
--   mine            estoy apuntado
--   status          'borrador' | 'inscripcion' | 'en_curso' | 'terminado'
--   max_seats       plazas máximas (null: sin límite); enrolled: apuntados
--   done_classes    (mis cursos) clases ya pasadas desde el inicio
--   total_classes   (mis cursos) clases entre el inicio y el fin (null si no tiene fecha de fin)
--   next_class      (mis cursos) la próxima clase
create or replace function public.cesi_student_course_list()
returns table (
  id text, name text, description text, teacher_name text, schedule jsonb, class_minutes integer,
  status text, start_date text, end_date text, max_seats integer, enrolled integer, mine boolean,
  done_classes integer, total_classes integer, next_class timestamptz
)
language plpgsql
stable
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  v_me uuid := public.cesi_student_me();
  v_ceo uuid := (select p.id from public.profiles p where p.role = 'ceo' order by p.created_at limit 1);
  v_mine text[] := coalesce(array(select public.cesi_student_courses(v_me)), '{}');
begin
  return query
  with c as (
    select co, coalesce(co.data ->> 'status', 'borrador') as st, public.cesi_course_max_seats(co.data) as mx,
      public.cesi_course_enrolled(v_ceo, co.id) as n, co.id = any (v_mine) as is_mine,
      case when (co.data ->> 'startDate') ~ '^\d{4}-\d{2}-\d{2}$' then (co.data ->> 'startDate')::date end as d_start,
      case when (co.data ->> 'endDate') ~ '^\d{4}-\d{2}-\d{2}$' then (co.data ->> 'endDate')::date end as d_end
    from public.courses co
    where co.user_id = v_ceo and co.deleted_at is null
  )
  select (c.co).id, coalesce((c.co).data ->> 'name', ''), coalesce((c.co).data ->> 'description', ''),
    coalesce(t.data ->> 'name', ''), (c.co).data -> 'schedule',
    case when ((c.co).data ->> 'classMinutes') ~ '^[0-9]{1,4}$' then ((c.co).data ->> 'classMinutes')::integer else 60 end,
    c.st, coalesce((c.co).data ->> 'startDate', ''), coalesce((c.co).data ->> 'endDate', ''), c.mx, c.n, c.is_mine,
    case when c.is_mine then (
      select count(*)::integer from public.cesi_course_classes(c.co,
        greatest(coalesce(c.d_start::timestamptz, now() - interval '365 days'), now() - interval '730 days'), now()) k
      where k.starts_at < now()
    ) end,
    case when c.is_mine and c.d_end is not null then (
      select count(*)::integer from public.cesi_course_classes(c.co,
        greatest(coalesce(c.d_start::timestamptz, now() - interval '365 days'), now() - interval '730 days'),
        least((c.d_end + 1)::timestamptz, now() + interval '730 days')) k
    ) end,
    case when c.is_mine then (
      select min(k.starts_at) from public.cesi_course_classes(c.co, now(), now() + interval '62 days') k where k.starts_at >= now()
    ) end
  from c
  left join public.contacts t on t.user_id = v_ceo and t.id = (c.co).data ->> 'teacherId' and t.deleted_at is null
  where c.is_mine or (c.st in ('inscripcion', 'en_curso') and (c.mx is null or c.n < c.mx))
  order by c.is_mine desc, coalesce((c.co).data ->> 'name', '');
end;
$$;

-- -----------------------------------------------------------------------------
-- Escribir: apuntarse y desapuntarse
-- -----------------------------------------------------------------------------

-- La ficha de alumno de la cuenta (la crea con su perfil si no tiene). Devuelve id, datos y fecha.
create or replace function public.cesi_student_ficha(p_me uuid, p_ceo uuid, out o_id text, out o_data jsonb, out o_stamp timestamptz, out o_created boolean)
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_link text := (select linked_student_id from public.profiles where id = p_me);
  v_prof public.account_profiles;
  v_acc public.profiles;
  v_now text := public.cesi_iso(clock_timestamp());
begin
  o_created := false;
  if v_link is not null then
    select s.id, s.data, s.updated_at into o_id, o_data, o_stamp
    from public.students s where s.user_id = p_ceo and s.id = v_link and s.deleted_at is null
    for update;
    if o_id is not null then
      return;
    end if;
  end if;
  -- Sin ficha: se crea con los datos de su perfil (como «Crear alumno nuevo con sus datos»).
  select * into v_prof from public.account_profiles where id = p_me;
  if not found or v_prof.completed_at is null then
    raise exception 'Completa tu perfil antes de apuntarte a un curso.' using errcode = '22023';
  end if;
  select * into v_acc from public.profiles where id = p_me;
  o_id := gen_random_uuid()::text;
  o_created := true;
  o_data := jsonb_build_object(
    'name', coalesce(nullif(trim(v_prof.full_name), ''), nullif(trim(v_acc.display_name), ''), 'Alumno'),
    'email', coalesce(v_acc.email, ''),
    'phone', '',
    'discord', coalesce(nullif(v_prof.discord, ''), to_jsonb(v_acc) ->> 'discord_username', ''),
    'birthday', '',
    'country', v_prof.country,
    'timeZone', v_prof.time_zone,
    'courseIds', '[]'::jsonb,
    'notes', '',
    'enrolledAt', to_char((now() at time zone 'Europe/Madrid')::date, 'YYYY-MM-DD'),
    'availability', coalesce(v_prof.availability, 'null'::jsonb),
    'createdAt', v_now
  );
  o_data := public.cesi_student_write(p_ceo, o_id, o_data, null);
  update public.profiles set linked_student_id = o_id where id = p_me;
  insert into public.team_edit_log (who, who_name, who_area, doc_table, doc_id, doc_name, action, before, after)
  values (p_me, public.cesi_person_name(p_me), 'alumno', 'students', o_id, left(o_data ->> 'name', 200), 'alta', null,
    jsonb_build_object('name', o_data ->> 'name'));
end;
$$;

revoke all on function public.cesi_student_ficha(uuid, uuid) from public, anon, authenticated;

-- Apuntarse a un curso. Devuelve { status: 'ok' | 'full' } ('full': «Curso completo»).
create or replace function public.cesi_student_enroll(p_course text)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_me uuid := public.cesi_student_me();
  v_ceo uuid := (select p.id from public.profiles p where p.role = 'ceo' order by p.created_at limit 1);
  v_course public.courses;
  v_status text;
  v_max integer;
  v_ficha record;
  v_ids jsonb;
  v_data jsonb;
begin
  if v_ceo is null then
    raise exception 'No hay cuenta de la dirección.' using errcode = '22023';
  end if;
  -- Uno a la vez por curso, para no pasarse de plazas.
  perform pg_advisory_xact_lock(hashtext('cesi_enroll:' || coalesce(p_course, '')));
  select * into v_course from public.courses where user_id = v_ceo and id = p_course and deleted_at is null;
  if not found then
    raise exception 'Ese curso ya no existe.' using errcode = '22023';
  end if;
  v_status := coalesce(v_course.data ->> 'status', 'borrador');
  if v_status not in ('inscripcion', 'en_curso') then
    raise exception 'Este curso no admite inscripciones ahora.' using errcode = '22023';
  end if;

  select * into v_ficha from public.cesi_student_ficha(v_me, v_ceo);
  v_ids := case when jsonb_typeof(v_ficha.o_data -> 'courseIds') = 'array' then v_ficha.o_data -> 'courseIds' else '[]'::jsonb end;
  if v_ids ? p_course then
    return jsonb_build_object('status', 'ok');
  end if;
  v_max := public.cesi_course_max_seats(v_course.data);
  if v_max is not null and public.cesi_course_enrolled(v_ceo, p_course) >= v_max then
    return jsonb_build_object('status', 'full');
  end if;

  v_data := v_ficha.o_data || jsonb_build_object(
    'courseIds', v_ids || to_jsonb(p_course),
    -- Cuándo se apuntó a cada curso (para la ficha del curso).
    'courseJoinedAt', coalesce(case when jsonb_typeof(v_ficha.o_data -> 'courseJoinedAt') = 'object' then v_ficha.o_data -> 'courseJoinedAt' end, '{}'::jsonb)
      || jsonb_build_object(p_course, to_char((now() at time zone 'Europe/Madrid')::date, 'YYYY-MM-DD'))
  );
  perform public.cesi_student_write(v_ceo, v_ficha.o_id, v_data, v_ficha.o_stamp);
  insert into public.team_edit_log (who, who_name, who_area, doc_table, doc_id, doc_name, action, before, after)
  values (v_me, public.cesi_person_name(v_me), 'alumno', 'students', v_ficha.o_id, left(coalesce(v_data ->> 'name', ''), 200), 'edicion',
    jsonb_build_object('courseIds', v_ids), jsonb_build_object('courseIds', v_data -> 'courseIds'));
  return jsonb_build_object('status', 'ok');
end;
$$;

-- Desapuntarse de un curso.
create or replace function public.cesi_student_unenroll(p_course text)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_me uuid := public.cesi_student_me();
  v_ceo uuid := (select p.id from public.profiles p where p.role = 'ceo' order by p.created_at limit 1);
  v_link text := (select linked_student_id from public.profiles where id = v_me);
  v_id text;
  v_old jsonb;
  v_stamp timestamptz;
  v_ids jsonb;
  v_new jsonb;
begin
  if v_link is null then
    return;
  end if;
  select s.id, s.data, s.updated_at into v_id, v_old, v_stamp
  from public.students s where s.user_id = v_ceo and s.id = v_link and s.deleted_at is null
  for update;
  if v_id is null then
    return;
  end if;
  v_ids := case when jsonb_typeof(v_old -> 'courseIds') = 'array' then v_old -> 'courseIds' else '[]'::jsonb end;
  if not (v_ids ? p_course) then
    return;
  end if;
  v_new := coalesce((select jsonb_agg(x) from jsonb_array_elements(v_ids) x where x #>> '{}' <> p_course), '[]'::jsonb);
  perform public.cesi_student_write(v_ceo, v_id, v_old || jsonb_build_object('courseIds', v_new), v_stamp);
  insert into public.team_edit_log (who, who_name, who_area, doc_table, doc_id, doc_name, action, before, after)
  values (v_me, public.cesi_person_name(v_me), 'alumno', 'students', v_id, left(coalesce(v_old ->> 'name', ''), 200), 'edicion',
    jsonb_build_object('courseIds', v_ids), jsonb_build_object('courseIds', v_new));
end;
$$;

-- -----------------------------------------------------------------------------
-- Permisos de las funciones
-- -----------------------------------------------------------------------------
revoke all on function public.cesi_student_course_list() from public, anon;
revoke all on function public.cesi_student_enroll(text) from public, anon;
revoke all on function public.cesi_student_unenroll(text) from public, anon;
grant execute on function public.cesi_student_course_list() to authenticated;
grant execute on function public.cesi_student_enroll(text) to authenticated;
grant execute on function public.cesi_student_unenroll(text) to authenticated;

notify pgrst, 'reload schema';

-- Comprobación: las 3 funciones con permiso (3), las internas sin él (false) y cuántos cursos
-- están ya abiertos para apuntarse.
select
  (select count(*) from unnest(array[
     'public.cesi_student_course_list()', 'public.cesi_student_enroll(text)', 'public.cesi_student_unenroll(text)'
   ]) as f (sig) where has_function_privilege('authenticated', f.sig, 'execute')) as funciones_con_permiso,
  has_function_privilege('authenticated', 'public.cesi_student_write(uuid, text, jsonb, timestamptz)', 'execute') as interna,
  (select count(*) from public.courses c
     where c.deleted_at is null and c.user_id in (select id from public.profiles where role = 'ceo')
       and coalesce(c.data ->> 'status', 'borrador') in ('inscripcion', 'en_curso')) as cursos_abiertos;
