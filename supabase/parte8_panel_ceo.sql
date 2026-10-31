-- =============================================================================
-- CIFA · Parte 8: arreglos del panel de la ceo
-- =============================================================================
-- Ejecutar en Supabase → SQL Editor (proyecto fvswxhfjclvadcoyuqyu), después de la parte 7
-- (supabase/parte7_tareas_fichaje.sql). Se puede ejecutar más de una vez. No borra datos: solo
-- añade columnas, cambia dos claves a «quedar sin cuenta» y crea o cambia funciones.
--
-- Qué hace:
--   · Fichajes: la ceo puede eliminar un fichaje (cesi_clock_delete).
--   · Accesos: la ceo puede eliminar una cuenta de verdad (cesi_delete_account), nunca la suya ni
--     la de otra ceo. Se borran su cuenta (auth.users), su perfil, sus permisos propios y sus
--     respuestas a reuniones; sus fichajes y tareas se quedan con «Nombre (cuenta eliminada)»; las
--     reuniones que organizó: las futuras se cancelan y las pasadas se quedan.
--   · Tareas: Directivo y la ceo pueden asignar tareas a la ceo (y la ceo, a sí misma).

do $$
begin
  if to_regclass('public.clock_entries') is null or to_regclass('public.team_tasks') is null then
    raise exception 'Falta la parte 7 (supabase/parte7_tareas_fichaje.sql): ejecútala antes.';
  end if;
end;
$$;

-- ---------------------------------------------------------------------------
-- Parte 8: panel de la ceo (borrar fichajes, eliminar cuentas, tareas para la ceo)
-- ---------------------------------------------------------------------------
-- Al eliminar una cuenta, sus fichajes, sus tareas y las reuniones que organizó se quedan: la
-- clave pasa a null («quedar sin cuenta») y se guarda el nombre que tenía, que se ve como
-- «Nombre (cuenta eliminada)».
--   clock_entries.owner_gone_name     nombre de la persona del fichaje
--   team_tasks.assignee_gone_name     nombre de la persona asignada
--   team_tasks.creator_gone_name      nombre de quien la creó
--   shared_meetings.organizer_gone_name  nombre de quien la organizó
alter table public.clock_entries add column if not exists owner_gone_name text not null default '';
alter table public.team_tasks add column if not exists assignee_gone_name text not null default '';
alter table public.team_tasks add column if not exists creator_gone_name text not null default '';
alter table public.shared_meetings add column if not exists organizer_gone_name text not null default '';

-- Fichajes y reuniones: «quedar sin cuenta» en vez de borrarse en cascada (las tareas ya lo hacían).
alter table public.clock_entries alter column profile_id drop not null;
alter table public.clock_entries drop constraint if exists clock_entries_profile_id_fkey;
alter table public.clock_entries
  add constraint clock_entries_profile_id_fkey foreign key (profile_id) references public.profiles (id) on delete set null;
alter table public.shared_meetings alter column organizer_id drop not null;
alter table public.shared_meetings drop constraint if exists shared_meetings_organizer_id_fkey;
alter table public.shared_meetings
  add constraint shared_meetings_organizer_id_fkey foreign key (organizer_id) references public.profiles (id) on delete set null;

-- Nombre de una persona, o el que tenía con «(cuenta eliminada)» si ya no tiene cuenta.
create or replace function public.cesi_name_or_gone(p_profile uuid, p_gone text)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select case
    when p_profile is not null then coalesce(public.cesi_person_name(p_profile), '')
    when coalesce(p_gone, '') <> '' then p_gone || ' (cuenta eliminada)'
    else ''
  end;
$$;

