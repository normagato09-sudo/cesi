-- =============================================================================
-- CIFA · Parte 39: el equipo se apunta a los cursos (y el link de la llamada)
-- =============================================================================
-- Ejecutar en Supabase → SQL Editor (proyecto fvswxhfjclvadcoyuqyu), después de la parte 38
-- (supabase/parte38_vacantes.sql). Se puede ejecutar más de una vez. No borra datos ni tablas.
--
-- Las personas del equipo se apuntan y desapuntan a los cursos abiertos como los alumnos (mismas
-- plazas, fechas y comprobaciones). Para inscribirse usan una FICHA DE ALUMNO (tabla students de
-- la ceo) unida a su cuenta con profiles.linked_student_id, igual que un alumno: se crea sola con
-- los datos de su perfil la primera vez que se apuntan y lleva data.fromTeam = true (en la app de
-- la ceo sale «Equipo» junto a su nombre). Su ficha de Equipo (linked_team_id) no cambia. Así
-- cuentan como alumnos del curso: salen en la lista, en el horario automático, en asistencia y en
-- calificaciones sin cambiar nada de eso.
--
-- Vuelve a escribir, ampliándolas, funciones de las partes 6, 25 y 30:
--   cesi_student_me        también las cuentas de equipo;
--   cesi_student_courses   también los cursos de las cuentas de equipo (calendario, clases y
--                          «Mi asistencia» salen solos);
--   cesi_student_ficha     la ficha nueva de una cuenta de equipo lleva fromTeam;
--   cesi_student_enroll    igual que antes, y nadie se apunta a un curso del que es el profesor;
--   cesi_course_people     los inscritos del equipo cuentan con la disponibilidad de su perfil.
-- Además (del trabajo anterior): cesi_my_teacher_courses() («Eres el profesor») y el link de la
-- llamada de cada curso (data.callLink): cesi_course_call_links() y cesi_course_set_link().

do $$
begin
  if to_regprocedure('public.cesi_vacancy_save(text, jsonb)') is null then
    raise exception 'Falta la parte 38 (supabase/parte38_vacantes.sql): ejecútala antes.';
  end if;
  if to_regprocedure('public.cesi_student_ficha(uuid, uuid)') is null or to_regprocedure('public.cesi_course_people(text)') is null then
    raise exception 'Faltan las partes 25 y 30: ejecútalas antes.';
  end if;
end;
$$;

-- La cuenta actual si puede apuntarse a cursos (alumno o, ahora, equipo); si no, error.
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
  if not exists (select 1 from public.profiles where id = v_me and role in ('alumno', 'equipo')) then
    raise exception 'Solo los alumnos y el equipo pueden apuntarse a los cursos.' using errcode = '42501';
  end if;
  return v_me;
end;
$$;

-- Cursos (ids) en los que está apuntada una cuenta (alumno o, ahora, equipo).
create or replace function public.cesi_student_courses(p_profile uuid)
returns setof text
language sql
stable
security definer
set search_path = ''
as $$
  select distinct c.value
  from public.profiles pr
  join public.students s
    on s.id = pr.linked_student_id and s.deleted_at is null
   and s.user_id in (select id from public.profiles where role = 'ceo')
  cross join lateral jsonb_array_elements_text(
    case when jsonb_typeof(s.data -> 'courseIds') = 'array' then s.data -> 'courseIds' else '[]'::jsonb end
  ) as c (value)
  join public.courses co on co.id = c.value and co.user_id = s.user_id and co.deleted_at is null
  where pr.id = p_profile and pr.role in ('alumno', 'equipo');
$$;

revoke all on function public.cesi_student_courses(uuid) from public, anon, authenticated;

-- Los cursos que da quien llama (para «Eres el profesor»).
create or replace function public.cesi_my_teacher_courses()
returns setof text
language sql
stable
security definer
set search_path = ''
as $$
  select public.cesi_teacher_courses((select auth.uid()));
$$;

revoke all on function public.cesi_my_teacher_courses() from public, anon;
grant execute on function public.cesi_my_teacher_courses() to authenticated;

-- La ficha de alumno de la cuenta (como en la parte 25: la crea con su perfil si no tiene). Una
-- cuenta de equipo usa también una ficha de alumno (la suya de Equipo no se toca): la nueva lleva
-- fromTeam = true y el registro de cambios dice su área.
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
  ) || case when v_acc.role = 'equipo' then jsonb_build_object('fromTeam', true) else '{}'::jsonb end;
  o_data := public.cesi_student_write(p_ceo, o_id, o_data, null);
  update public.profiles set linked_student_id = o_id where id = p_me;
  insert into public.team_edit_log (who, who_name, who_area, doc_table, doc_id, doc_name, action, before, after)
  values (p_me, public.cesi_person_name(p_me), case when v_acc.role = 'equipo' then v_acc.area else 'alumno' end,
    'students', o_id, left(o_data ->> 'name', 200), 'alta', null, jsonb_build_object('name', o_data ->> 'name'));
