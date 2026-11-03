-- =============================================================================
-- CIFA · Parte 32: clases solo desde que empieza el curso (fase de alumnos)
-- =============================================================================
-- Ejecutar en Supabase → SQL Editor (proyecto fvswxhfjclvadcoyuqyu), después de la parte 31
-- (supabase/parte31_mi_asistencia.sql). Se puede ejecutar más de una vez. No borra ni cambia datos
-- ni tablas.
--
-- Qué hace: vuelve a escribir cesi_course_classes (de la parte 6), la que calcula las clases de un
-- curso para el calendario del alumno y del profesor, su pase de lista y su asistencia, igual que
-- courseClasses en src/lib/attendance.js:
--   · Las clases del horario solo salen desde la fecha de inicio del curso (data.startDate) hasta
--     la de fin (data.endDate, si la tiene). Sin fecha de inicio, solo desde hoy (las próximas).
--   · Si se cambió el horario de un curso ya empezado, los horarios de antes (data.pastSchedules:
--     [{ timeZone, slots, since, until }]) valen para sus días: las clases pasadas no se mueven.
--   · Las clases sueltas (extra_classes) salen igual que antes.
-- Mismos parámetros y mismo resultado: las funciones que la usan no cambian.

do $$
begin
  if to_regprocedure('public.cesi_my_attendance()') is null then
    raise exception 'Falta la parte 31 (supabase/parte31_mi_asistencia.sql): ejecútala antes.';
  end if;
  if to_regprocedure('public.cesi_course_classes(public.courses, timestamptz, timestamptz)') is null then
    raise exception 'Falta la parte 6 (supabase/parte6_calendario_compartido.sql): ejecútala antes.';
  end if;
end;
$$;

create or replace function public.cesi_course_classes(p_course public.courses, p_from timestamptz, p_to timestamptz)
returns table (class_key text, starts_at timestamptz, ends_at timestamptz, is_extra boolean, note text)
language plpgsql
stable
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  v_sched jsonb := p_course.data -> 'schedule';
  v_past jsonb := p_course.data -> 'pastSchedules';
  v_minutes int := 60;
  v_start_date date;
  v_end_date date;
  v_period jsonb;
  v_tz text;
  v_since date;
  v_last date;
  v_first date;
  v_day date;
  v_slot jsonb;
  v_local timestamp;
  v_start timestamptz;
begin
  if (p_course.data ->> 'classMinutes') ~ '^[0-9]{1,4}$' and (p_course.data ->> 'classMinutes')::int > 0 then
    v_minutes := (p_course.data ->> 'classMinutes')::int;
  end if;
  if (p_course.data ->> 'startDate') ~ '^\d{4}-\d{2}-\d{2}$' then
    v_start_date := (p_course.data ->> 'startDate')::date;
  end if;
  if (p_course.data ->> 'endDate') ~ '^\d{4}-\d{2}-\d{2}$' then
    v_end_date := (p_course.data ->> 'endDate')::date;
  end if;

  -- Los horarios de antes (con until) y el de ahora (sin until).
  for v_period in
    select value from jsonb_array_elements(
      case when jsonb_typeof(v_past) = 'array' then v_past else '[]'::jsonb end
      || case when jsonb_typeof(v_sched) = 'object' then jsonb_build_array(v_sched) else '[]'::jsonb end
    )
  loop
    continue when jsonb_typeof(v_period) <> 'object' or jsonb_typeof(v_period -> 'slots') <> 'array';
    v_tz := v_period ->> 'timeZone';
    begin
      perform now() at time zone v_tz;
    exception when others then
      v_tz := null;
    end;
    continue when v_tz is null;

    -- Desde cuándo vale este horario: su since; el de ahora, si no lo tiene, desde que se creó el
    -- curso (como antes).
    v_since := null;
    if (v_period ->> 'since') ~ '^\d{4}-\d{2}-\d{2}$' then
      v_since := (v_period ->> 'since')::date;
    elsif v_period ->> 'until' is null then
      begin
        v_since := ((p_course.data ->> 'createdAt')::timestamptz at time zone v_tz)::date;
      exception when others then
        v_since := null;
      end;
    end if;
    -- Hasta cuándo: el día antes de until (los de antes) y nunca después de la fecha de fin.
    v_last := null;
    if (v_period ->> 'until') ~ '^\d{4}-\d{2}-\d{2}$' then
      v_last := (v_period ->> 'until')::date - 1;
    end if;
    if v_end_date is not null then
      v_last := least(coalesce(v_last, v_end_date), v_end_date);
    end if;
    -- Nunca antes de la fecha de inicio; sin ella, desde hoy.
    v_first := greatest(coalesce(v_since, '-infinity'::date), coalesce(v_start_date, (now() at time zone v_tz)::date));

    for v_day in
      select d::date from generate_series(
        greatest(((p_from at time zone v_tz)::date - 1), v_first)::timestamp,
        least(((p_to at time zone v_tz)::date), coalesce(v_last, (p_to at time zone v_tz)::date))::timestamp,
        interval '1 day'
      ) as g (d)
    loop
      for v_slot in select value from jsonb_array_elements(v_period -> 'slots') loop
        continue when coalesce(v_slot ->> 'day', '') !~ '^[0-6]$';
        continue when (v_slot ->> 'day')::int <> extract(dow from v_day)::int;
        continue when coalesce(v_slot ->> 'start', '') !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$';
        v_local := v_day + (v_slot ->> 'start')::time;
        v_start := v_local at time zone v_tz;
        continue when (v_start at time zone v_tz) <> v_local;
        continue when v_start + make_interval(mins => v_minutes) <= p_from or v_start >= p_to;
        class_key := to_char(v_day, 'YYYY-MM-DD') || '_' || (v_slot ->> 'start');
        starts_at := v_start;
        ends_at := v_start + make_interval(mins => v_minutes);
        is_extra := false;
        note := '';
        return next;
      end loop;
    end loop;
  end loop;

  return query
    select 'extra:' || x.id, (x.data ->> 'start')::timestamptz, (x.data ->> 'end')::timestamptz, true, coalesce(x.data ->> 'note', '')
    from public.extra_classes x
    where x.user_id = p_course.user_id and x.deleted_at is null and x.data ->> 'courseId' = p_course.id
      and case when (x.data ->> 'start') ~ '^\d{4}-\d{2}-\d{2}T' and (x.data ->> 'end') ~ '^\d{4}-\d{2}-\d{2}T'
        then (x.data ->> 'start')::timestamptz < p_to and (x.data ->> 'end')::timestamptz > p_from
          and (x.data ->> 'end')::timestamptz > (x.data ->> 'start')::timestamptz
        else false end;
end;
$$;

-- Como en la parte 6: solo la usan otras funciones, nadie la llama directamente.
revoke all on function public.cesi_course_classes(public.courses, timestamptz, timestamptz) from public, anon, authenticated;

notify pgrst, 'reload schema';

-- Comprobación: la función ya mira la fecha de inicio (true) y cuántos cursos no tienen fecha de
-- inicio todavía (esos solo muestran las clases próximas).
select
  position('startDate' in pg_get_functiondef('public.cesi_course_classes(public.courses, timestamptz, timestamptz)'::regprocedure)) > 0 as clases_desde_el_inicio,
  (select count(*) from public.courses c
     where c.deleted_at is null and c.user_id in (select id from public.profiles where role = 'ceo')
       and coalesce(c.data ->> 'startDate', '') !~ '^\d{4}-\d{2}-\d{2}$') as cursos_sin_fecha_de_inicio;
