-- =============================================================================
-- CIFA · Parte 13: tareas para varias personas o para un área entera
-- =============================================================================
-- Ejecutar en Supabase → SQL Editor (proyecto fvswxhfjclvadcoyuqyu), después de las partes 7, 8
-- y 12. Se puede ejecutar más de una vez. No borra datos.
--
-- Qué hace:
--   · team_task_assignees: las personas asignadas a cada tarea, cada una con su parte
--     (pendiente / en curso / hecha) y cuándo la terminó.
--   · Las tareas que ya existen (con una sola persona) pasan a esta tabla con su estado; la
--     columna antigua team_tasks.assignee_id se queda como estaba (ya no se usa).
--   · team_tasks.assigned_area: si se asignó a un área entera (a quienes la tenían entonces).
--   · El estado de una tarea con personas asignadas sale de sus partes: «hecha» cuando todas
--     la han terminado; «en curso» si alguna ha empezado; si no, «pendiente». Sin personas, se
--     cambia a mano como antes. Las partes de cuentas eliminadas no cuentan.
--   · Funciones nuevas o cambiadas: cesi_task_visible, cesi_team_tasks, cesi_task_save,
--     cesi_task_set_status, cesi_delete_account, cesi_home_alerts (las atrasadas dicen quién
--     falta) y cesi_my_week (cuenta las partes hechas de cada persona).
--   · Mismas reglas: solo Directivo y la ceo asignan a otros; los demás, solo a sí mismos.

do $$
begin
  if to_regclass('public.team_tasks') is null then
    raise exception 'Falta la parte 7 (supabase/parte7_tareas_fichaje.sql): ejecútala antes.';
  end if;
  if to_regprocedure('public.cesi_name_or_gone(uuid, text)') is null then
    raise exception 'Falta la parte 8 (supabase/parte8_panel_ceo.sql): ejecútala antes.';
  end if;
  if to_regprocedure('public.cesi_home_viewer(uuid)') is null then
    raise exception 'Falta la parte 12 (supabase/parte12_inicio_equipo.sql): ejecútala antes.';
  end if;
end;
$$;

-- -----------------------------------------------------------------------------
-- Personas asignadas
-- -----------------------------------------------------------------------------
--   profile_id  persona (null si se eliminó su cuenta; gone_name guarda su nombre)
--   status      su parte: 'pendiente' | 'en_curso' | 'hecha';  done_at: cuándo la terminó
create table if not exists public.team_task_assignees (
  id uuid primary key default gen_random_uuid(),
  task_id uuid not null references public.team_tasks (id) on delete cascade,
  profile_id uuid references public.profiles (id) on delete set null,
  gone_name text not null default '',
  status text not null default 'pendiente' check (status in ('pendiente', 'en_curso', 'hecha')),
  done_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint team_task_assignees_unique unique (task_id, profile_id)
);
create index if not exists team_task_assignees_profile_idx on public.team_task_assignees (profile_id);

alter table public.team_tasks add column if not exists assigned_area text references public.areas (id) on update cascade on delete set null;

-- ¿Ya está en el formato nuevo? Las que ya existían empiezan en false y se pasan abajo; las que
-- se creen a partir de ahora, true.
alter table public.team_tasks add column if not exists assignees_moved boolean not null default false;
alter table public.team_tasks alter column assignees_moved set default true;

-- Pasar las tareas que aún no están en el formato nuevo (su persona, su estado y cuándo se hizo).
insert into public.team_task_assignees (task_id, profile_id, gone_name, status, done_at, created_at, updated_at)
select t.id, t.assignee_id, coalesce(t.assignee_gone_name, ''), t.status,
  case when t.status = 'hecha' then coalesce(t.done_at, t.updated_at) end, t.created_at, t.updated_at
from public.team_tasks t
where not t.assignees_moved
  and (t.assignee_id is not null or coalesce(t.assignee_gone_name, '') <> '')
  and not exists (
    select 1 from public.team_task_assignees a
    where a.task_id = t.id and a.profile_id is not distinct from t.assignee_id
  );
update public.team_tasks set assignees_moved = true where not assignees_moved;

-- -----------------------------------------------------------------------------
-- Ayudas
-- -----------------------------------------------------------------------------