end;
$$;

revoke all on function public.cesi_student_ficha(uuid, uuid) from public, anon, authenticated;

-- Apuntarse a un curso: igual que en la parte 25, ahora también el equipo y nunca a uno suyo.
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
  -- Nadie se apunta a un curso del que es el profesor (parte 39).
  if p_course in (select public.cesi_teacher_courses(v_me)) then
    raise exception 'Eres el profesor de este curso.' using errcode = '42501';
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
  ) || case when exists (select 1 from public.profiles where id = v_me and role = 'equipo') then jsonb_build_object('fromTeam', true) else '{}'::jsonb end;
  perform public.cesi_student_write(v_ceo, v_ficha.o_id, v_data, v_ficha.o_stamp);
  insert into public.team_edit_log (who, who_name, who_area, doc_table, doc_id, doc_name, action, before, after)
  values (v_me, public.cesi_person_name(v_me), coalesce((select case when role = 'equipo' then area end from public.profiles where id = v_me), 'alumno'), 'students', v_ficha.o_id, left(coalesce(v_data ->> 'name', ''), 200), 'edicion',
    jsonb_build_object('courseIds', v_ids), jsonb_build_object('courseIds', v_data -> 'courseIds'));
  return jsonb_build_object('status', 'ok');
end;
$$;

-- Las personas de un curso (parte 30): los inscritos del equipo, con la disponibilidad de su perfil.
create or replace function public.cesi_course_people(p_course text)
returns table (
  kind text, id text, name text, account_id uuid,
  country text, time_zone text, availability jsonb, from_profile boolean
)
language plpgsql
stable
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  v_me uuid := public.cesi_schedule_manager();
  v_ceo uuid;
  v_course jsonb;
begin
  select co.user_id, co.data into v_ceo, v_course
  from public.courses co
  where co.id = p_course and co.deleted_at is null and co.user_id in (select p.id from public.profiles p where p.role = 'ceo')
  limit 1;
  if v_ceo is null then
    raise exception 'Ese curso no existe.' using errcode = '22023';
  end if;
  return query
    -- El profesor (su ficha de Equipo y, si está unida a una cuenta, su perfil).
    select 'teacher'::text, c.id, coalesce(nullif(trim(c.data ->> 'name'), ''), 'Profesor'), pr.id,
      case when ap.completed_at is not null then ap.country else c.data ->> 'country' end,
      case when ap.completed_at is not null then ap.time_zone else c.data ->> 'timeZone' end,
      case when ap.completed_at is not null then ap.availability else c.data -> 'availability' end,
      ap.completed_at is not null
    from public.contacts c
    left join public.profiles pr on pr.linked_team_id = c.id and pr.role = 'equipo'
    left join public.account_profiles ap on ap.id = pr.id
    where c.user_id = v_ceo and c.deleted_at is null and c.id = v_course ->> 'teacherId'
    union all
    -- Los alumnos inscritos (su ficha y, si tienen cuenta, su perfil).
    select 'student'::text, s.id, coalesce(nullif(trim(s.data ->> 'name'), ''), 'Alumno'), pr.id,
      case when ap.completed_at is not null then ap.country else s.data ->> 'country' end,
      case when ap.completed_at is not null then ap.time_zone else s.data ->> 'timeZone' end,
      case when ap.completed_at is not null then ap.availability else s.data -> 'availability' end,
      ap.completed_at is not null
    from public.students s
    left join public.profiles pr on pr.linked_student_id = s.id and pr.role in ('alumno', 'equipo')
    left join public.account_profiles ap on ap.id = pr.id
    where s.user_id = v_ceo and s.deleted_at is null
      and jsonb_typeof(s.data -> 'courseIds') = 'array' and (s.data -> 'courseIds') ? p_course;
end;
$$;

-- -----------------------------------------------------------------------------
-- Link de la llamada de cada curso
-- -----------------------------------------------------------------------------

