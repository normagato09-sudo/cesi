-- =============================================================================
-- CIFA · Parte 6: calendario compartido (reuniones entre personas, libre/ocupado y clases)
-- =============================================================================
-- Ejecutar en Supabase → SQL Editor (proyecto fvswxhfjclvadcoyuqyu), después de la parte 4
-- (supabase/parte4_perfil_para_todos.sql). Se puede ejecutar más de una vez. No borra datos ni
-- toca mis tablas sincronizadas (events, courses, students…): solo las lee desde las funciones.
--
-- Qué hace:
--   · Tablas nuevas: shared_meetings (reuniones compartidas), shared_meeting_participants
--     (invitados y su respuesta), ceo_busy (mis bloques ocupados, solo inicio y fin) y
--     class_confirmations (si un alumno irá o no a una clase).
--   · Nadie escribe en ellas directamente: solo con funciones que comprueban quién puede invitar
--     a quién (ceo → cualquiera; equipo → equipo y ceo; profesor → además, los alumnos de sus
--     cursos; alumno → solo los profesores de sus cursos).
--   · Libre/ocupado (cesi_free_busy): solo devuelve franjas ocupadas, sin títulos ni detalles.
--   · Clases (cesi_my_classes, cesi_class_attendees, cesi_class_confirm): cada alumno ve las de
--     sus cursos y cada profesor las de los cursos que da, con los nombres de los compañeros.
-- Reuniones de una sola vez (sin repetición).

do $$
begin
  if to_regclass('public.account_profiles') is null then
    raise exception 'Falta la parte 4 (supabase/parte4_perfil_para_todos.sql): ejecútala antes.';
  end if;
  if to_regclass('public.courses') is null or to_regclass('public.students') is null or to_regclass('public.extra_classes') is null then
    raise exception 'Faltan las tablas de Cursos y Alumnos (supabase/fases-2-5.sql): ejecútala antes.';
  end if;
end;
$$;

-- ---------------------------------------------------------------------------
-- Parte 6: calendario compartido (reuniones entre personas, libre/ocupado y clases)
-- ---------------------------------------------------------------------------
-- Aparte de mis tablas sincronizadas (events, etc.) y de su motor de sincronización. Todo en UTC;
-- cada uno lo ve en la zona de su perfil (account_profiles). Nadie escribe en estas tablas
-- directamente: solo con las funciones de abajo (security definer), que comprueban quién puede
-- hacer qué. Reuniones de una sola vez (sin repetición).
--
-- Quién puede invitar a quién (cesi_can_invite):
--   ceo → cualquiera; equipo → equipo y ceo; profesor (equipo) → además, los alumnos de sus
--   cursos; alumno → solo los profesores de sus cursos.
-- Profesor de un curso: la cuenta de equipo con profiles.linked_team_id = courses.data.teacherId.
-- Alumno de un curso: la cuenta con profiles.linked_student_id = un alumno con ese curso en
-- students.data.courseIds. Cursos, alumnos, contactos y clases sueltas: las filas de la ceo.

-- Reuniones compartidas.
--   organizer_id  quien la organiza (también está en participants, aceptada)
--   link          enlace de la videollamada ('' si no hay)
--   cancelled_at  si el organizador la ha cancelado (se sigue viendo, como «Cancelada»)
create table if not exists public.shared_meetings (
  id uuid primary key default gen_random_uuid(),
  organizer_id uuid not null references public.profiles (id) on delete cascade,
  title text not null check (length(trim(title)) between 1 and 200),
  description text not null default '' check (length(description) <= 4000),
  link text not null default '' check (length(link) <= 500),
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  cancelled_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint shared_meetings_times check (ends_at > starts_at and ends_at - starts_at <= interval '12 hours')
);
create index if not exists shared_meetings_starts_idx on public.shared_meetings (starts_at);

-- Participantes: status 'pending' (sin responder), 'accepted' o 'declined'.
create table if not exists public.shared_meeting_participants (
  meeting_id uuid not null references public.shared_meetings (id) on delete cascade,
  profile_id uuid not null references public.profiles (id) on delete cascade,
  status text not null default 'pending' check (status in ('pending', 'accepted', 'declined')),
  responded_at timestamptz,
  primary key (meeting_id, profile_id)
);
create index if not exists shared_meeting_participants_profile_idx on public.shared_meeting_participants (profile_id);

