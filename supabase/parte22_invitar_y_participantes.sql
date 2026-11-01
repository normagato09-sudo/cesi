-- =============================================================================
-- CIFA · Parte 22: «Nueva reunión» para todos (quién invita a quién) y la lista de participantes
-- =============================================================================
-- Ejecutar en Supabase → SQL Editor (proyecto fvswxhfjclvadcoyuqyu), después de la parte 21
-- (supabase/parte21_mensajes_del_equipo.sql). Se puede ejecutar más de una vez. No borra ni
-- cambia datos: solo dos funciones.
--
-- Qué hace:
--   · cesi_can_invite (quién puede invitar a quién; la usan crear reuniones, la lista de personas
--     y la disponibilidad):
--       ceo       → cualquiera
--       equipo    → cualquier persona de equipo y la ceo
--       profesor  → además, los alumnos de sus cursos
--       alumno    → los profesores de sus cursos y (nuevo) sus compañeros de esos cursos; nunca a
--                   la ceo ni a otras personas de equipo (la ceo sí puede invitarle a él)
--   · cesi_invitable_people_areas: la misma lista de la parte 10 y, además, si cada persona ha
--     completado su perfil (profile_done: si no, su disponibilidad sale como «Sin perfil»).

do $$
begin
  if to_regprocedure('public.cesi_chat_send(uuid, text)') is null then
    raise exception 'Falta la parte 21 (supabase/parte21_mensajes_del_equipo.sql): ejecútala antes.';
  end if;
  if to_regprocedure('public.cesi_student_courses(uuid)') is null or to_regprocedure('public.cesi_teacher_courses(uuid)') is null then
    raise exception 'Falta la parte 6 (supabase/parte6_calendario_compartido.sql): ejecútala antes.';
  end if;
end;
$$;

create or replace function public.cesi_can_invite(p_from uuid, p_to uuid)
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_from text;
  v_to text;
begin
  if p_from is null or p_to is null or p_from = p_to then
    return false;
  end if;
  select role into v_from from public.profiles where id = p_from;
  select role into v_to from public.profiles where id = p_to;
  if v_from is null or v_to is null or v_to not in ('ceo', 'equipo', 'alumno') then
    return false;
  end if;
  if v_from = 'ceo' then
    return true;
  end if;
  if v_from = 'equipo' then
    if v_to in ('equipo', 'ceo') then
      return true;
    end if;
    -- Profesor → los alumnos de sus cursos.
    return exists (
      select 1 from public.cesi_teacher_courses(p_from) t (id)
      join public.cesi_student_courses(p_to) s (id) on s.id = t.id
    );
  end if;
  if v_from = 'alumno' and v_to = 'equipo' then
    -- Alumno → los profesores de sus cursos.
    return exists (
      select 1 from public.cesi_student_courses(p_from) s (id)
      join public.cesi_teacher_courses(p_to) t (id) on t.id = s.id
    );
  end if;
  if v_from = 'alumno' and v_to = 'alumno' then
    -- Alumno → sus compañeros (con algún curso en común).
    return exists (
      select 1 from public.cesi_student_courses(p_from) a (id)
      join public.cesi_student_courses(p_to) b (id) on b.id = a.id
    );
  end if;
  return false;
end;
$$;

-- La versión anterior (sin profile_done) se sustituye por esta.
drop function if exists public.cesi_invitable_people_areas();
create function public.cesi_invitable_people_areas()
returns table (id uuid, name text, role text, area_name text, profile_done boolean)
language sql
stable
security definer
set search_path = ''
as $$
  select p.id, public.cesi_person_name(p.id), p.role,
    case when p.role = 'equipo' then coalesce(a.name, '') else '' end,
    exists (select 1 from public.account_profiles ap where ap.id = p.id and ap.completed_at is not null)
  from public.profiles p
  left join public.areas a on a.id = p.area
  where p.role in ('ceo', 'equipo', 'alumno') and public.cesi_can_invite((select auth.uid()), p.id)
  order by 2;
$$;

revoke all on function public.cesi_can_invite(uuid, uuid) from public, anon, authenticated;
revoke all on function public.cesi_invitable_people_areas() from public, anon;
grant execute on function public.cesi_invitable_people_areas() to authenticated;

notify pgrst, 'reload schema';

-- Comprobación: la lista con permiso para las cuentas con sesión (true) y cuántos alumnos tienen
-- algún compañero al que ahora pueden invitar.
select
  has_function_privilege('authenticated', 'public.cesi_invitable_people_areas()', 'execute') as lista_con_permiso,
  (select count(*) from public.profiles a
     where a.role = 'alumno'
       and exists (select 1 from public.profiles b where b.role = 'alumno' and b.id <> a.id and public.cesi_can_invite(a.id, b.id))) as alumnos_con_companeros;
