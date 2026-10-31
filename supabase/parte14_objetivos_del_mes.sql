-- =============================================================================
-- CIFA · Parte 14: objetivos del mes por área
-- =============================================================================
-- Ejecutar en Supabase → SQL Editor (proyecto fvswxhfjclvadcoyuqyu), después de la parte 13
-- (supabase/parte13_tareas_varias_personas.sql). Se puede ejecutar más de una vez. No borra datos.
-- Si alguna vez se vuelve a ejecutar la parte 13, hay que ejecutar después otra vez esta.
--
-- Qué hace:
--   · team_goals: objetivos del mes de cada área (de 1 a 3 por área y mes): título, descripción,
--     mes, área, responsable (opcional) y estado (en curso / conseguido / no conseguido).
--   · team_tasks.goal_id: la tarea unida a un objetivo de su área y de su mes (el de su fecha
--     límite o, sin fecha, el actual). Si se borra el objetivo, la tarea se queda sin objetivo.
--   · Progreso de un objetivo: partes hechas / total de partes de sus tareas (una tarea sin nadie
--     asignado cuenta como una parte).
--   · «Sin cerrar»: objetivos de un mes ya pasado que siguen en curso.
--   · Directivo y la ceo crean, editan, cierran y borran objetivos de cualquier área. Los demás
--     ven los de su área (y los que tienen como responsables) y unen a ellos sus tareas.
--   · Funciones nuevas: cesi_team_goals, cesi_goal_save, cesi_goal_delete. Cambiadas:
--     cesi_team_tasks (con el objetivo) y cesi_task_save (con p_goal).

do $$
begin
  if to_regclass('public.team_task_assignees') is null or to_regprocedure('public.cesi_task_recalc(uuid)') is null then
    raise exception 'Falta la parte 13 (supabase/parte13_tareas_varias_personas.sql): ejecútala antes.';
  end if;
end;
$$;