-- ¿Puede `p_profile` ver o cambiar el link de ese curso como responsable? (su profesor, la ceo y
-- Directivo, también el Coordinador)
create or replace function public.cesi_course_link_manager(p_profile uuid, p_course text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (select 1 from public.profiles where id = p_profile and (role = 'ceo' or (role = 'equipo' and area = 'direccion')))
    or p_course in (select public.cesi_teacher_courses(p_profile));
$$;

revoke all on function public.cesi_course_link_manager(uuid, text) from public, anon, authenticated;

-- Los links que puede ver quien llama: los de sus cursos (inscrito), los que da y, la ceo y
-- Directivo, todos.
create or replace function public.cesi_course_call_links()
returns table (course_id text, call_link text, can_edit boolean)
language plpgsql
stable
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  v_me uuid := (select auth.uid());
begin
  return query
    select co.id, coalesce(co.data ->> 'callLink', ''), public.cesi_course_link_manager(v_me, co.id)
    from public.courses co
    where co.deleted_at is null and co.user_id in (select id from public.profiles where role = 'ceo')
      and (public.cesi_course_link_manager(v_me, co.id) or co.id in (select public.cesi_student_courses(v_me)));
end;
$$;

-- Cambia el link de la llamada de un curso (su profesor, la ceo y Directivo). '' lo quita.
create or replace function public.cesi_course_set_link(p_course text, p_link text)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_me uuid := (select auth.uid());
  v_link text := trim(coalesce(p_link, ''));
  v_ceo uuid;
  v_old jsonb;
  v_stamp timestamptz;
  v_new timestamptz;
begin
  if not public.cesi_course_link_manager(v_me, p_course) then
    raise exception 'Solo el profesor del curso, la dirección y Directivo cambian el link.' using errcode = '42501';
  end if;
  if v_link <> '' and (v_link !~ '^https?://' or length(v_link) > 500) then
    raise exception 'El link tiene que empezar por https:// (como mucho 500 caracteres).' using errcode = '22023';
  end if;
  select co.user_id, co.data, co.updated_at into v_ceo, v_old, v_stamp
  from public.courses co
  where co.id = p_course and co.deleted_at is null and co.user_id in (select id from public.profiles where role = 'ceo')
  limit 1
  for update;
  if v_ceo is null then
    raise exception 'Ese curso ya no existe.' using errcode = '22023';
  end if;
  -- Más reciente que lo que tenga la ceo: le llega como un cambio de otro dispositivo suyo.
  v_new := greatest(clock_timestamp(), v_stamp + interval '1 millisecond');
  update public.courses co
  set data = v_old || jsonb_build_object('callLink', v_link, 'updatedAt', public.cesi_iso(v_new)), updated_at = v_new
  where co.user_id = v_ceo and co.id = p_course;
  if not public.is_ceo() then
    insert into public.team_edit_log (who, who_name, who_area, doc_table, doc_id, doc_name, action, before, after)
    values (v_me, public.cesi_person_name(v_me), (select area from public.profiles where id = v_me), 'courses', p_course,
      left(coalesce(v_old ->> 'name', ''), 200), 'edicion',
      jsonb_build_object('callLink', coalesce(v_old ->> 'callLink', '')), jsonb_build_object('callLink', v_link));
  end if;
end;
$$;

revoke all on function public.cesi_course_call_links() from public, anon;
revoke all on function public.cesi_course_set_link(text, text) from public, anon;
grant execute on function public.cesi_course_call_links() to authenticated;
grant execute on function public.cesi_course_set_link(text, text) to authenticated;

notify pgrst, 'reload schema';

-- Comprobación: el equipo ya puede apuntarse (true), nadie se apunta a su propio curso (true), la
-- ficha nueva del equipo lleva fromTeam (true), las funciones con permiso (5) y cuántas personas
-- del equipo están ya en algún curso.
select
  position('''equipo''' in pg_get_functiondef('public.cesi_student_me()'::regprocedure)) > 0 as equipo_se_apunta,
  position('cesi_teacher_courses(v_me)' in pg_get_functiondef('public.cesi_student_enroll(text)'::regprocedure)) > 0 as sin_su_propio_curso,
  position('fromTeam' in pg_get_functiondef('public.cesi_student_ficha(uuid, uuid)'::regprocedure)) > 0 as ficha_del_equipo,
  (select count(*) from unnest(array[
     'public.cesi_my_teacher_courses()', 'public.cesi_course_call_links()', 'public.cesi_course_set_link(text, text)',
     'public.cesi_student_enroll(text)', 'public.cesi_student_course_list()'
   ]) as f (sig) where has_function_privilege('authenticated', f.sig, 'execute')) as funciones_con_permiso,
  (select count(*) from public.profiles p where p.role = 'equipo' and exists (select 1 from public.cesi_student_courses(p.id))) as equipo_en_cursos;