-- Las mismas funciones de las partes 6 y 7, con el nombre de las cuentas eliminadas.
create or replace function public.cesi_my_meetings(p_from timestamptz, p_to timestamptz, p_as uuid default null)
returns table (
  id uuid, title text, description text, link text, starts_at timestamptz, ends_at timestamptz,
  cancelled boolean, organizer_id uuid, organizer_name text, my_status text, participants jsonb
)
language plpgsql
stable
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  v_me uuid := (select auth.uid());
begin
  if p_as is not null and p_as <> v_me then
    if not public.is_ceo() then
      raise exception 'Sin permiso.' using errcode = '42501';
    end if;
    v_me := p_as;
  end if;
  if p_from is null or p_to is null or p_to <= p_from or p_to - p_from > interval '62 days' then
    raise exception 'Rango de fechas no válido.' using errcode = '22023';
  end if;
  return query
    select m.id, m.title, m.description, m.link, m.starts_at, m.ends_at, m.cancelled_at is not null,
      m.organizer_id, public.cesi_name_or_gone(m.organizer_id, m.organizer_gone_name), me.status,
      coalesce((
        select jsonb_agg(jsonb_build_object('id', pp.profile_id, 'name', public.cesi_person_name(pp.profile_id), 'status', pp.status)
          order by pp.profile_id = m.organizer_id desc, public.cesi_person_name(pp.profile_id))
        from public.shared_meeting_participants pp where pp.meeting_id = m.id
      ), '[]'::jsonb)
    from public.shared_meetings m
    join public.shared_meeting_participants me on me.meeting_id = m.id and me.profile_id = v_me
    where m.starts_at < p_to and m.ends_at > p_from
    order by m.starts_at;
end;
$$;

create or replace function public.cesi_team_tasks(p_as uuid default null)
returns table (
  id uuid, title text, description text, area text, area_name text,
  assignee_id uuid, assignee_name text, created_by uuid, created_by_name text,
  due_date date, priority text, status text, created_at timestamptz, updated_at timestamptz,
  can_edit boolean, can_status boolean
)
language plpgsql
stable
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  v_me uuid := (select auth.uid());
  v_boss boolean;
begin
  if p_as is not null and p_as <> v_me then
    if not public.is_ceo() then
      raise exception 'Sin permiso.' using errcode = '42501';
    end if;
    v_me := p_as;
  end if;
  if coalesce((select p.role from public.profiles p where p.id = v_me), '') not in ('ceo', 'equipo') then
    raise exception 'Sin permiso.' using errcode = '42501';
  end if;
  v_boss := public.cesi_is_boss(v_me);
  return query
    select t.id, t.title, t.description, t.area, coalesce(a.name, ''),
      t.assignee_id, public.cesi_name_or_gone(t.assignee_id, t.assignee_gone_name),
      t.created_by, public.cesi_name_or_gone(t.created_by, t.creator_gone_name),
      t.due_date, t.priority, t.status, t.created_at, t.updated_at,
      v_boss or coalesce(t.created_by = v_me, false),
      v_boss or coalesce(t.created_by = v_me, false) or coalesce(t.assignee_id = v_me, false)
    from public.team_tasks t
    left join public.areas a on a.id = t.area
    where public.cesi_task_visible(v_me, t)
    order by t.due_date nulls last, t.created_at;
end;
$$;

create or replace function public.cesi_clock_entries(p_from timestamptz, p_to timestamptz, p_all boolean default false, p_as uuid default null)
returns table (
  id uuid, profile_id uuid, name text, clock_in timestamptz, clock_out timestamptz, summary text,
  fix_note text, fixed_by_name text, fixed_at timestamptz, can_fix boolean
)
language plpgsql
stable
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  v_me uuid := (select auth.uid());
begin
  if p_as is not null and p_as <> v_me then
    if not public.is_ceo() then
      raise exception 'Sin permiso.' using errcode = '42501';
    end if;
    v_me := p_as;
  end if;
  if p_from is null or p_to is null or p_to <= p_from or p_to - p_from > interval '62 days' then
    raise exception 'Rango de fechas no válido.' using errcode = '22023';
  end if;
  if p_all and not public.cesi_is_boss(v_me) then
    raise exception 'Solo Directivo y la dirección ven los fichajes de todos.' using errcode = '42501';
  end if;
  return query
    select e.id, e.profile_id, public.cesi_name_or_gone(e.profile_id, e.owner_gone_name), e.clock_in, e.clock_out, e.summary,
      e.fix_note, case when e.fixed_by is null then '' else public.cesi_person_name(e.fixed_by) end, e.fixed_at,
      public.cesi_clock_can_fix(v_me, e)
    from public.clock_entries e
    where (p_all or e.profile_id = v_me)
      and e.clock_in < p_to and coalesce(e.clock_out, e.clock_in) >= p_from
    order by e.clock_in desc;
