-- =============================================================================
-- CIFA · Parte 10: «Nueva reunión» con el área de cada persona
-- =============================================================================
-- Ejecutar en Supabase → SQL Editor (proyecto fvswxhfjclvadcoyuqyu), después de las partes 5 y 6.
-- Se puede ejecutar más de una vez. No borra ni cambia datos.
--
-- Qué hace: la lista de participantes de «Nueva reunión» enseña el área de cada persona
-- (Directivo, Media…) o «Alumno». Es la misma lista de siempre (cesi_invitable_people: solo a
-- quien puedes invitar) con el nombre de su área. Mientras no se ejecute, la lista sale igual pero
-- sin el área.

create or replace function public.cesi_invitable_people_areas()
returns table (id uuid, name text, role text, area_name text)
language sql
stable
security definer
set search_path = ''
as $$
  select p.id, public.cesi_person_name(p.id), p.role,
    case when p.role = 'equipo' then coalesce(a.name, '') else '' end
  from public.profiles p
  left join public.areas a on a.id = p.area
  where p.role in ('ceo', 'equipo', 'alumno') and public.cesi_can_invite((select auth.uid()), p.id)
  order by 2;
$$;

revoke all on function public.cesi_invitable_people_areas() from public, anon;
grant execute on function public.cesi_invitable_people_areas() to authenticated;

notify pgrst, 'reload schema';

-- Comprobación: la función existe y la pueden usar las cuentas con sesión (debe salir true).
select has_function_privilege('authenticated', 'public.cesi_invitable_people_areas()', 'execute') as con_permiso;