-- -----------------------------------------------------------------------------
-- Objetivos
-- -----------------------------------------------------------------------------
--   month       primer día del mes (2030-11-01)
--   owner_id    responsable (null: sin responsable); owner_gone_name si se eliminó su cuenta
--   status      'en_curso' | 'conseguido' | 'no_conseguido';  closed_at: cuándo se cerró
create table if not exists public.team_goals (
  id uuid primary key default gen_random_uuid(),
  area text references public.areas (id) on update cascade on delete set null,
  month date not null check (extract(day from month) = 1),
  title text not null check (length(trim(title)) between 1 and 200),
  description text not null default '' check (length(description) <= 2000),
  owner_id uuid references public.profiles (id) on delete set null,
  owner_gone_name text not null default '',
  status text not null default 'en_curso' check (status in ('en_curso', 'conseguido', 'no_conseguido')),
  closed_at timestamptz,
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists team_goals_area_month_idx on public.team_goals (area, month);

alter table public.team_tasks add column if not exists goal_id uuid references public.team_goals (id) on delete set null;
create index if not exists team_tasks_goal_idx on public.team_tasks (goal_id);

-- -----------------------------------------------------------------------------
-- Ayudas
-- -----------------------------------------------------------------------------

-- ¿Puede `p_me` ver ese objetivo? Directivo y la ceo, todos; los demás, los de su área y los que
-- tienen como responsables.
create or replace function public.cesi_goal_visible(p_me uuid, p_goal public.team_goals)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select public.cesi_is_boss(p_me)
    or p_goal.owner_id = p_me
    or (p_goal.area is not null and p_goal.area = (select area from public.profiles where id = p_me and role = 'equipo'));
$$;

-- Primer día del mes actual en la zona de `p_me`.
create or replace function public.cesi_month_of(p_me uuid)
returns date
language sql
stable
security definer
set search_path = ''
as $$
  select date_trunc('month', (now() at time zone public.cesi_zone_of(p_me))::date)::date;
$$;

revoke all on function public.cesi_month_of(uuid) from public, anon, authenticated;

-- -----------------------------------------------------------------------------
-- Reglas de acceso (solo leer; escribir, con las funciones)
-- -----------------------------------------------------------------------------
alter table public.team_goals enable row level security;

drop policy if exists "team_goals: leer los que puedo ver" on public.team_goals;
create policy "team_goals: leer los que puedo ver" on public.team_goals
  for select to authenticated
  using (public.cesi_goal_visible((select auth.uid()), team_goals));

revoke all on public.team_goals from anon;
revoke all on public.team_goals from authenticated;
grant select on public.team_goals to authenticated;

-- -----------------------------------------------------------------------------
-- Objetivos que ve la cuenta actual (o, solo la ceo, otra con p_as: «Ver como»)
-- -----------------------------------------------------------------------------
-- p_month: primer día del mes. p_area: solo esa área (null: todas las que puedo ver).
-- p_with_unclosed: también los de meses anteriores que siguen en curso («Sin cerrar»).
--   unclosed      de un mes ya pasado y en curso
--   parts_done / parts_total  partes hechas / total de sus tareas;  tasks_count: cuántas tareas
--   can_edit      Directivo o la ceo
create or replace function public.cesi_team_goals(p_month date, p_area text default null, p_with_unclosed boolean default true, p_as uuid default null)
returns table (
  id uuid, area text, area_name text, month date, title text, description text,
  owner_id uuid, owner_name text, status text, unclosed boolean, closed_at timestamptz,
  parts_done integer, parts_total integer, tasks_count integer,
  created_by_name text, can_edit boolean
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
  v_now date;
  v_month date := date_trunc('month', p_month)::date;
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
  if v_month is null then
    raise exception 'Elige el mes.' using errcode = '22023';
  end if;
  v_boss := public.cesi_is_boss(v_me);
  v_now := public.cesi_month_of(v_me);
  return query
    select g.id, g.area, coalesce(a.name, ''), g.month, g.title, g.description,
      g.owner_id, case when g.owner_id is null and g.owner_gone_name = '' then '' else public.cesi_name_or_gone(g.owner_id, g.owner_gone_name) end,
      g.status, g.month < v_now and g.status = 'en_curso', g.closed_at,
      coalesce(pr.done, 0)::integer, coalesce(pr.total, 0)::integer, coalesce(pr.tasks, 0)::integer,
      case when g.created_by is null then '' else public.cesi_person_name(g.created_by) end,
      v_boss
    from public.team_goals g
    left join public.areas a on a.id = g.area
    left join lateral (
      select
        sum(case when x.total > 0 then x.done else (t.status = 'hecha')::integer end) as done,
        sum(greatest(x.total, 1)) as total,
        count(*) as tasks
      from public.team_tasks t
      cross join lateral (
        select count(*) filter (where ta.profile_id is not null) as total,
          count(*) filter (where ta.profile_id is not null and ta.status = 'hecha') as done
        from public.team_task_assignees ta
        where ta.task_id = t.id
      ) x
      where t.goal_id = g.id
    ) pr on true
    where public.cesi_goal_visible(v_me, g)
      and (p_area is null or g.area = p_area)
      and (g.month = v_month or (p_with_unclosed and g.month < v_month and g.status = 'en_curso'))
    order by g.month, a.sort nulls last, g.created_at;
end;
$$;

-- -----------------------------------------------------------------------------
-- Crear (p_id null) o editar un objetivo (Directivo o la ceo). Como mucho 3 por área y mes.
-- Al cerrarlo (conseguido / no conseguido) se guarda cuándo; si vuelve a «en curso», se borra.
-- Si cambia de área o de mes, sus tareas de otra área o de otro mes se quedan sin objetivo.
-- -----------------------------------------------------------------------------
create or replace function public.cesi_goal_save(
  p_id uuid, p_area text, p_month date, p_title text, p_description text, p_owner uuid, p_status text
)
returns uuid
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_me uuid := (select auth.uid());
  v_id uuid := p_id;
  v_month date := date_trunc('month', p_month)::date;
  v_old public.team_goals;
begin
  if not public.cesi_is_boss(v_me) then
    raise exception 'Solo Directivo y la dirección pueden crear o cambiar objetivos.' using errcode = '42501';
  end if;
  if length(trim(coalesce(p_title, ''))) = 0 then
    raise exception 'Escribe un título.' using errcode = '22023';
  end if;
  if coalesce(p_status, '') not in ('en_curso', 'conseguido', 'no_conseguido') then
    raise exception 'Estado no válido.' using errcode = '22023';
  end if;
  if p_area is null or not exists (select 1 from public.areas where id = p_area) then
    raise exception 'Elige el área.' using errcode = '22023';
  end if;
  if v_month is null then
    raise exception 'Elige el mes.' using errcode = '22023';
  end if;
  if p_owner is not null and not exists (select 1 from public.profiles where id = p_owner and role in ('equipo', 'ceo')) then
    raise exception 'El responsable tiene que ser del equipo o de la dirección.' using errcode = '22023';
  end if;

  -- Uno a la vez por área y mes, para contar bien los 3.
  perform pg_advisory_xact_lock(hashtext('cesi_goal:' || p_area || ':' || v_month::text));
  if (select count(*) from public.team_goals g
      where g.area = p_area and g.month = v_month and g.id is distinct from v_id) >= 3 then
    raise exception 'Esa área ya tiene 3 objetivos ese mes.' using errcode = '22023';
  end if;

  if v_id is null then
    insert into public.team_goals (area, month, title, description, owner_id, status, closed_at, created_by)
    values (p_area, v_month, trim(p_title), coalesce(p_description, ''), p_owner, p_status,
            case when p_status <> 'en_curso' then now() end, v_me)
    returning id into v_id;
  else
    select * into v_old from public.team_goals where id = v_id for update;
    if not found then
      raise exception 'Ese objetivo ya no existe.' using errcode = '22023';
    end if;
    update public.team_goals
    set area = p_area, month = v_month, title = trim(p_title), description = coalesce(p_description, ''),
        owner_id = p_owner,
        owner_gone_name = case when p_owner is null then owner_gone_name else '' end,
        status = p_status,
        closed_at = case when p_status = 'en_curso' then null when v_old.status = 'en_curso' then now() else closed_at end,
        updated_at = now()
    where id = v_id;
    if p_area is distinct from v_old.area or v_month <> v_old.month then
      update public.team_tasks t
      set goal_id = null, updated_at = now()
      where t.goal_id = v_id
        and (t.area is distinct from p_area
             or (t.due_date is not null and date_trunc('month', t.due_date)::date <> v_month));
    end if;
  end if;
  return v_id;
end;
$$;

-- Borrar un objetivo (Directivo o la ceo). Sus tareas se quedan, sin objetivo.
create or replace function public.cesi_goal_delete(p_id uuid)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
begin
  if not public.cesi_is_boss((select auth.uid())) then
    raise exception 'Solo Directivo y la dirección pueden borrar objetivos.' using errcode = '42501';
  end if;
  delete from public.team_goals where id = p_id;
  if not found then
    raise exception 'Ese objetivo ya no existe.' using errcode = '22023';
  end if;
end;
$$;

-- -----------------------------------------------------------------------------
-- Tareas que ve la cuenta actual (como en la parte 13, con su objetivo)
-- -----------------------------------------------------------------------------
--   goal_id, goal_title  objetivo al que está unida (o null)
drop function if exists public.cesi_team_tasks(uuid);
create function public.cesi_team_tasks(p_as uuid default null)
returns table (
  id uuid, title text, description text, area text, area_name text,
  assigned_area text, assigned_area_name text, assignees jsonb, my_status text,
  done_count integer, total_count integer, missing_names text,
  goal_id uuid, goal_title text,
  created_by uuid, created_by_name text,
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
      t.assigned_area, coalesce(aa.name, ''), coalesce(p.list, '[]'::jsonb), p.mine,
      coalesce(p.done, 0), coalesce(p.total, 0), coalesce(p.missing, ''),
      t.goal_id, coalesce(g.title, ''),
      t.created_by, public.cesi_name_or_gone(t.created_by, t.creator_gone_name),
      t.due_date, t.priority, t.status, t.created_at, t.updated_at,
      v_boss or coalesce(t.created_by = v_me, false),
      v_boss or coalesce(t.created_by = v_me, false) or p.mine is not null
    from public.team_tasks t
    left join public.areas a on a.id = t.area
    left join public.areas aa on aa.id = t.assigned_area
    left join public.team_goals g on g.id = t.goal_id
    left join lateral (
      select
        jsonb_agg(jsonb_build_object(
          'id', x.profile_id, 'name', x.name, 'area', x.area, 'status', x.status, 'gone', x.profile_id is null
        ) order by x.name) as list,
        max(x.status) filter (where x.profile_id = v_me) as mine,
        (count(*) filter (where x.profile_id is not null and x.status = 'hecha'))::integer as done,
        (count(*) filter (where x.profile_id is not null))::integer as total,
        string_agg(x.name, ', ' order by x.name) filter (where x.profile_id is not null and x.status <> 'hecha') as missing
      from (
        select ta.profile_id, ta.status, pr.area, public.cesi_name_or_gone(ta.profile_id, ta.gone_name) as name
        from public.team_task_assignees ta
        left join public.profiles pr on pr.id = ta.profile_id
        where ta.task_id = t.id
      ) x
    ) p on true
    where public.cesi_task_visible(v_me, t)
    order by t.due_date nulls last, t.created_at;
end;
$$;

-- -----------------------------------------------------------------------------
-- Crear o editar una tarea (como en la parte 13, con p_goal)
-- -----------------------------------------------------------------------------
-- p_goal: objetivo de la misma área y del mes de la fecha límite (sin fecha: el mes actual), o
-- null. Si no cambia (ya estaba unida a él), no se vuelve a comprobar el mes.
drop function if exists public.cesi_task_save(uuid, text, text, text, uuid[], text, date, text, text);
create or replace function public.cesi_task_save(
  p_id uuid, p_title text, p_description text, p_area text, p_assignees uuid[], p_assign_area text,
  p_due_date date, p_priority text, p_status text, p_goal uuid default null
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
  v_people uuid[];
  v_assign_area text := nullif(p_assign_area, '');
  v_goal public.team_goals;
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
    if v_assign_area is not null then
      if not exists (select 1 from public.areas where id = v_assign_area) then
        raise exception 'Esa área no existe.' using errcode = '22023';
      end if;
      select coalesce(array_agg(id), '{}') into v_people
      from public.profiles where role = 'equipo' and area = v_assign_area;
      if cardinality(v_people) = 0 then
        raise exception 'Nadie del equipo tiene esa área todavía.' using errcode = '22023';
      end if;
    else
      select coalesce(array_agg(distinct x), '{}') into v_people from unnest(coalesce(p_assignees, '{}')) x where x is not null;
      if exists (
        select 1 from unnest(v_people) x
        where not exists (select 1 from public.profiles where id = x and role in ('equipo', 'ceo'))
      ) then
        raise exception 'Solo se puede asignar a personas de equipo o a la dirección.' using errcode = '22023';
      end if;
    end if;
  else
    if v_area is null or p_area <> v_area then
      raise exception 'Solo puedes crear tareas de tu área.' using errcode = '42501';
    end if;
    v_assign_area := null;
    v_people := array[v_me];
  end if;

  if v_id is not null then
    select * into v_old from public.team_tasks where id = v_id for update;
    if not found or not (v_boss or v_old.created_by = v_me) then
      raise exception 'Solo quien la creó, Directivo o la dirección pueden editarla.' using errcode = '42501';
    end if;
  end if;

  -- El objetivo: de la misma área y (si es otro) del mes de la tarea.
  if p_goal is not null then
    select * into v_goal from public.team_goals where id = p_goal;
    if not found or not public.cesi_goal_visible(v_me, v_goal) then
      raise exception 'Ese objetivo no existe.' using errcode = '22023';
    end if;
    if v_goal.area is distinct from p_area then
      raise exception 'El objetivo es de otra área.' using errcode = '22023';
    end if;
    if p_goal is distinct from v_old.goal_id
       and v_goal.month <> coalesce(date_trunc('month', p_due_date)::date, public.cesi_month_of(v_me)) then
      raise exception 'El objetivo es de otro mes que la tarea.' using errcode = '22023';
    end if;
  end if;

  if v_id is null then
    insert into public.team_tasks (title, description, area, assigned_area, goal_id, created_by, due_date, priority, status)
    values (trim(p_title), coalesce(p_description, ''), p_area, v_assign_area, p_goal, v_me, p_due_date, p_priority,
            case when cardinality(v_people) > 0 then 'pendiente' else p_status end)
    returning id into v_id;
  else
    -- Quien la creó sin ser Directivo ni la ceo no cambia a quién está asignada.
    if not v_boss then
      select coalesce(array_agg(profile_id), '{}') into v_people
      from public.team_task_assignees where task_id = v_id and profile_id is not null;
      v_assign_area := v_old.assigned_area;
    end if;
    update public.team_tasks
    set title = trim(p_title), description = coalesce(p_description, ''), area = p_area, assigned_area = v_assign_area,
        goal_id = p_goal, due_date = p_due_date, priority = p_priority, status = p_status, updated_at = now()
    where id = v_id;
    delete from public.team_task_assignees
    where task_id = v_id and profile_id is not null and not (profile_id = any (v_people));
  end if;

  insert into public.team_task_assignees (task_id, profile_id)
  select v_id, x from unnest(v_people) x
  on conflict (task_id, profile_id) do nothing;
  perform public.cesi_task_recalc(v_id);
  return v_id;
end;
$$;

-- -----------------------------------------------------------------------------
-- Eliminar una cuenta: guardar también su nombre en los objetivos de los que era responsable
-- (antes de que cesi_delete_account la borre; un trigger para no tocar esa función otra vez).
-- -----------------------------------------------------------------------------
create or replace function public.cesi_goals_owner_gone()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.team_goals
  set owner_gone_name = left(coalesce(nullif(public.cesi_person_name(old.id), ''), 'Sin nombre'), 200)
  where owner_id = old.id;
  return old;
end;
$$;

revoke all on function public.cesi_goals_owner_gone() from public, anon, authenticated;

drop trigger if exists profiles_goals_owner_gone on public.profiles;
create trigger profiles_goals_owner_gone
  before delete on public.profiles
  for each row execute function public.cesi_goals_owner_gone();

-- -----------------------------------------------------------------------------
-- Permisos de las funciones
-- -----------------------------------------------------------------------------
revoke all on function public.cesi_goal_visible(uuid, public.team_goals) from public, anon;
revoke all on function public.cesi_team_goals(date, text, boolean, uuid) from public, anon;
revoke all on function public.cesi_goal_save(uuid, text, date, text, text, uuid, text) from public, anon;
revoke all on function public.cesi_goal_delete(uuid) from public, anon;
revoke all on function public.cesi_team_tasks(uuid) from public, anon;
revoke all on function public.cesi_task_save(uuid, text, text, text, uuid[], text, date, text, text, uuid) from public, anon;
grant execute on function public.cesi_goal_visible(uuid, public.team_goals) to authenticated;
grant execute on function public.cesi_team_goals(date, text, boolean, uuid) to authenticated;
grant execute on function public.cesi_goal_save(uuid, text, date, text, text, uuid, text) to authenticated;
grant execute on function public.cesi_goal_delete(uuid) to authenticated;
grant execute on function public.cesi_team_tasks(uuid) to authenticated;
grant execute on function public.cesi_task_save(uuid, text, text, text, uuid[], text, date, text, text, uuid) to authenticated;

notify pgrst, 'reload schema';

-- Comprobación: la tabla y la columna nuevas, cuántos objetivos hay y las funciones con permiso
-- (deben salir 4).
select
  to_regclass('public.team_goals') is not null as tabla_objetivos,
  exists (select 1 from information_schema.columns
          where table_schema = 'public' and table_name = 'team_tasks' and column_name = 'goal_id') as columna_objetivo,
  (select count(*) from public.team_goals) as objetivos,
  (select count(*) from unnest(array[
     'public.cesi_team_goals(date, text, boolean, uuid)',
     'public.cesi_goal_save(uuid, text, date, text, text, uuid, text)',
     'public.cesi_goal_delete(uuid)',
     'public.cesi_task_save(uuid, text, text, text, uuid[], text, date, text, text, uuid)'
   ]) as f (sig) where has_function_privilege('authenticated', f.sig, 'execute')) as funciones_con_permiso;