-- Mis bloques ocupados (la ceo): solo inicio y fin, sin título ni nada más. Los publica mi app
-- (las próximas semanas de mi calendario) cada vez que cambian mis reuniones.
create table if not exists public.ceo_busy (
  owner_id uuid not null references public.profiles (id) on delete cascade,
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  constraint ceo_busy_times check (ends_at > starts_at)
);
create index if not exists ceo_busy_owner_idx on public.ceo_busy (owner_id, starts_at);

-- Confirmación de asistencia de un alumno a una clase: status 'yes' (irá) o 'no' (no podrá ir).
-- class_key: la misma clave que el pase de lista ('AAAA-MM-DD_HH:mm' en la zona del horario del
-- curso, o 'extra:<id>' para una clase suelta).
create table if not exists public.class_confirmations (
  course_id text not null check (length(course_id) between 1 and 200),
  class_key text not null check (length(class_key) between 1 and 220),
  profile_id uuid not null references public.profiles (id) on delete cascade,
  status text not null check (status in ('yes', 'no')),
  updated_at timestamptz not null default now(),
  primary key (course_id, class_key, profile_id)
);

-- ---------------------------------------------------------------------------
-- Funciones internas (no se llaman desde la app)
-- ---------------------------------------------------------------------------

-- Cursos (ids) en los que está la cuenta de un alumno.
create or replace function public.cesi_student_courses(p_profile uuid)
returns setof text
language sql
stable
security definer
set search_path = ''
as $$
  select distinct c.value
  from public.profiles pr
  join public.students s
    on s.id = pr.linked_student_id and s.deleted_at is null
   and s.user_id in (select id from public.profiles where role = 'ceo')
  cross join lateral jsonb_array_elements_text(
    case when jsonb_typeof(s.data -> 'courseIds') = 'array' then s.data -> 'courseIds' else '[]'::jsonb end
  ) as c (value)
  join public.courses co on co.id = c.value and co.user_id = s.user_id and co.deleted_at is null
  where pr.id = p_profile and pr.role = 'alumno';
$$;

-- Cursos (ids) que da la cuenta de un profesor (persona de equipo).
create or replace function public.cesi_teacher_courses(p_profile uuid)
returns setof text
language sql
stable
security definer
set search_path = ''
as $$
  select co.id
  from public.profiles pr
  join public.courses co
    on co.data ->> 'teacherId' = pr.linked_team_id and co.deleted_at is null
   and co.user_id in (select id from public.profiles where role = 'ceo')
  where pr.id = p_profile and pr.role = 'equipo' and pr.linked_team_id is not null;
$$;

-- ¿Puede `p_from` invitar a `p_to` (y ver su libre/ocupado)?
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
    return exists (
      select 1 from public.cesi_teacher_courses(p_from) t (id)
      join public.cesi_student_courses(p_to) s (id) on s.id = t.id
    );
  end if;
  if v_from = 'alumno' and v_to = 'equipo' then
    return exists (
      select 1 from public.cesi_student_courses(p_from) s (id)
      join public.cesi_teacher_courses(p_to) t (id) on t.id = s.id
    );
  end if;
  return false;
end;
$$;

-- Clases de un curso entre dos instantes: las del horario (data.schedule, desde schedule.since o,
-- si no hay, desde que se creó el curso; se saltan las horas que no existen por el cambio de
-- hora) y las sueltas (extra_classes). Igual que courseClasses en src/lib/attendance.js.
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
  v_tz text;
  v_minutes int := 60;
  v_since date;
  v_day date;
  v_slot jsonb;
  v_local timestamp;
  v_start timestamptz;
