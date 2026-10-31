-- =============================================================================
-- CIFA · Parte 7: equipo, tareas y fichaje
-- =============================================================================
-- Ejecutar en Supabase → SQL Editor (proyecto fvswxhfjclvadcoyuqyu), después de las partes 5 y 6
-- (supabase/parte5_areas.sql y supabase/parte6_calendario_compartido.sql). Se puede ejecutar más
-- de una vez. No borra datos ni toca mis tareas personales (tasks) ni la sincronización.
--
-- Qué hace:
--   · team_tasks: tareas del equipo (título, descripción, área, persona asignada, fecha límite,
--     prioridad y estado). Cada persona ve las suyas, las que creó y las de su área; Directivo y
--     la ceo, todas. Directivo y la ceo crean en cualquier área y asignan a cualquiera; los demás,
--     solo en su área y para sí mismos. Cambian el estado la persona asignada, quien la creó,
--     Directivo y la ceo; editan y borran quien la creó, Directivo y la ceo.
--   · clock_entries: fichajes (entrada, salida y «¿Qué has hecho?»). Cada uno ve los suyos;
--     Directivo y la ceo, los de todos. Una salida olvidada la corrige la propia persona ese día
--     (con una nota); después, Directivo o la ceo.
--   · Todo por funciones security definer (nadie escribe directamente en las tablas).

do $$
begin
  if to_regprocedure('public.cesi_person_name(uuid)') is null then
    raise exception 'Falta la parte 6 (supabase/parte6_calendario_compartido.sql): ejecútala antes.';
  end if;
  if not exists (select 1 from public.areas where id = 'direccion') then
    raise exception 'Falta el área Directivo (id direccion): ejecuta antes la parte 5 (supabase/parte5_areas.sql).';
  end if;
end;
$$;

-- ---------------------------------------------------------------------------
-- Parte 7: equipo, tareas y fichaje
-- ---------------------------------------------------------------------------
-- Aparte de mis tareas personales (tasks, sincronizada) y de la sincronización. Todo en UTC; cada
-- uno lo ve en la zona de su perfil. Nadie escribe directamente en estas tablas: solo con las
-- funciones de abajo, que comprueban quién puede hacer qué.
-- «Directivo»: persona de equipo del área direccion (se llama Directivo). Directivo y la ceo ven
-- todas las tareas y los fichajes de todos.

