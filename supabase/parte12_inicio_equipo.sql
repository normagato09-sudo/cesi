-- =============================================================================
-- CIFA · Parte 12: Inicio del equipo y de Directivo (alertas y resumen en cifras)
-- =============================================================================
-- Ejecutar en Supabase → SQL Editor (proyecto fvswxhfjclvadcoyuqyu), después de las partes 7, 8
-- y 11. Se puede ejecutar más de una vez. No borra datos.
--
-- Qué hace:
--   · profiles.role_set_at: cuándo se aceptó la cuenta (cuándo cambió su papel). Lo pone un
--     trigger. Las cuentas que ya existen se rellenan con su created_at (o, si no lo tienen, el
--     1 de enero de 2000) para que no salgan todas como «nuevas» en las alertas el primer día.
--   · team_tasks.done_at: cuándo se marcó como hecha (trigger). Las que ya están hechas se
--     rellenan con su updated_at.
--   · home_alerts_seen: hasta cuándo ha visto cada persona sus alertas («Marcar como vistas»).
--     Sin políticas: solo se usa con las funciones de abajo.
--   · cesi_home_alerts(p_as): alertas de los últimos 7 días (la más nueva primero), solo para
--     Directivo y la ceo. Devuelve tipo, fecha, nombre y una línea de detalle; nunca fichas.
--   · cesi_home_alerts_seen(): «Marcar como vistas» (para la cuenta que lo pulsa).
--   · cesi_home_stats(p_as): el resumen en cifras (solo números), solo Directivo y la ceo.
--   · cesi_my_week(p_as): horas fichadas y tareas hechas esta semana de quien lo pide.
--   p_as: solo la ceo, para «Ver como».

do $$
begin
  if to_regclass('public.team_tasks') is null or to_regprocedure('public.cesi_is_boss(uuid)') is null then
    raise exception 'Falta la parte 7 (supabase/parte7_tareas_fichaje.sql): ejecútala antes.';
  end if;
  if to_regprocedure('public.cesi_name_or_gone(uuid, text)') is null then
    raise exception 'Falta la parte 8 (supabase/parte8_panel_ceo.sql): ejecútala antes.';
  end if;
end;
$$;

-- -----------------------------------------------------------------------------
-- Cuándo se aceptó cada cuenta
-- -----------------------------------------------------------------------------
alter table public.profiles add column if not exists role_set_at timestamptz;

-- Las que ya están aceptadas y no tienen fecha: la de creación de la cuenta (o una antigua), no
-- la de hoy, para que no salgan como «nuevas».
update public.profiles
set role_set_at = coalesce(created_at, timestamptz '2000-01-01 00:00:00+00')
where role_set_at is null and role <> 'pendiente';

create or replace function public.cesi_profiles_role_set_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.role is distinct from old.role then
    new.role_set_at := now();
  end if;
  return new;
end;
$$;

revoke all on function public.cesi_profiles_role_set_at() from public, anon, authenticated;

drop trigger if exists profiles_role_set_at on public.profiles;
create trigger profiles_role_set_at
  before update on public.profiles
  for each row execute function public.cesi_profiles_role_set_at();

-- -----------------------------------------------------------------------------
-- Cuándo se hizo cada tarea
-- -----------------------------------------------------------------------------
alter table public.team_tasks add column if not exists done_at timestamptz;

update public.team_tasks set done_at = updated_at where status = 'hecha' and done_at is null;

create or replace function public.cesi_team_tasks_done_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.status <> 'hecha' then
    new.done_at := null;
  elsif tg_op = 'INSERT' or old.status is distinct from 'hecha' then
    new.done_at := now();
  else
    new.done_at := old.done_at;
  end if;
  return new;
end;
$$;

revoke all on function public.cesi_team_tasks_done_at() from public, anon, authenticated;

drop trigger if exists team_tasks_done_at on public.team_tasks;
create trigger team_tasks_done_at
  before insert or update on public.team_tasks
  for each row execute function public.cesi_team_tasks_done_at();

-- -----------------------------------------------------------------------------
-- «Marcar como vistas»
-- -----------------------------------------------------------------------------
create table if not exists public.home_alerts_seen (
  profile_id uuid primary key references public.profiles (id) on delete cascade,
  seen_at timestamptz not null default now()
);

alter table public.home_alerts_seen enable row level security;
revoke all on table public.home_alerts_seen from anon, authenticated;

-- -----------------------------------------------------------------------------
-- Ayudas
-- -----------------------------------------------------------------------------

-- Texto → fecha y hora (null si no lo es). Para createdAt / enrolledAt de los datos de la ceo.
create or replace function public.cesi_try_ts(p text)
returns timestamptz
language plpgsql
stable
set search_path = ''
as $$
begin
  if p is null or p !~ '^\d{4}-\d{2}-\d{2}' then
    return null;
  end if;
  return p::timestamptz;