begin
  if (p_course.data ->> 'classMinutes') ~ '^[0-9]{1,4}$' and (p_course.data ->> 'classMinutes')::int > 0 then
    v_minutes := (p_course.data ->> 'classMinutes')::int;
  end if;

  if jsonb_typeof(v_sched) = 'object' and jsonb_typeof(v_sched -> 'slots') = 'array' then
    v_tz := v_sched ->> 'timeZone';
    begin
      perform now() at time zone v_tz;
    exception when others then
      v_tz := null;
    end;
    if v_tz is not null then
      if (v_sched ->> 'since') ~ '^\d{4}-\d{2}-\d{2}$' then
        v_since := (v_sched ->> 'since')::date;
      else
        begin
          v_since := ((p_course.data ->> 'createdAt')::timestamptz at time zone v_tz)::date;
        exception when others then
          v_since := null;
        end;
      end if;

      for v_day in
        select d::date from generate_series(
          ((p_from at time zone v_tz)::date - 1)::timestamp,
          ((p_to at time zone v_tz)::date)::timestamp,
          interval '1 day'
        ) as g (d)
      loop
        continue when v_since is not null and v_day < v_since;
        for v_slot in select value from jsonb_array_elements(v_sched -> 'slots') loop
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
    end if;
  end if;

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

-- ¿Está la cuenta actual en esa reunión (organiza o está invitada)? Para las reglas de acceso.
create or replace function public.cesi_in_meeting(p_meeting uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.shared_meeting_participants
    where meeting_id = p_meeting and profile_id = (select auth.uid())
  ) or exists (
    select 1 from public.shared_meetings
    where id = p_meeting and organizer_id = (select auth.uid())
  );
$$;

-- Nombre visible de una cuenta: el de su perfil, el de la cuenta o su email.
create or replace function public.cesi_person_name(p_profile uuid)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(nullif(trim(ap.full_name), ''), nullif(trim(p.display_name), ''), p.email, '')
  from public.profiles p
  left join public.account_profiles ap on ap.id = p.id
  where p.id = p_profile;
$$;

-- ---------------------------------------------------------------------------
-- Reglas de acceso: cada uno lee las reuniones en las que está (la ceo, todas) y sus
-- confirmaciones (la ceo, todas); mis bloques ocupados, solo yo. Nadie escribe directamente.
-- ---------------------------------------------------------------------------
alter table public.shared_meetings enable row level security;
alter table public.shared_meeting_participants enable row level security;
alter table public.ceo_busy enable row level security;
alter table public.class_confirmations enable row level security;

drop policy if exists "shared_meetings: leer las mías (la ceo, todas)" on public.shared_meetings;
create policy "shared_meetings: leer las mías (la ceo, todas)" on public.shared_meetings
  for select to authenticated
  using (organizer_id = (select auth.uid()) or (select public.is_ceo()) or public.cesi_in_meeting(id));

drop policy if exists "shared_meeting_participants: leer los de mis reuniones (la ceo, todos)" on public.shared_meeting_participants;
create policy "shared_meeting_participants: leer los de mis reuniones (la ceo, todos)" on public.shared_meeting_participants
  for select to authenticated
  using (profile_id = (select auth.uid()) or (select public.is_ceo()) or public.cesi_in_meeting(meeting_id));

drop policy if exists "ceo_busy: leer los míos" on public.ceo_busy;
create policy "ceo_busy: leer los míos" on public.ceo_busy
  for select to authenticated
  using (owner_id = (select auth.uid()) and (select public.is_ceo()));

drop policy if exists "class_confirmations: leer las mías (la ceo, todas)" on public.class_confirmations;
create policy "class_confirmations: leer las mías (la ceo, todas)" on public.class_confirmations
  for select to authenticated
  using (profile_id = (select auth.uid()) or (select public.is_ceo()));

revoke all on public.shared_meetings, public.shared_meeting_participants, public.ceo_busy, public.class_confirmations from anon;
revoke all on public.shared_meetings, public.shared_meeting_participants, public.ceo_busy, public.class_confirmations from authenticated;
grant select on public.shared_meetings, public.shared_meeting_participants, public.ceo_busy, public.class_confirmations to authenticated;

-- ---------------------------------------------------------------------------
-- Funciones de la app
-- ---------------------------------------------------------------------------