end;
$$;

-- A quién puede asignar tareas la cuenta actual: Directivo y la ceo, a cualquier persona de
-- equipo y a la ceo (también a sí mismos); los demás, solo a sí mismos. [{ id, name, area }]
create or replace function public.cesi_task_people()
returns table (id uuid, name text, area text)
language sql
stable
security definer
set search_path = ''
as $$
  select p.id, public.cesi_person_name(p.id), p.area
  from public.profiles p
  where p.role in ('equipo', 'ceo')
    and (public.cesi_is_boss((select auth.uid())) or p.id = (select auth.uid()))
  order by 2;
$$;

-- Crear o editar una tarea (como en la parte 7, pero Directivo y la ceo también pueden asignarla
-- a la ceo).
create or replace function public.cesi_task_save(
  p_id uuid, p_title text, p_description text, p_area text, p_assignee uuid,
  p_due_date date, p_priority text, p_status text
)
returns uuid
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_me uuid := (select auth.uid());
  v_role text;
  v_area text;
  v_boss boolean;
  v_id uuid := p_id;
  v_old public.team_tasks;
  v_assignee uuid := p_assignee;
begin
  select role, area into v_role, v_area from public.profiles where id = v_me;
  if coalesce(v_role, '') not in ('ceo', 'equipo') then
    raise exception 'Sin permiso.' using errcode = '42501';
  end if;
  v_boss := public.cesi_is_boss(v_me);
  if length(trim(coalesce(p_title, ''))) = 0 then
    raise exception 'Escribe un título.' using errcode = '22023';
  end if;
  if coalesce(p_priority, '') not in ('baja', 'media', 'alta') or coalesce(p_status, '') not in ('pendiente', 'en_curso', 'hecha') then
    raise exception 'Prioridad o estado no válidos.' using errcode = '22023';
  end if;
  if p_area is null or not exists (select 1 from public.areas where id = p_area) then
    raise exception 'Elige el área.' using errcode = '22023';
  end if;
  if v_boss then
    if v_assignee is not null and not exists (select 1 from public.profiles where id = v_assignee and role in ('equipo', 'ceo')) then
      raise exception 'Solo se puede asignar a una persona de equipo o a la dirección.' using errcode = '22023';
    end if;
  else
    if v_area is null or p_area <> v_area then
      raise exception 'Solo puedes crear tareas de tu área.' using errcode = '42501';
    end if;
    v_assignee := v_me;
  end if;

  if v_id is null then
    insert into public.team_tasks (title, description, area, assignee_id, created_by, due_date, priority, status)
    values (trim(p_title), coalesce(p_description, ''), p_area, v_assignee, v_me, p_due_date, p_priority, p_status)
    returning id into v_id;
  else
    select * into v_old from public.team_tasks where id = v_id for update;
    if not found or not (v_boss or v_old.created_by = v_me) then
      raise exception 'Solo quien la creó, Directivo o la dirección pueden editarla.' using errcode = '42501';
    end if;
    update public.team_tasks
    set title = trim(p_title), description = coalesce(p_description, ''), area = p_area, assignee_id = v_assignee,
        due_date = p_due_date, priority = p_priority, status = p_status, updated_at = now()
    where id = v_id;
  end if;
  return v_id;
end;
$$;

-- Eliminar un fichaje: solo la ceo.
create or replace function public.cesi_clock_delete(p_id uuid)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
begin
  if not public.is_ceo() then
    raise exception 'Solo la dirección puede eliminar fichajes.' using errcode = '42501';
  end if;
  delete from public.clock_entries where id = p_id;
  if not found then
    raise exception 'Ese fichaje ya no existe.' using errcode = '22023';
  end if;
end;
$$;