-- ¿Puede `p_me` ver esa tarea? Directivo y la ceo, todas; los demás, las suyas (asignadas o
-- creadas) y las de su área.
create or replace function public.cesi_task_visible(p_me uuid, p_task public.team_tasks)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select public.cesi_is_boss(p_me)
    or p_task.created_by = p_me
    or exists (select 1 from public.team_task_assignees a where a.task_id = p_task.id and a.profile_id = p_me)
    or (p_task.area is not null and p_task.area = (select area from public.profiles where id = p_me and role = 'equipo'));
$$;

-- Estado de la tarea según las partes de las personas con cuenta (si no hay, no lo toca).
create or replace function public.cesi_task_recalc(p_task uuid)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_total integer;
  v_done integer;
  v_started integer;
begin
  select count(*), count(*) filter (where status = 'hecha'), count(*) filter (where status <> 'pendiente')
  into v_total, v_done, v_started
  from public.team_task_assignees
  where task_id = p_task and profile_id is not null;
  if v_total = 0 then
    return;
  end if;
  update public.team_tasks
  set status = case when v_done = v_total then 'hecha' when v_started > 0 then 'en_curso' else 'pendiente' end,
      updated_at = now()
  where id = p_task
    and status is distinct from case when v_done = v_total then 'hecha' when v_started > 0 then 'en_curso' else 'pendiente' end;
end;
$$;

revoke all on function public.cesi_task_recalc(uuid) from public, anon, authenticated;

-- Las tareas que ya estaban: el estado según sus partes (no cambia nada si solo tenían una persona).
do $$
declare
  v_id uuid;
begin
  for v_id in select distinct task_id from public.team_task_assignees loop
    perform public.cesi_task_recalc(v_id);
  end loop;
end;
$$;

-- -----------------------------------------------------------------------------
-- Reglas de acceso (solo leer; escribir, con las funciones)
-- -----------------------------------------------------------------------------
alter table public.team_task_assignees enable row level security;

drop policy if exists "team_task_assignees: leer las de tareas que puedo ver" on public.team_task_assignees;
create policy "team_task_assignees: leer las de tareas que puedo ver" on public.team_task_assignees
  for select to authenticated
  using (exists (
    select 1 from public.team_tasks t
    where t.id = team_task_assignees.task_id and public.cesi_task_visible((select auth.uid()), t)
  ));

revoke all on public.team_task_assignees from anon;
revoke all on public.team_task_assignees from authenticated;
grant select on public.team_task_assignees to authenticated;

