-- =============================================================================
-- CIFA · Parte 23: Inicios por área (cifras de los tableros) y chats de área sin la ceo
-- =============================================================================
-- Ejecutar en Supabase → SQL Editor (proyecto fvswxhfjclvadcoyuqyu), después de la parte 22
-- (supabase/parte22_invitar_y_participantes.sql). Se puede ejecutar más de una vez. No borra ni
-- cambia datos: solo dos funciones.
--
-- Qué hace:
--   · cesi_board_counts: por área, los elementos abiertos (sin terminar), los atrasados (con fecha
--     anterior a hoy y sin terminar; en Legal, la revisión ya pasada, esté como esté) y los de esta
--     semana (de hoy al domingo, sin terminar). Hoy, en la zona de quien mira. Para el Inicio de
--     Directivo y para «Cómo va cada área» de la ceo.
--   · cesi_chat_can: la ceo deja de estar en las conversaciones de cada área (sigue en «Todo el
--     equipo» y en sus privadas). Directivo sigue en todas. Los tableros, la ceo los sigue viendo.

do $$
begin
  if to_regprocedure('public.cesi_invitable_people_areas()') is null or to_regprocedure('public.cesi_chat_can(uuid, uuid)') is null then
    raise exception 'Faltan las partes 21 y 22: ejecútalas antes.';
  end if;
end;
$$;

-- -----------------------------------------------------------------------------
-- Cifras de los tableros
-- -----------------------------------------------------------------------------
-- La versión anterior (solo abiertos) se sustituye por esta.
drop function if exists public.cesi_board_counts(uuid);
create function public.cesi_board_counts(p_as uuid default null)
returns table (area text, open_count integer, late_count integer, week_count integer)
language plpgsql
stable
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  v_me uuid := public.cesi_home_viewer(p_as);
  v_today date := (now() at time zone public.cesi_zone_of(v_me))::date;
  v_sunday date;
begin
  v_sunday := v_today + (7 - extract(isodow from v_today)::integer);
  return query
    select b.area,
      (select count(*)::integer from public.board_items i
        where i.area = b.area and not (i.status = any (b.done_statuses))),
      (select count(*)::integer from public.board_items i
        where i.area = b.area and i.due_date is not null and i.due_date < v_today
          and (b.area = 'legal' or not (i.status = any (b.done_statuses)))),
      (select count(*)::integer from public.board_items i
        where i.area = b.area and i.due_date between v_today and v_sunday and not (i.status = any (b.done_statuses)))
    from public.board_configs b
    join public.areas a on a.id = b.area
    order by a.sort;
end;
$$;

revoke all on function public.cesi_board_counts(uuid) from public, anon;
grant execute on function public.cesi_board_counts(uuid) to authenticated;

-- -----------------------------------------------------------------------------
-- Chats de área sin la ceo
-- -----------------------------------------------------------------------------
create or replace function public.cesi_chat_can(p_me uuid, p_conversation uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.chat_conversations c
    join public.profiles p on p.id = p_me and p.role in ('ceo', 'equipo')
    where c.id = p_conversation
      and case c.kind
        when 'team' then true
        -- De área: las personas de esa área y Directivo (la ceo, no).
        when 'area' then p.role = 'equipo' and (p.area = 'direccion' or p.area = c.area)
        else exists (select 1 from public.chat_members m where m.conversation_id = c.id and m.profile_id = p_me)
      end
  );
$$;

revoke all on function public.cesi_chat_can(uuid, uuid) from public, anon;
grant execute on function public.cesi_chat_can(uuid, uuid) to authenticated;

notify pgrst, 'reload schema';

-- Comprobación: las cifras de cada tablero (para la ceo, como ejemplo) y cuántas conversaciones de
-- área ve ahora la ceo (debe salir 0).
select
  (select count(*) from public.board_configs) as tableros,
  (select count(*) from public.chat_conversations c
     where c.kind = 'area'
       and public.cesi_chat_can((select id from public.profiles where role = 'ceo' order by created_at limit 1), c.id)) as chats_de_area_de_la_ceo;