exception when others then
  return null;
end;
$$;

-- Quién mira el Inicio: la cuenta (o, con p_as, la que la ceo está viendo). Error si no es
-- Directivo ni la ceo.
create or replace function public.cesi_home_viewer(p_as uuid)
returns uuid
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_me uuid := (select auth.uid());
begin
  if p_as is not null and p_as <> v_me then
    if not public.is_ceo() then
      raise exception 'Sin permiso.' using errcode = '42501';
    end if;
    v_me := p_as;
  end if;
  if v_me is null or not public.cesi_is_boss(v_me) then
    raise exception 'Sin permiso.' using errcode = '42501';
  end if;
  return v_me;
end;
$$;

revoke all on function public.cesi_try_ts(text) from public, anon, authenticated;
revoke all on function public.cesi_home_viewer(uuid) from public, anon, authenticated;

-- -----------------------------------------------------------------------------
-- Alertas (últimos 7 días)
-- kind: 'team_new' | 'student_new' | 'account_pending' | 'clock_open' | 'task_overdue'
-- name: la persona (o la tarea); detail: una línea más (área, vacante, responsable…).
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
    -- Tareas del equipo atrasadas (con la fecha límite en los últimos 7 días).
    select 'task_overdue', ((t.due_date + 1)::timestamp at time zone v_zone), t.title,
      coalesce(public.cesi_name_or_gone(t.assignee_id, t.assignee_gone_name), 'Sin responsable')
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

create or replace function public.cesi_home_alerts_seen()
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_me uuid := public.cesi_home_viewer(null);
begin
  insert into public.home_alerts_seen (profile_id, seen_at) values (v_me, now())
  on conflict (profile_id) do update set seen_at = excluded.seen_at;
end;
$$;

-- -----------------------------------------------------------------------------
-- Resumen en cifras (solo números)
-- -----------------------------------------------------------------------------
create or replace function public.cesi_home_stats(p_as uuid default null)
returns table (
  students_total integer, students_new_month integer, courses_active integer,
  team_members integer, week_minutes integer, tasks_done_month integer
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_me uuid := public.cesi_home_viewer(p_as);
  v_zone text := public.cesi_zone_of(v_me);
  v_month timestamptz := date_trunc('month', now() at time zone v_zone) at time zone v_zone;
  v_week timestamptz := date_trunc('week', now() at time zone v_zone) at time zone v_zone;
begin
  return query
  with ceo as (
    select id from public.profiles where role = 'ceo'
  ),
  st as (
    select s.data from public.students s
    where s.user_id in (select id from ceo) and s.deleted_at is null
  )
  select
    (select count(*) from st)::integer,
    (select count(*) from st
      where coalesce(public.cesi_try_ts(st.data ->> 'enrolledAt'), public.cesi_try_ts(st.data ->> 'createdAt')) >= v_month)::integer,
    (select count(*) from public.courses co where co.user_id in (select id from ceo) and co.deleted_at is null)::integer,
    (select count(*) from public.contacts c
      where c.user_id in (select id from ceo) and c.deleted_at is null
        and jsonb_typeof(c.data -> 'teamProfile') = 'object'
        and coalesce(c.data -> 'teamProfile' ->> 'status', 'active') <> 'former'
        and coalesce(c.data ->> 'archived', 'false') <> 'true')::integer,
    (select coalesce(sum(extract(epoch from (ce.clock_out - ce.clock_in)) / 60), 0)
      from public.clock_entries ce
      where ce.clock_out is not null and ce.clock_in >= v_week)::integer,
    (select count(*) from public.team_tasks t where t.status = 'hecha' and t.done_at >= v_month)::integer;
end;
$$;

-- -----------------------------------------------------------------------------
-- Esta semana (de quien lo pide; cualquier persona de equipo)
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
    (select count(*) from public.team_tasks t
      where t.assignee_id = v_me and t.status = 'hecha' and t.done_at >= v_week)::integer;
end;
$$;

revoke all on function public.cesi_home_alerts(uuid) from public, anon;
revoke all on function public.cesi_home_alerts_seen() from public, anon;
revoke all on function public.cesi_home_stats(uuid) from public, anon;
revoke all on function public.cesi_my_week(uuid) from public, anon;
grant execute on function public.cesi_home_alerts(uuid) to authenticated;
grant execute on function public.cesi_home_alerts_seen() to authenticated;
grant execute on function public.cesi_home_stats(uuid) to authenticated;
grant execute on function public.cesi_my_week(uuid) to authenticated;