-- -----------------------------------------------------------------------------
-- Tareas que ve la cuenta actual (o, solo la ceo, otra con p_as: «Ver como»)
-- -----------------------------------------------------------------------------
--   assignees      [{ id, name, area, status, gone }] (gone: cuenta eliminada), por nombre
--   assigned_area  área entera a la que se asignó (o null) y su nombre
--   my_status      mi parte (null si no estoy asignada)
--   done_count / total_count  partes hechas / personas con cuenta
--   missing_names  quién falta (con cuenta), separado por comas
--   can_edit: editar y borrar; can_status: cambiar partes (la mía, o todas si la creé o soy
--   Directivo o la ceo)
drop function if exists public.cesi_team_tasks(uuid);
create function public.cesi_team_tasks(p_as uuid default null)
returns table (
  id uuid, title text, description text, area text, area_name text,
  assigned_area text, assigned_area_name text, assignees jsonb, my_status text,
  done_count integer, total_count integer, missing_names text,
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
      t.created_by, public.cesi_name_or_gone(t.created_by, t.creator_gone_name),
      t.due_date, t.priority, t.status, t.created_at, t.updated_at,
      v_boss or coalesce(t.created_by = v_me, false),
      v_boss or coalesce(t.created_by = v_me, false) or p.mine is not null
    from public.team_tasks t
    left join public.areas a on a.id = t.area
    left join public.areas aa on aa.id = t.assigned_area
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
-- Crear (p_id null) o editar una tarea
-- -----------------------------------------------------------------------------
-- p_assignees: personas (Directivo y la ceo: de equipo o la ceo; los demás, solo ellos mismos).
-- p_assign_area: en vez de personas, un área entera: se asigna a las personas de equipo que la
-- tienen ahora (solo Directivo y la ceo). Al editar, quien sigue asignado conserva su parte; a
-- quien se quita se le borra; las partes de cuentas eliminadas se quedan.
-- p_status solo cuenta si la tarea no tiene personas asignadas (si no, sale de las partes).
drop function if exists public.cesi_task_save(uuid, text, text, text, uuid, date, text, text);
create or replace function public.cesi_task_save(
  p_id uuid, p_title text, p_description text, p_area text, p_assignees uuid[], p_assign_area text,
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
  v_people uuid[];
  v_assign_area text := nullif(p_assign_area, '');
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

  if v_id is null then
    insert into public.team_tasks (title, description, area, assigned_area, created_by, due_date, priority, status)
    values (trim(p_title), coalesce(p_description, ''), p_area, v_assign_area, v_me, p_due_date, p_priority,
            case when cardinality(v_people) > 0 then 'pendiente' else p_status end)
    returning id into v_id;
  else
    select * into v_old from public.team_tasks where id = v_id for update;
    if not found or not (v_boss or v_old.created_by = v_me) then
      raise exception 'Solo quien la creó, Directivo o la dirección pueden editarla.' using errcode = '42501';
    end if;
    -- Quien la creó sin ser Directivo ni la ceo no cambia a quién está asignada.
    if not v_boss then
      select coalesce(array_agg(profile_id), '{}') into v_people
      from public.team_task_assignees where task_id = v_id and profile_id is not null;
      v_assign_area := v_old.assigned_area;
    end if;
    update public.team_tasks
    set title = trim(p_title), description = coalesce(p_description, ''), area = p_area, assigned_area = v_assign_area,
        due_date = p_due_date, priority = p_priority, status = p_status, updated_at = now()
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
-- Cambiar el estado
-- -----------------------------------------------------------------------------
-- Con personas asignadas: cada una cambia su parte (p_profile null: la mía); quien la creó,
-- Directivo y la ceo pueden cambiar la de cualquiera. Sin personas: el de la tarea (quien la creó,
-- Directivo o la ceo).
drop function if exists public.cesi_task_set_status(uuid, text);
create or replace function public.cesi_task_set_status(p_id uuid, p_status text, p_profile uuid default null)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_me uuid := (select auth.uid());
  v_task public.team_tasks;
  v_manager boolean;
  v_target uuid := coalesce(p_profile, v_me);
begin
  if coalesce(p_status, '') not in ('pendiente', 'en_curso', 'hecha') then
    raise exception 'Estado no válido.' using errcode = '22023';
  end if;
  select * into v_task from public.team_tasks where id = p_id for update;
  if not found then
    raise exception 'No puedes cambiar el estado de esa tarea.' using errcode = '42501';
  end if;
  v_manager := public.cesi_is_boss(v_me) or coalesce(v_task.created_by = v_me, false);

  if exists (select 1 from public.team_task_assignees where task_id = p_id and profile_id is not null) then
    if v_target <> v_me and not v_manager then
      raise exception 'Solo puedes cambiar tu parte.' using errcode = '42501';
    end if;
    update public.team_task_assignees
    set status = p_status,
        done_at = case when p_status <> 'hecha' then null when status = 'hecha' then done_at else now() end,
        updated_at = now()
    where task_id = p_id and profile_id = v_target;
    if not found then
      raise exception 'Esa persona no está asignada a la tarea.' using errcode = '42501';
    end if;
    perform public.cesi_task_recalc(p_id);
  else
    if not v_manager then
      raise exception 'No puedes cambiar el estado de esa tarea.' using errcode = '42501';
    end if;
    update public.team_tasks set status = p_status, updated_at = now() where id = p_id;
  end if;
end;
$$;

-- -----------------------------------------------------------------------------
-- Eliminar una cuenta (como en la parte 8, guardando también su nombre en sus partes)
-- -----------------------------------------------------------------------------
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
  update public.team_task_assignees set gone_name = v_name where profile_id = p_id;
  update public.shared_meetings
  set organizer_gone_name = v_name,
      cancelled_at = case when starts_at > now() then coalesce(cancelled_at, now()) else cancelled_at end,
      updated_at = now()
  where organizer_id = p_id;

  delete from auth.users where id = p_id;
end;
$$;

-- -----------------------------------------------------------------------------
-- Alertas del Inicio (como en la parte 12; las tareas atrasadas dicen quién falta)
-- -----------------------------------------------------------------------------
create or replace function public.cesi_home_alerts(p_as uuid default null)
returns table (kind text, at timestamptz, name text, detail text, seen boolean)
language plpgsql
stable
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  v_me uuid := public.cesi_home_viewer(p_as);
  v_zone text := public.cesi_zone_of(v_me);
  v_since timestamptz := now() - interval '7 days';
  v_today date := (now() at time zone v_zone)::date;
  v_seen timestamptz := coalesce((select s.seen_at from public.home_alerts_seen s where s.profile_id = v_me), '-infinity');
begin
  return query
  with ceo as (
    select id from public.profiles where role = 'ceo'
  ),
  shown_name as (
    select p.id, coalesce(nullif(trim(ap.full_name), ''), nullif(trim(p.display_name), ''), 'Sin nombre') as name
    from public.profiles p
    left join public.account_profiles ap on ap.id = p.id
  ),
  alerts as (
    -- Cuenta aceptada como equipo.
    select 'team_new'::text as kind, p.role_set_at as at, n.name,
      coalesce('Cuenta de equipo · ' || a.name, 'Cuenta de equipo') as detail
    from public.profiles p
    join shown_name n on n.id = p.id
    left join public.areas a on a.id = p.area
    where p.role = 'equipo' and p.role_set_at >= v_since

    union all
    -- Añadida a Equipo desde una vacante (candidatura aceptada).
    select 'team_new', h.at, coalesce(nullif(trim(c.data ->> 'name'), ''), 'Sin nombre'),
      coalesce('Desde la vacante «' || nullif(trim(v.data ->> 'title'), '') || '»', 'Desde una vacante')
    from public.contacts c
    cross join lateral jsonb_array_elements(case when jsonb_typeof(c.data -> 'candidacies') = 'array' then c.data -> 'candidacies' else '[]'::jsonb end) cand
    cross join lateral (
      select max(public.cesi_try_ts(e ->> 'at')) as at
      from jsonb_array_elements(case when jsonb_typeof(cand -> 'history') = 'array' then cand -> 'history' else '[]'::jsonb end) e
      where e ->> 'status' = 'accepted'
    ) h
    left join public.vacancies v on v.user_id = c.user_id and v.id = cand ->> 'vacancyId' and v.deleted_at is null
    where c.user_id in (select id from ceo) and c.deleted_at is null
      and c.data ? 'teamProfile' and cand ->> 'status' = 'accepted' and h.at >= v_since

    union all
    -- Cuenta aceptada como alumno.
    select 'student_new', p.role_set_at, n.name, 'Cuenta de alumno'
    from public.profiles p
    join shown_name n on n.id = p.id
    where p.role = 'alumno' and p.role_set_at >= v_since

    union all
    -- Alumno nuevo en la lista (sin los que ya salen por su cuenta recién aceptada).
    select 'student_new', public.cesi_try_ts(s.data ->> 'createdAt'),
      coalesce(nullif(trim(s.data ->> 'name'), ''), 'Sin nombre'), 'Nuevo en la lista de alumnos'
    from public.students s
    where s.user_id in (select id from ceo) and s.deleted_at is null
      and public.cesi_try_ts(s.data ->> 'createdAt') >= v_since
      and not exists (
        select 1 from public.profiles p
        where p.role = 'alumno' and p.linked_student_id = s.id and p.role_set_at >= v_since
      )

    union all
    -- Cuentas pendientes de aceptar (solo aviso).
    select 'account_pending', p.created_at, n.name, 'Pendiente de aceptar'
    from public.profiles p
    join shown_name n on n.id = p.id
    where p.role = 'pendiente' and p.created_at >= v_since

    union all
    -- Fichajes sin salida (más de 16 horas abiertos).
    select 'clock_open', ce.clock_in, public.cesi_name_or_gone(ce.profile_id, null), 'Entrada sin salida'
    from public.clock_entries ce
    where ce.clock_out is null and ce.clock_in >= v_since and ce.clock_in < now() - interval '16 hours'

    union all
    -- Tareas del equipo atrasadas (con la fecha límite en los últimos 7 días): quién falta.
    select 'task_overdue', ((t.due_date + 1)::timestamp at time zone v_zone), t.title,
      coalesce(
        (select 'Falta: ' || string_agg(public.cesi_person_name(ta.profile_id), ', ' order by public.cesi_person_name(ta.profile_id))
         from public.team_task_assignees ta
         where ta.task_id = t.id and ta.profile_id is not null and ta.status <> 'hecha'),
        'Sin responsable')
    from public.team_tasks t
    where t.status <> 'hecha' and t.due_date is not null and t.due_date < v_today
      and t.due_date >= v_today - 7
  )
  select al.kind, al.at, al.name, al.detail, al.at <= v_seen
  from alerts al
  where al.at is not null
  order by al.at desc
  limit 100;
end;
$$;

-- -----------------------------------------------------------------------------
-- Esta semana (como en la parte 12; las tareas hechas son las partes que terminé)
-- -----------------------------------------------------------------------------
create or replace function public.cesi_my_week(p_as uuid default null)
returns table (week_minutes integer, tasks_done integer)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_me uuid := (select auth.uid());
  v_zone text;
  v_week timestamptz;
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
  v_zone := public.cesi_zone_of(v_me);
  v_week := date_trunc('week', now() at time zone v_zone) at time zone v_zone;
  return query
  select
    (select coalesce(sum(extract(epoch from (ce.clock_out - ce.clock_in)) / 60), 0)
      from public.clock_entries ce
      where ce.profile_id = v_me and ce.clock_out is not null and ce.clock_in >= v_week)::integer,
    (select count(*) from public.team_task_assignees ta
      where ta.profile_id = v_me and ta.status = 'hecha' and ta.done_at >= v_week)::integer;
end;
$$;

-- -----------------------------------------------------------------------------
-- Permisos de las funciones
-- -----------------------------------------------------------------------------
revoke all on function public.cesi_task_visible(uuid, public.team_tasks) from public, anon;
revoke all on function public.cesi_team_tasks(uuid) from public, anon;
revoke all on function public.cesi_task_save(uuid, text, text, text, uuid[], text, date, text, text) from public, anon;
revoke all on function public.cesi_task_set_status(uuid, text, uuid) from public, anon;
revoke all on function public.cesi_delete_account(uuid) from public, anon;
revoke all on function public.cesi_home_alerts(uuid) from public, anon;
revoke all on function public.cesi_my_week(uuid) from public, anon;
grant execute on function public.cesi_task_visible(uuid, public.team_tasks) to authenticated;
grant execute on function public.cesi_team_tasks(uuid) to authenticated;
grant execute on function public.cesi_task_save(uuid, text, text, text, uuid[], text, date, text, text) to authenticated;
grant execute on function public.cesi_task_set_status(uuid, text, uuid) to authenticated;
grant execute on function public.cesi_delete_account(uuid) to authenticated;
grant execute on function public.cesi_home_alerts(uuid) to authenticated;
grant execute on function public.cesi_my_week(uuid) to authenticated;

notify pgrst, 'reload schema';

-- Comprobación: tareas con persona antigua que ya tienen su parte (deben ser todas), partes en
-- total y las funciones nuevas con permiso.
select
  (select count(*) from public.team_tasks where assignee_id is not null) as tareas_con_persona_antigua,
  (select count(*) from public.team_tasks t
     where t.assignee_id is not null
       and exists (select 1 from public.team_task_assignees a where a.task_id = t.id and a.profile_id = t.assignee_id)) as ya_pasadas,
  (select count(*) from public.team_task_assignees) as partes,
  (select count(*) from unnest(array[
     'public.cesi_task_save(uuid, text, text, text, uuid[], text, date, text, text)',
     'public.cesi_task_set_status(uuid, text, uuid)'
   ]) as f (sig) where has_function_privilege('authenticated', f.sig, 'execute')) as funciones_con_permiso;