-- Eliminar una cuenta de verdad (solo la ceo; nunca la suya ni la de otra ceo). Borra la fila de
-- auth.users y, en cascada, su perfil (profiles, account_profiles), sus permisos propios y sus
-- respuestas a reuniones (shared_meeting_participants). Antes guarda su nombre en sus fichajes,
-- tareas y reuniones, que se quedan sin cuenta; las reuniones que organizó y aún no han empezado
-- se cancelan (los invitados las ven canceladas) y las pasadas se quedan.
create or replace function public.cesi_delete_account(p_id uuid)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_me uuid := (select auth.uid());
  v_role text;
  v_name text;
begin
  if not public.is_ceo() then
    raise exception 'Solo la dirección puede eliminar cuentas.' using errcode = '42501';
  end if;
  if p_id is null or p_id = v_me then
    raise exception 'No puedes eliminar tu propia cuenta.' using errcode = '42501';
  end if;
  select role into v_role from public.profiles where id = p_id;
  if v_role = 'ceo' then
    raise exception 'No se puede eliminar la cuenta de la dirección.' using errcode = '42501';
  end if;
  if not exists (select 1 from auth.users where id = p_id) then
    raise exception 'Esa cuenta ya no existe.' using errcode = '22023';
  end if;

  v_name := left(coalesce(nullif(public.cesi_person_name(p_id), ''), 'Sin nombre'), 200);
  update public.clock_entries set owner_gone_name = v_name where profile_id = p_id;
  update public.team_tasks set assignee_gone_name = v_name where assignee_id = p_id;
  update public.team_tasks set creator_gone_name = v_name where created_by = p_id;
  update public.shared_meetings
  set organizer_gone_name = v_name,
      cancelled_at = case when starts_at > now() then coalesce(cancelled_at, now()) else cancelled_at end,
      updated_at = now()
  where organizer_id = p_id;

  delete from auth.users where id = p_id;
end;
$$;

-- Permisos de las funciones.
revoke all on function public.cesi_name_or_gone(uuid, text) from public, anon, authenticated;
revoke all on function public.cesi_clock_delete(uuid) from public, anon;
revoke all on function public.cesi_delete_account(uuid) from public, anon;
grant execute on function public.cesi_clock_delete(uuid) to authenticated;
grant execute on function public.cesi_delete_account(uuid) to authenticated;
revoke all on function public.cesi_my_meetings(timestamptz, timestamptz, uuid) from public, anon;
revoke all on function public.cesi_team_tasks(uuid) from public, anon;
revoke all on function public.cesi_clock_entries(timestamptz, timestamptz, boolean, uuid) from public, anon;
revoke all on function public.cesi_task_people() from public, anon;
revoke all on function public.cesi_task_save(uuid, text, text, text, uuid, date, text, text) from public, anon;
grant execute on function public.cesi_my_meetings(timestamptz, timestamptz, uuid) to authenticated;
grant execute on function public.cesi_team_tasks(uuid) to authenticated;
grant execute on function public.cesi_clock_entries(timestamptz, timestamptz, boolean, uuid) to authenticated;
grant execute on function public.cesi_task_people() to authenticated;
grant execute on function public.cesi_task_save(uuid, text, text, text, uuid, date, text, text) to authenticated;

notify pgrst, 'reload schema';

-- Comprobación: las 4 columnas nuevas, las 2 claves con «quedar sin cuenta» (SET NULL) y las 2
-- funciones nuevas con permiso para las cuentas con sesión.
select
  (select count(*) from information_schema.columns
     where table_schema = 'public' and column_name in ('owner_gone_name', 'assignee_gone_name', 'creator_gone_name', 'organizer_gone_name')) as columnas_nuevas,
  (select count(*) from information_schema.referential_constraints
     where constraint_schema = 'public' and constraint_name in ('clock_entries_profile_id_fkey', 'shared_meetings_organizer_id_fkey')
       and delete_rule = 'SET NULL') as claves_sin_cuenta,
  (select count(*) from unnest(array['public.cesi_clock_delete(uuid)', 'public.cesi_delete_account(uuid)']) as f (sig)
     where has_function_privilege('authenticated', f.sig, 'execute')) as funciones_con_permiso;