-- Personas a las que puedo invitar: [{ id, name, role }] (solo el nombre).
create or replace function public.cesi_invitable_people()
returns table (id uuid, name text, role text)
language sql
stable
security definer
set search_path = ''
as $$
  select p.id, public.cesi_person_name(p.id), p.role
  from public.profiles p
  where p.role in ('ceo', 'equipo', 'alumno') and public.cesi_can_invite((select auth.uid()), p.id)
  order by 2;
$$;

-- Libre/ocupado: para cada persona (yo o alguien a quien puedo invitar), solo sus franjas
-- ocupadas entre p_from y p_to (como mucho 31 días). Ocupado = fuera de la disponibilidad de su
-- perfil (sin perfil completo, todo), sus reuniones compartidas aceptadas, sus clases (alumno o
-- profesor) y, la ceo, sus bloques de ceo_busy. Sin títulos ni nada más.
-- p_exclude: una reunión que no cuenta (la que se está editando).
create or replace function public.cesi_free_busy(p_people uuid[], p_from timestamptz, p_to timestamptz, p_exclude uuid default null)
returns table (profile_id uuid, starts_at timestamptz, ends_at timestamptz)
language plpgsql
stable
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  v_me uuid := (select auth.uid());
  v_person uuid;
  v_prof public.account_profiles;
  v_window tstzmultirange;
  v_free tstzmultirange;
  v_busy tstzmultirange;
begin
  if v_me is null or coalesce((select public.my_role()), '') not in ('ceo', 'equipo', 'alumno') then
    raise exception 'Sin permiso.' using errcode = '42501';
  end if;
  if p_from is null or p_to is null or p_to <= p_from or p_to - p_from > interval '31 days' then
    raise exception 'Rango de fechas no válido.' using errcode = '22023';
  end if;
  if coalesce(array_length(p_people, 1), 0) > 50 then
    raise exception 'Demasiadas personas.' using errcode = '22023';
  end if;
  v_window := tstzmultirange(tstzrange(p_from, p_to));

  foreach v_person in array coalesce(p_people, '{}'::uuid[]) loop
    if v_person <> v_me and not public.cesi_can_invite(v_me, v_person) then
      raise exception 'No puedes ver la disponibilidad de esa persona.' using errcode = '42501';
    end if;

    v_free := '{}'::tstzmultirange;
    select * into v_prof from public.account_profiles where id = v_person;
    if found and v_prof.completed_at is not null and jsonb_typeof(v_prof.availability) = 'array' then
      begin
        select coalesce(range_agg(tstzrange(
            (g.d::date + (s.value ->> 'start')::time) at time zone v_prof.time_zone,
            case when s.value ->> 'end' = '23:59'
              then (g.d::date + 1)::timestamp at time zone v_prof.time_zone
              else (g.d::date + (s.value ->> 'end')::time) at time zone v_prof.time_zone end)), '{}'::tstzmultirange)
          into v_free
        from generate_series(
          ((p_from at time zone v_prof.time_zone)::date - 1)::timestamp,
          ((p_to at time zone v_prof.time_zone)::date)::timestamp,
          interval '1 day'
        ) as g (d)
        cross join lateral jsonb_array_elements(v_prof.availability) as e (value)
        cross join lateral jsonb_array_elements(
          case when jsonb_typeof(e.value -> 'slots') = 'array' then e.value -> 'slots' else '[]'::jsonb end
        ) as s (value)
        where (e.value ->> 'day')::int = extract(dow from g.d)::int
          and coalesce((e.value ->> 'enabled')::boolean, true);
      exception when others then
        v_free := '{}'::tstzmultirange;
      end;
    end if;

    v_busy := v_window - v_free;

    v_busy := v_busy + coalesce((
      select range_agg(tstzrange(m.starts_at, m.ends_at))
      from public.shared_meetings m
      join public.shared_meeting_participants pp on pp.meeting_id = m.id
      where pp.profile_id = v_person and pp.status = 'accepted' and m.cancelled_at is null
        and m.id is distinct from p_exclude and m.starts_at < p_to and m.ends_at > p_from
    ), '{}'::tstzmultirange);

    v_busy := v_busy + coalesce((
      select range_agg(tstzrange(b.starts_at, b.ends_at))
      from public.ceo_busy b
      where b.owner_id = v_person and b.starts_at < p_to and b.ends_at > p_from
    ), '{}'::tstzmultirange);

    v_busy := v_busy + coalesce((
      select range_agg(tstzrange(k.starts_at, k.ends_at))
      from public.courses co
      cross join lateral public.cesi_course_classes(co, p_from, p_to) k
      where co.deleted_at is null
        and co.user_id in (select id from public.profiles where role = 'ceo')
        and co.id in (select public.cesi_student_courses(v_person) union select public.cesi_teacher_courses(v_person))
    ), '{}'::tstzmultirange);

    v_busy := v_busy * v_window;
    return query select v_person, lower(r), upper(r) from unnest(v_busy) as r;
  end loop;