-- Tareas del equipo.
--   area         área a la que pertenece (null si se quitó el área)
--   assignee_id  persona de equipo asignada (null: sin asignar)
--   created_by   quien la creó
--   due_date     fecha límite (un día, sin hora) o null
--   priority     'baja' | 'media' | 'alta';  status: 'pendiente' | 'en_curso' | 'hecha'
create table if not exists public.team_tasks (
  id uuid primary key default gen_random_uuid(),
  title text not null check (length(trim(title)) between 1 and 200),
  description text not null default '' check (length(description) <= 4000),
  area text references public.areas (id) on update cascade on delete set null,
  assignee_id uuid references public.profiles (id) on delete set null,
  created_by uuid references public.profiles (id) on delete set null,
  due_date date,
  priority text not null default 'media' check (priority in ('baja', 'media', 'alta')),
  status text not null default 'pendiente' check (status in ('pendiente', 'en_curso', 'hecha')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists team_tasks_area_idx on public.team_tasks (area);
create index if not exists team_tasks_assignee_idx on public.team_tasks (assignee_id);

-- Fichajes: una fila por entrada; clock_out null mientras no ficha la salida.
--   summary   «¿Qué has hecho?» (obligatorio al fichar la salida)
--   fix_note  nota de la corrección (salida olvidada), fixed_by y fixed_at: quién y cuándo
create table if not exists public.clock_entries (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles (id) on delete cascade,
  clock_in timestamptz not null,
  clock_out timestamptz,
  summary text not null default '' check (length(summary) <= 2000),
  fix_note text not null default '' check (length(fix_note) <= 1000),
  fixed_by uuid references public.profiles (id) on delete set null,
  fixed_at timestamptz,
  created_at timestamptz not null default now(),
  constraint clock_entries_times check (clock_out is null or (clock_out > clock_in and clock_out - clock_in <= interval '24 hours'))
);
create index if not exists clock_entries_profile_idx on public.clock_entries (profile_id, clock_in);

-- Horas de fichaje: se puede fichar la salida de una entrada de hace como mucho 16 horas (así
-- vale también un turno que cruza la medianoche); una más antigua se queda «Sin salida» y la
-- corrige quien toque.

-- ---------------------------------------------------------------------------
-- Funciones internas
-- ---------------------------------------------------------------------------

-- ¿Ve y gestiona todo (la ceo o Directivo)?
create or replace function public.cesi_is_boss(p_profile uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.profiles
    where id = p_profile and (role = 'ceo' or (role = 'equipo' and area = 'direccion'))
  );
$$;

-- Zona horaria de una cuenta (la de su perfil; si no hay, Madrid).
create or replace function public.cesi_zone_of(p_profile uuid)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(nullif((select time_zone from public.account_profiles where id = p_profile), ''), 'Europe/Madrid');
$$;

-- ¿Puede `p_me` ver esa tarea?
create or replace function public.cesi_task_visible(p_me uuid, p_task public.team_tasks)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select public.cesi_is_boss(p_me)
    or p_task.assignee_id = p_me
    or p_task.created_by = p_me
    or (p_task.area is not null and p_task.area = (select area from public.profiles where id = p_me and role = 'equipo'));
$$;

-- ¿Puede `p_me` corregir ese fichaje? Directivo y la ceo, siempre; la propia persona, hasta que
-- acaba el día (en su zona) en que fichó la entrada.
create or replace function public.cesi_clock_can_fix(p_me uuid, p_entry public.clock_entries)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select public.cesi_is_boss(p_me)
    or (p_entry.profile_id = p_me
        and now() < (((p_entry.clock_in at time zone public.cesi_zone_of(p_me))::date + 1)::timestamp
                     at time zone public.cesi_zone_of(p_me)));
$$;

-- ---------------------------------------------------------------------------
-- Reglas de acceso (solo leer; escribir, con las funciones)
-- ---------------------------------------------------------------------------
alter table public.team_tasks enable row level security;
alter table public.clock_entries enable row level security;

drop policy if exists "team_tasks: leer las que puedo ver" on public.team_tasks;
create policy "team_tasks: leer las que puedo ver" on public.team_tasks
  for select to authenticated
  using (public.cesi_task_visible((select auth.uid()), team_tasks));

drop policy if exists "clock_entries: leer los míos (Directivo y la ceo, todos)" on public.clock_entries;
create policy "clock_entries: leer los míos (Directivo y la ceo, todos)" on public.clock_entries
  for select to authenticated
  using (profile_id = (select auth.uid()) or public.cesi_is_boss((select auth.uid())));

revoke all on public.team_tasks, public.clock_entries from anon;
revoke all on public.team_tasks, public.clock_entries from authenticated;
grant select on public.team_tasks, public.clock_entries to authenticated;

-- ---------------------------------------------------------------------------
-- Tareas
-- ---------------------------------------------------------------------------

-- Tareas que ve la cuenta actual (o, solo la ceo, otra con p_as: «Ver como»), con los nombres y
-- lo que puede hacer con cada una (can_edit: editar y borrar; can_status: cambiar el estado).
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
      t.assignee_id, case when t.assignee_id is null then '' else public.cesi_person_name(t.assignee_id) end,
      t.created_by, case when t.created_by is null then '' else public.cesi_person_name(t.created_by) end,
      t.due_date, t.priority, t.status, t.created_at, t.updated_at,
      v_boss or coalesce(t.created_by = v_me, false),
      v_boss or coalesce(t.created_by = v_me, false) or coalesce(t.assignee_id = v_me, false)
    from public.team_tasks t
    left join public.areas a on a.id = t.area
    where public.cesi_task_visible(v_me, t)
    order by t.due_date nulls last, t.created_at;
end;
$$;

-- A quién puede asignar tareas la cuenta actual: Directivo y la ceo, a cualquier persona de
-- equipo; los demás, solo a sí mismos. [{ id, name, area }]
create or replace function public.cesi_task_people()
returns table (id uuid, name text, area text)
language sql
stable
security definer
set search_path = ''
as $$
  select p.id, public.cesi_person_name(p.id), p.area
  from public.profiles p
  where p.role = 'equipo'
    and (public.cesi_is_boss((select auth.uid())) or p.id = (select auth.uid()))
  order by 2;
$$;

-- Crear (p_id null) o editar una tarea. Directivo y la ceo: en cualquier área y para cualquier
-- persona de equipo (o sin asignar). Los demás: solo en su área y para sí mismos. Editar: quien la
-- creó, Directivo o la ceo. Devuelve el id.
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
    if v_assignee is not null and not exists (select 1 from public.profiles where id = v_assignee and role = 'equipo') then
      raise exception 'Solo se puede asignar a una persona de equipo.' using errcode = '22023';
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

-- Cambiar el estado: la persona asignada, quien la creó, Directivo o la ceo.
create or replace function public.cesi_task_set_status(p_id uuid, p_status text)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_me uuid := (select auth.uid());
begin
  if coalesce(p_status, '') not in ('pendiente', 'en_curso', 'hecha') then
    raise exception 'Estado no válido.' using errcode = '22023';
  end if;
  update public.team_tasks set status = p_status, updated_at = now()
  where id = p_id and (public.cesi_is_boss(v_me) or assignee_id = v_me or created_by = v_me);
  if not found then
    raise exception 'No puedes cambiar el estado de esa tarea.' using errcode = '42501';
  end if;
end;
$$;

-- Borrar una tarea: quien la creó, Directivo o la ceo.
create or replace function public.cesi_task_delete(p_id uuid)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_me uuid := (select auth.uid());
begin
  delete from public.team_tasks
  where id = p_id and (public.cesi_is_boss(v_me) or created_by = v_me);
  if not found then
    raise exception 'Solo quien la creó, Directivo o la dirección pueden borrarla.' using errcode = '42501';
  end if;
end;
$$;

-- ---------------------------------------------------------------------------
-- Fichaje
-- ---------------------------------------------------------------------------

-- Fichar entrada (persona de equipo). No si ya tiene una entrada abierta de las últimas 16 horas.
create or replace function public.cesi_clock_in()
returns uuid
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_me uuid := (select auth.uid());
  v_id uuid;
begin
  if coalesce((select role from public.profiles where id = v_me), '') <> 'equipo' then
    raise exception 'Solo las personas de equipo fichan.' using errcode = '42501';
  end if;
  if exists (
    select 1 from public.clock_entries
    where profile_id = v_me and clock_out is null and clock_in > now() - interval '16 hours'
  ) then
    raise exception 'Ya has fichado la entrada.' using errcode = '22023';
  end if;
  insert into public.clock_entries (profile_id, clock_in) values (v_me, now()) returning id into v_id;
  return v_id;
end;
$$;

-- Fichar salida, con «¿Qué has hecho?» (obligatorio).
create or replace function public.cesi_clock_out(p_summary text)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_me uuid := (select auth.uid());
  v_id uuid;
begin
  if length(trim(coalesce(p_summary, ''))) = 0 then
    raise exception 'Escribe qué has hecho.' using errcode = '22023';
  end if;
  select id into v_id from public.clock_entries
  where profile_id = v_me and clock_out is null and clock_in > now() - interval '16 hours'
  order by clock_in desc limit 1;
  if v_id is null then
    raise exception 'No tienes una entrada abierta.' using errcode = '22023';
  end if;
  update public.clock_entries set clock_out = now(), summary = trim(p_summary) where id = v_id;
end;
$$;

-- Corregir un fichaje (salida olvidada o mal puesta), con una nota obligatoria. La propia
-- persona, hasta que acaba el día de esa entrada; después, Directivo o la ceo, que también pueden
-- cambiar la entrada (p_clock_in null: no se cambia).
create or replace function public.cesi_clock_fix(p_id uuid, p_clock_in timestamptz, p_clock_out timestamptz, p_summary text, p_note text)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_me uuid := (select auth.uid());
  v_entry public.clock_entries;
  v_in timestamptz;
begin
  select * into v_entry from public.clock_entries where id = p_id for update;
  if not found or not public.cesi_clock_can_fix(v_me, v_entry) then
    raise exception 'Ese fichaje ya solo lo puede corregir Directivo o la dirección.' using errcode = '42501';
  end if;
  if length(trim(coalesce(p_note, ''))) = 0 then
    raise exception 'Escribe una nota con la corrección.' using errcode = '22023';
  end if;
  if length(trim(coalesce(p_summary, ''))) = 0 then
    raise exception 'Escribe qué has hecho.' using errcode = '22023';
  end if;
  v_in := v_entry.clock_in;
  if p_clock_in is not null and p_clock_in <> v_entry.clock_in then
    if not public.cesi_is_boss(v_me) then
      raise exception 'La entrada solo la puede cambiar Directivo o la dirección.' using errcode = '42501';
    end if;
    v_in := p_clock_in;
  end if;
  if p_clock_out is null or p_clock_out <= v_in or p_clock_out > now() or p_clock_out - v_in > interval '24 hours' then
    raise exception 'La salida tiene que ser después de la entrada, no en el futuro y como mucho 24 horas después.' using errcode = '22023';
  end if;
  update public.clock_entries
  set clock_in = v_in, clock_out = p_clock_out, summary = trim(p_summary), fix_note = trim(p_note), fixed_by = v_me, fixed_at = now()
  where id = p_id;
end;
$$;

-- Fichajes entre dos instantes (como mucho 62 días): los míos o, con p_all (solo Directivo y la
-- ceo), los de todos, con el nombre de cada persona. can_fix: si puedo corregirlo. p_as: solo la
-- ceo («Ver como»; se calcula como esa persona).
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
    select e.id, e.profile_id, public.cesi_person_name(e.profile_id), e.clock_in, e.clock_out, e.summary,
      e.fix_note, case when e.fixed_by is null then '' else public.cesi_person_name(e.fixed_by) end, e.fixed_at,
      public.cesi_clock_can_fix(v_me, e)
    from public.clock_entries e
    where (p_all or e.profile_id = v_me)
      and e.clock_in < p_to and coalesce(e.clock_out, e.clock_in) >= p_from
    order by e.clock_in desc;
end;
$$;

-- Fichajes «Sin salida» (entrada abierta de hace más de 16 horas) de la cuenta actual, de
-- cualquier fecha: para avisar y poder corregirlos.
create or replace function public.cesi_clock_open_old(p_as uuid default null)
returns table (id uuid, clock_in timestamptz, can_fix boolean)
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
  return query
    select e.id, e.clock_in, public.cesi_clock_can_fix(v_me, e)
    from public.clock_entries e
    where e.profile_id = v_me and e.clock_out is null and e.clock_in <= now() - interval '16 hours'
    order by e.clock_in desc;
end;
$$;

-- Permisos de las funciones.
revoke all on function public.cesi_zone_of(uuid) from public, anon, authenticated;
revoke all on function public.cesi_is_boss(uuid) from public, anon;
grant execute on function public.cesi_is_boss(uuid) to authenticated;
revoke all on function public.cesi_task_visible(uuid, public.team_tasks) from public, anon;
grant execute on function public.cesi_task_visible(uuid, public.team_tasks) to authenticated;
revoke all on function public.cesi_clock_can_fix(uuid, public.clock_entries) from public, anon, authenticated;

revoke all on function public.cesi_team_tasks(uuid) from public, anon;
revoke all on function public.cesi_task_people() from public, anon;
revoke all on function public.cesi_task_save(uuid, text, text, text, uuid, date, text, text) from public, anon;
revoke all on function public.cesi_task_set_status(uuid, text) from public, anon;
revoke all on function public.cesi_task_delete(uuid) from public, anon;
revoke all on function public.cesi_clock_in() from public, anon;
revoke all on function public.cesi_clock_out(text) from public, anon;
revoke all on function public.cesi_clock_fix(uuid, timestamptz, timestamptz, text, text) from public, anon;
revoke all on function public.cesi_clock_entries(timestamptz, timestamptz, boolean, uuid) from public, anon;
revoke all on function public.cesi_clock_open_old(uuid) from public, anon;
grant execute on function public.cesi_team_tasks(uuid) to authenticated;
grant execute on function public.cesi_task_people() to authenticated;
grant execute on function public.cesi_task_save(uuid, text, text, text, uuid, date, text, text) to authenticated;
grant execute on function public.cesi_task_set_status(uuid, text) to authenticated;
grant execute on function public.cesi_task_delete(uuid) to authenticated;
grant execute on function public.cesi_clock_in() to authenticated;
grant execute on function public.cesi_clock_out(text) to authenticated;
grant execute on function public.cesi_clock_fix(uuid, timestamptz, timestamptz, text, text) to authenticated;
grant execute on function public.cesi_clock_entries(timestamptz, timestamptz, boolean, uuid) to authenticated;
grant execute on function public.cesi_clock_open_old(uuid) to authenticated;

notify pgrst, 'reload schema';

-- Comprobación: las 2 tablas con sus reglas de acceso, las funciones de la app con permiso para
-- las cuentas con sesión (10), quién es Directivo y cuántas tareas y fichajes hay.
select
  (select count(*) from pg_class c join pg_namespace n on n.oid = c.relnamespace
     where n.nspname = 'public' and c.relrowsecurity and c.relname in ('team_tasks', 'clock_entries')) as tablas_con_rls,
  (select count(*) from pg_policies where schemaname = 'public' and tablename in ('team_tasks', 'clock_entries')) as politicas,
  (select count(*) from unnest(array[
      'public.cesi_team_tasks(uuid)',
      'public.cesi_task_people()',
      'public.cesi_task_save(uuid, text, text, text, uuid, date, text, text)',
      'public.cesi_task_set_status(uuid, text)',
      'public.cesi_task_delete(uuid)',
      'public.cesi_clock_in()',
      'public.cesi_clock_out(text)',
      'public.cesi_clock_fix(uuid, timestamptz, timestamptz, text, text)',
      'public.cesi_clock_entries(timestamptz, timestamptz, boolean, uuid)',
      'public.cesi_clock_open_old(uuid)'
    ]) as f (sig)
    where has_function_privilege('authenticated', f.sig, 'execute')) as funciones_con_permiso,
  (select coalesce(string_agg(public.cesi_person_name(p.id), ', '), '(nadie)')
     from public.profiles p where p.role = 'equipo' and p.area = 'direccion') as directivo,
  (select count(*) from public.team_tasks) as tareas,
  (select count(*) from public.clock_entries) as fichajes;
