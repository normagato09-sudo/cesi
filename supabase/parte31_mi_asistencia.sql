-- =============================================================================
-- CIFA · Parte 31: el alumno ve su asistencia (fase de alumnos)
-- =============================================================================
-- Ejecutar en Supabase → SQL Editor (proyecto fvswxhfjclvadcoyuqyu), después de la parte 30
-- (supabase/parte30_horario_de_cursos.sql). Se puede ejecutar más de una vez. No borra ni cambia
-- datos, tablas ni funciones de antes: solo añade una función.
--
-- Qué hace:
--   · cesi_my_attendance(): para una cuenta de alumno, SU asistencia (la del alumno unido a su
--     cuenta) en los cursos en los que está: curso, clase, fecha, estado y si está justificada. Nunca
--     la de otros alumnos ni el motivo de la justificación. Solo lectura.
--   · Pasar lista sigue igual: solo el profesor de ese curso y la ceo (Directivo solo ve).

do $$
begin
  if to_regprocedure('public.cesi_course_people(text)') is null then
    raise exception 'Falta la parte 30 (supabase/parte30_horario_de_cursos.sql): ejecútala antes.';
  end if;
end;
$$;

create or replace function public.cesi_my_attendance()
returns table (
  course_id text, course_name text, class_key text, class_start timestamptz,
  time_zone text, status text, justified boolean, late_minutes integer
)
language plpgsql
stable
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  v_me uuid := public.cesi_student_me();
  v_student text;
begin
  select p.linked_student_id into v_student from public.profiles p where p.id = v_me;
  if v_student is null then
    return;
  end if;
  return query
    select a.data ->> 'courseId',
      coalesce(nullif(trim(co.data ->> 'name'), ''), 'Curso'),
      a.data ->> 'classKey',
      public.cesi_try_ts(a.data ->> 'classStart'),
      coalesce(nullif(a.data ->> 'timeZone', ''), 'Europe/Madrid'),
      a.data ->> 'status',
      coalesce(a.data ->> 'justified' = 'true', false) and a.data ->> 'status' in ('late', 'absent'),
      case
        when a.data ->> 'status' = 'late' and a.data ->> 'lateMinutes' ~ '^[0-9]+([.][0-9]+)?$'
          then round((a.data ->> 'lateMinutes')::numeric)::integer
      end
    from public.attendance a
    join public.courses co on co.id = a.data ->> 'courseId' and co.user_id = a.user_id and co.deleted_at is null
    where a.user_id in (select id from public.profiles where role = 'ceo')
      and a.deleted_at is null
      -- Solo la suya y solo de los cursos en los que está.
      and a.data ->> 'studentId' = v_student
      and a.data ->> 'courseId' in (select public.cesi_student_courses(v_me))
      and a.data ->> 'status' in ('present', 'late', 'absent')
    order by 4 desc nulls last;
end;
$$;

revoke all on function public.cesi_my_attendance() from public, anon;
grant execute on function public.cesi_my_attendance() to authenticated;

notify pgrst, 'reload schema';

-- Comprobación: la función con permiso (true) y cuántos alumnos con cuenta tienen ya asistencia.
select
  has_function_privilege('authenticated', 'public.cesi_my_attendance()', 'execute') as mi_asistencia,
  (select count(distinct p.id) from public.profiles p
     join public.attendance a on a.data ->> 'studentId' = p.linked_student_id and a.deleted_at is null
     where p.role = 'alumno') as alumnos_con_asistencia;