end;
$$;

-- Reuniones de la cuenta actual (o, solo la ceo, de otra con p_as: «Ver como») entre dos
-- instantes, también las canceladas. participants: [{ id, name, status }] (con el organizador).
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
      m.organizer_id, public.cesi_person_name(m.organizer_id), me.status,
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

-- Crear (p_id null) o editar (solo el organizador) una reunión. Solo se puede añadir a quien se
-- puede invitar; si cambia la hora, los invitados vuelven a «Pendiente». Devuelve el id.
create or replace function public.cesi_meeting_save(
  p_id uuid, p_title text, p_description text, p_link text,
  p_starts_at timestamptz, p_ends_at timestamptz, p_participants uuid[]
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
  v_old public.shared_meetings;
  v_people uuid[];
  v_person uuid;
begin
  if v_me is null or coalesce((select public.my_role()), '') not in ('ceo', 'equipo', 'alumno') then
    raise exception 'Sin permiso.' using errcode = '42501';
  end if;
  if length(trim(coalesce(p_title, ''))) = 0 then
    raise exception 'Escribe un título.' using errcode = '22023';
  end if;
  if p_starts_at is null or p_ends_at is null or p_ends_at <= p_starts_at then
    raise exception 'La reunión tiene que acabar después de empezar.' using errcode = '22023';
  end if;
  select coalesce(array_agg(distinct x), '{}') into v_people
  from unnest(coalesce(p_participants, '{}'::uuid[])) as x where x is not null and x <> v_me;
  if array_length(v_people, 1) is null then
    raise exception 'Añade al menos un participante.' using errcode = '22023';
  end if;
  if array_length(v_people, 1) > 50 then
    raise exception 'Demasiados participantes.' using errcode = '22023';
  end if;

  if v_id is null then
    insert into public.shared_meetings (organizer_id, title, description, link, starts_at, ends_at)
    values (v_me, trim(p_title), coalesce(p_description, ''), trim(coalesce(p_link, '')), p_starts_at, p_ends_at)
    returning id into v_id;
  else
    select * into v_old from public.shared_meetings where id = v_id for update;
    if not found or v_old.organizer_id <> v_me then
      raise exception 'Solo quien organiza la reunión puede cambiarla.' using errcode = '42501';
    end if;
    if v_old.cancelled_at is not null then
      raise exception 'La reunión está cancelada.' using errcode = '22023';
    end if;
    update public.shared_meetings
    set title = trim(p_title), description = coalesce(p_description, ''), link = trim(coalesce(p_link, '')),
        starts_at = p_starts_at, ends_at = p_ends_at, updated_at = now()
    where id = v_id;
    if v_old.starts_at <> p_starts_at or v_old.ends_at <> p_ends_at then
      update public.shared_meeting_participants
      set status = 'pending', responded_at = null
      where meeting_id = v_id and profile_id <> v_me;
    end if;
    delete from public.shared_meeting_participants
    where meeting_id = v_id and profile_id <> v_me and not (profile_id = any (v_people));
  end if;

  insert into public.shared_meeting_participants (meeting_id, profile_id, status, responded_at)
  values (v_id, v_me, 'accepted', now())
  on conflict (meeting_id, profile_id) do update set status = 'accepted';

  foreach v_person in array v_people loop
    if not exists (select 1 from public.shared_meeting_participants where meeting_id = v_id and profile_id = v_person) then
      if not public.cesi_can_invite(v_me, v_person) then
        raise exception 'No puedes invitar a una de esas personas.' using errcode = '42501';
      end if;
      insert into public.shared_meeting_participants (meeting_id, profile_id, status) values (v_id, v_person, 'pending');
    end if;
  end loop;

  return v_id;
end;
$$;

-- Cancelar una reunión (solo el organizador). No se borra: sale como «Cancelada».
create or replace function public.cesi_meeting_cancel(p_id uuid)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
begin
  update public.shared_meetings set cancelled_at = coalesce(cancelled_at, now()), updated_at = now()
  where id = p_id and organizer_id = (select auth.uid());
  if not found then
    raise exception 'Solo quien organiza la reunión puede cancelarla.' using errcode = '42501';
  end if;
end;
$$;

-- Aceptar ('accepted') o rechazar ('declined') una invitación.
create or replace function public.cesi_meeting_respond(p_id uuid, p_status text)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
begin
  if p_status not in ('accepted', 'declined') then
    raise exception 'Respuesta no válida.' using errcode = '22023';
  end if;
  update public.shared_meeting_participants pp
  set status = p_status, responded_at = now()
  from public.shared_meetings m
  where pp.meeting_id = p_id and pp.profile_id = (select auth.uid())
    and m.id = pp.meeting_id and m.cancelled_at is null and m.organizer_id <> pp.profile_id;
  if not found then
    raise exception 'No tienes invitación a esa reunión.' using errcode = '42501';
  end if;
end;
$$;

-- Publicar mis bloques ocupados (solo la ceo): sustituye todos los míos. p_blocks: [[inicio, fin]].
create or replace function public.cesi_publish_my_busy(p_blocks jsonb)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_me uuid := (select auth.uid());
begin
  if not public.is_ceo() then
    raise exception 'Sin permiso.' using errcode = '42501';
  end if;
  if jsonb_typeof(p_blocks) <> 'array' or jsonb_array_length(p_blocks) > 5000 then
    raise exception 'Bloques no válidos.' using errcode = '22023';
  end if;
  delete from public.ceo_busy where owner_id = v_me;
  insert into public.ceo_busy (owner_id, starts_at, ends_at)
  select v_me, (b ->> 0)::timestamptz, (b ->> 1)::timestamptz
  from jsonb_array_elements(p_blocks) as b
  where (b ->> 1)::timestamptz > (b ->> 0)::timestamptz;
end;
$$;

-- Clases de la cuenta actual (o, solo la ceo, de otra con p_as): las de sus cursos si es alumno
-- (kind 'alumno') y las de los cursos que da si es profesor (kind 'profesor'), con el nombre del
-- curso y del profesor, mi confirmación y cuántos han confirmado.
create or replace function public.cesi_my_classes(p_from timestamptz, p_to timestamptz, p_as uuid default null)
returns table (
  course_id text, course_name text, teacher_name text, class_key text, starts_at timestamptz,
  ends_at timestamptz, is_extra boolean, note text, kind text, my_status text, confirmed int
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
    with mine as (
      select co, 'alumno'::text as kind from public.courses co
      where co.id in (select public.cesi_student_courses(v_me)) and co.deleted_at is null
        and co.user_id in (select id from public.profiles where role = 'ceo')
      union all
      select co, 'profesor'::text from public.courses co
      where co.id in (select public.cesi_teacher_courses(v_me)) and co.deleted_at is null
        and co.user_id in (select id from public.profiles where role = 'ceo')
    )
    select (m.co).id, coalesce((m.co).data ->> 'name', ''), coalesce(t.data ->> 'name', ''),
      k.class_key, k.starts_at, k.ends_at, k.is_extra, k.note, m.kind,
      (select cc.status from public.class_confirmations cc
        where cc.course_id = (m.co).id and cc.class_key = k.class_key and cc.profile_id = v_me),
      (select count(*)::int from public.class_confirmations cc
        where cc.course_id = (m.co).id and cc.class_key = k.class_key and cc.status = 'yes')
    from mine m
    cross join lateral public.cesi_course_classes(m.co, p_from, p_to) k
    left join public.contacts t
      on t.id = (m.co).data ->> 'teacherId' and t.user_id = (m.co).user_id and t.deleted_at is null
    order by k.starts_at;
end;
$$;

-- Compañeros de una clase (los alumnos del curso, con el nombre de su ficha) y su confirmación.
-- Solo para un alumno del curso, su profesor o la ceo. student_id: el id de la ficha de Alumnos.
create or replace function public.cesi_class_attendees(p_course_id text, p_class_key text)
returns table (student_id text, name text, status text, is_me boolean)
language plpgsql
stable
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  v_me uuid := (select auth.uid());
begin
  if not (public.is_ceo()
    or p_course_id in (select public.cesi_student_courses(v_me))
    or p_course_id in (select public.cesi_teacher_courses(v_me))) then
    raise exception 'Sin permiso.' using errcode = '42501';
  end if;
  return query
    select s.id, coalesce(nullif(trim(s.data ->> 'name'), ''), 'Alumno'),
      (select cc.status from public.class_confirmations cc
        join public.profiles pr on pr.id = cc.profile_id
        where cc.course_id = p_course_id and cc.class_key = p_class_key and pr.linked_student_id = s.id
        order by cc.updated_at desc limit 1),
      exists (select 1 from public.profiles pr where pr.id = v_me and pr.linked_student_id = s.id)
    from public.students s
    where s.deleted_at is null
      and s.user_id in (select id from public.profiles where role = 'ceo')
      and jsonb_typeof(s.data -> 'courseIds') = 'array' and (s.data -> 'courseIds') ? p_course_id
    order by 2;
end;
$$;

-- Confirmar ('yes') o «No podré ir» ('no') a una clase de uno de mis cursos (alumno), hasta que
-- termine.
create or replace function public.cesi_class_confirm(p_course_id text, p_class_key text, p_status text)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_me uuid := (select auth.uid());
  v_course public.courses;
  v_day date;
  v_ok boolean;
begin
  if p_status not in ('yes', 'no') then
    raise exception 'Respuesta no válida.' using errcode = '22023';
  end if;
  if p_course_id not in (select public.cesi_student_courses(v_me)) then
    raise exception 'No estás en ese curso.' using errcode = '42501';
  end if;
  select * into v_course from public.courses
  where id = p_course_id and deleted_at is null and user_id in (select id from public.profiles where role = 'ceo')
  limit 1;
  if p_class_key like 'extra:%' then
    select exists (
      select 1 from public.extra_classes x
      where x.id = substr(p_class_key, 7) and x.user_id = v_course.user_id and x.deleted_at is null
        and x.data ->> 'courseId' = p_course_id and (x.data ->> 'end')::timestamptz > now()
    ) into v_ok;
  elsif p_class_key ~ '^\d{4}-\d{2}-\d{2}_\d{2}:\d{2}$' then
    v_day := substr(p_class_key, 1, 10)::date;
    select exists (
      select 1 from public.cesi_course_classes(v_course, (v_day - 2)::timestamp at time zone 'UTC', (v_day + 3)::timestamp at time zone 'UTC') k
      where k.class_key = p_class_key and k.ends_at > now()
    ) into v_ok;
  else
    v_ok := false;
  end if;
  if not coalesce(v_ok, false) then
    raise exception 'Esa clase no existe o ya ha terminado.' using errcode = '22023';
  end if;
  insert into public.class_confirmations (course_id, class_key, profile_id, status, updated_at)
  values (p_course_id, p_class_key, v_me, p_status, now())
  on conflict (course_id, class_key, profile_id) do update set status = excluded.status, updated_at = now();
end;
$$;

-- Permisos de las funciones: las internas, para nadie (salvo cesi_in_meeting, que usan las
-- reglas de acceso); las de la app, para las cuentas con sesión.
revoke all on function public.cesi_student_courses(uuid) from public, anon, authenticated;
revoke all on function public.cesi_teacher_courses(uuid) from public, anon, authenticated;
revoke all on function public.cesi_can_invite(uuid, uuid) from public, anon, authenticated;
revoke all on function public.cesi_course_classes(public.courses, timestamptz, timestamptz) from public, anon, authenticated;
revoke all on function public.cesi_person_name(uuid) from public, anon, authenticated;
revoke all on function public.cesi_in_meeting(uuid) from public, anon;
grant execute on function public.cesi_in_meeting(uuid) to authenticated;

revoke all on function public.cesi_invitable_people() from public, anon;
revoke all on function public.cesi_free_busy(uuid[], timestamptz, timestamptz, uuid) from public, anon;
revoke all on function public.cesi_my_meetings(timestamptz, timestamptz, uuid) from public, anon;
revoke all on function public.cesi_meeting_save(uuid, text, text, text, timestamptz, timestamptz, uuid[]) from public, anon;
revoke all on function public.cesi_meeting_cancel(uuid) from public, anon;
revoke all on function public.cesi_meeting_respond(uuid, text) from public, anon;
revoke all on function public.cesi_publish_my_busy(jsonb) from public, anon;
revoke all on function public.cesi_my_classes(timestamptz, timestamptz, uuid) from public, anon;
revoke all on function public.cesi_class_attendees(text, text) from public, anon;
revoke all on function public.cesi_class_confirm(text, text, text) from public, anon;
grant execute on function public.cesi_invitable_people() to authenticated;
grant execute on function public.cesi_free_busy(uuid[], timestamptz, timestamptz, uuid) to authenticated;
grant execute on function public.cesi_my_meetings(timestamptz, timestamptz, uuid) to authenticated;
grant execute on function public.cesi_meeting_save(uuid, text, text, text, timestamptz, timestamptz, uuid[]) to authenticated;
grant execute on function public.cesi_meeting_cancel(uuid) to authenticated;
grant execute on function public.cesi_meeting_respond(uuid, text) to authenticated;
grant execute on function public.cesi_publish_my_busy(jsonb) to authenticated;
grant execute on function public.cesi_my_classes(timestamptz, timestamptz, uuid) to authenticated;
grant execute on function public.cesi_class_attendees(text, text) to authenticated;
grant execute on function public.cesi_class_confirm(text, text, text) to authenticated;

notify pgrst, 'reload schema';

-- Comprobación: las 4 tablas con sus reglas de acceso, las funciones de la app que pueden usar
-- las cuentas con sesión (10) y cuántas personas puede invitar cada papel según sus cursos.
select
  (select count(*) from pg_class c join pg_namespace n on n.oid = c.relnamespace
     where n.nspname = 'public' and c.relrowsecurity
       and c.relname in ('shared_meetings', 'shared_meeting_participants', 'ceo_busy', 'class_confirmations')) as tablas_con_rls,
  (select count(*) from pg_policies where schemaname = 'public'
     and tablename in ('shared_meetings', 'shared_meeting_participants', 'ceo_busy', 'class_confirmations')) as politicas,
  (select count(*) from unnest(array[
      'public.cesi_invitable_people()',
      'public.cesi_free_busy(uuid[], timestamptz, timestamptz, uuid)',
      'public.cesi_my_meetings(timestamptz, timestamptz, uuid)',
      'public.cesi_meeting_save(uuid, text, text, text, timestamptz, timestamptz, uuid[])',
      'public.cesi_meeting_cancel(uuid)',
      'public.cesi_meeting_respond(uuid, text)',
      'public.cesi_publish_my_busy(jsonb)',
      'public.cesi_my_classes(timestamptz, timestamptz, uuid)',
      'public.cesi_class_attendees(text, text)',
      'public.cesi_class_confirm(text, text, text)'
    ]) as f (sig)
    where has_function_privilege('authenticated', f.sig, 'execute')) as funciones_con_permiso,
  (select count(*) from public.profiles p where p.role = 'equipo' and exists (select 1 from public.cesi_teacher_courses(p.id))) as profesores_con_cursos,
  (select count(*) from public.profiles p where p.role = 'alumno' and exists (select 1 from public.cesi_student_courses(p.id))) as alumnos_con_cursos,
  (select count(*) from public.shared_meetings) as reuniones;
