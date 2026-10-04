-- Esquema de Supabase para sincronizar CESI entre dispositivos.
--
-- Se ejecuta entero en Supabase → SQL Editor. Se puede volver a ejecutar sin perder datos
-- (también actualiza una base creada con una versión anterior de este archivo).
--
-- La app es local-first: guarda todo en localStorage y lo sincroniza con estas tablas.
-- Cada tabla guarda los mismos documentos JSON que la app tiene en localStorage (columna
-- `data`), con el id del documento y el usuario propietario.
--   updated_at         fecha del cambio en el dispositivo que lo hizo. Gana siempre la más
--                      reciente: el servidor ignora escrituras más antiguas que la guardada.
--   deleted_at         los borrados son filas marcadas, para que el borrado también se sincronice.
--   server_updated_at  la pone el servidor en cada cambio; los dispositivos piden "lo que ha
--                      cambiado desde la última vez" con ella.
-- Cada usuario solo puede leer y escribir sus propias filas (RLS).

-- ---------------------------------------------------------------------------
-- Reuniones y franjas no disponibles (localStorage: cesi_events_v1)
-- data: { title, start, end, category, tags, participantIds, guests, participants,
--         meetLink, description, isUnavailable, allDay, recurrence,
--         provisional, proposalId (opciones de una propuesta), projectId (tabla projects) o null,
--         notAttending (true: la organizo para otras personas y no asisto; no es tiempo mío),
--         agenda y acta de la reunión única: agenda [{ id, text, done }], notes (texto del acta) y
--           decisions [{ id, text }]; en una reunión que se repite, una por sesión: agendaByDate,
--           notesByDate y decisionsByDate { 'AAAA-MM-DD' (día que le toca en la serie): lo mismo },
--         exceptions (reunión que se repite) { 'AAAA-MM-DD' (día que le toca en la serie):
--           { cancelled: true } (ese día no hay reunión) o { start, end, title, participantIds, guests,
--           participants, projectId, description, meetLink, category, tags, reminder, acceptedUnavailable } (solo lo que cambia ese día) },
--         reminder: aviso antes de la reunión (ya no se usa: los recordatorios se quitaron; se conserva lo guardado),
--         acceptedUnavailable: [ids de contactos que no podían y se guardó igualmente] (también por día en exceptions) }
-- ---------------------------------------------------------------------------
create table if not exists public.events (
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  id text not null,
  data jsonb not null,
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  server_updated_at timestamptz not null default now(),
  primary key (user_id, id)
);

-- ---------------------------------------------------------------------------
-- Contactos (localStorage: cesi_contacts_v1)
-- data: { name, email, phone, organization, role, notes,
--         country (ISO 3166-1 alfa-2, obligatorio), timeZone (zona IANA, obligatoria),
--         countryUnreviewed (true si se le asignó España al migrar un contacto antiguo),
--         availability: horario semanal con varias franjas por día, en su zona horaria, o null,
--         groupIds: ids de los grupos a los que pertenece (tabla groups),
--         photo: referencia de la foto en Storage { store: 'cloud', path } o null,
--         teamProfile (miembros del equipo): { status: 'active' | 'former', leftAt,
--           roles: trayectoria en CESI [{ id, role, area, start, end }] (end null = rol actual),
--           role, area (copia del rol principal), joinedAt (fecha de incorporación antigua),
--           bio («Sobre esta persona», texto libre), quote (frase personal, hasta 150), links: [{ id, label, url }] (una sola
--           lista, redes incluidas), cv (si vino de una candidatura) },
--         links: enlaces que conserva un contacto que salió del equipo,
--         candidateOnly: true si el contacto existe solo por ser candidato,
--         candidacies (candidaturas a Vacantes, una por vacante): [{ id, vacancyId, appliedAt,
--           status: 'new' | 'interview' | 'accepted' | 'discarded', history: [{ status, at }], discardedAt,
--           cv: { store: 'cloud', path } (PDF en Storage) o { url } o null, notes }] }
--         (antes una sola candidatura en `candidacy`: la app la convierte al leerla)
-- ---------------------------------------------------------------------------
create table if not exists public.contacts (
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  id text not null,
  data jsonb not null,
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  server_updated_at timestamptz not null default now(),
  primary key (user_id, id)
);

-- ---------------------------------------------------------------------------
-- Grupos de contactos (localStorage: cesi_groups_v1)
-- data: { name, color }. Al borrar un grupo se quita de los groupIds de sus contactos.
-- ---------------------------------------------------------------------------
create table if not exists public.groups (
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  id text not null,
  data jsonb not null,
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  server_updated_at timestamptz not null default now(),
  primary key (user_id, id)
);

-- ---------------------------------------------------------------------------
-- Ajustes de un solo documento por usuario (id = nombre del ajuste)
--   id = 'working_hours' (cesi_working_hours_v1): horario semanal con varias franjas por día
--   id = 'preferences'   (cesi_preferences_v1):   { bufferMinutes, reminders: { defaultMinutes, timeZone } }
--                                                 (ninguno se usa ya: margen y recordatorios quitados; se conserva lo guardado)
--   id = 'team_areas'    (cesi_team_areas_v1):    lista ordenada de departamentos del equipo, p. ej. ["Directivo", "Radio"]
--                                                 (contacts.data.teamProfile.area y vacancies.data.area guardan el departamento)
--   id = 'migrations'    (cesi_migrations_v1):    { done: { [migración]: fecha } } migraciones de datos ya hechas
-- ---------------------------------------------------------------------------
create table if not exists public.settings (
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  id text not null,
  data jsonb not null,
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  server_updated_at timestamptz not null default now(),
  primary key (user_id, id)
);

-- ---------------------------------------------------------------------------
-- Reglas por tipo de reunión (localStorage: cesi_rules_v1)
-- data: { enabled, targetType: 'category' | 'tag', target, days: [0..6],
--         timeOfDay: 'any' | 'morning' | 'afternoon' | 'custom', customStart, customEnd,
--         maxDurationMinutes, maxPerDay }
-- ---------------------------------------------------------------------------
create table if not exists public.rules (
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  id text not null,
  data jsonb not null,
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  server_updated_at timestamptz not null default now(),
  primary key (user_id, id)
);

-- ---------------------------------------------------------------------------
-- Propuestas de varias opciones (localStorage: cesi_proposals_v1)
-- data: { title, durationMinutes, category, tags, projectId, participantIds, guests, notAttending }
-- Cada opción es una fila de events con data.provisional = true y data.proposalId = id.
-- ---------------------------------------------------------------------------
create table if not exists public.proposals (
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  id text not null,
  data jsonb not null,
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  server_updated_at timestamptz not null default now(),
  primary key (user_id, id)
);

-- ---------------------------------------------------------------------------
-- Disponibilidad declarada semana a semana (localStorage: cesi_weekly_availability_v1)
-- id = 'wk_' + lunes de la semana (p. ej. 'wk_2026-09-28'), uno por semana.
-- data: { weekStart: 'AAAA-MM-DD' (lunes), week: horario semanal con varias franjas por día
--         o null (se usa el horario habitual), dismissed: true si elegí el horario habitual }
-- Si una semana está declarada, sustituye al horario habitual esos 7 días.
-- ---------------------------------------------------------------------------
create table if not exists public.weekly_availability (
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  id text not null,
  data jsonb not null,
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  server_updated_at timestamptz not null default now(),
  primary key (user_id, id)
);

-- ---------------------------------------------------------------------------
-- Proyectos de las reuniones (localStorage: cesi_projects_v1)
-- data: { name, color, status: 'active' | 'archived' }. Cada reunión tiene como mucho uno
-- (events.data.projectId). Al borrar un proyecto, sus reuniones se quedan sin proyecto.
-- ---------------------------------------------------------------------------
create table if not exists public.projects (
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  id text not null,
  data jsonb not null,
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  server_updated_at timestamptz not null default now(),
  primary key (user_id, id)
);

-- ---------------------------------------------------------------------------
-- Tareas (localStorage: cesi_tasks_v1)
-- data: { title, assignee: 'me' | id de contacto (responsable), dueDate: 'AAAA-MM-DD' o null,
--         status: 'pending' | 'done', doneAt,
--         source: null (tarea suelta) o { eventId (tabla events), sessionKey: 'AAAA-MM-DD' (sesión de
--           una reunión que se repite) o null, title, start } (reunión de la que sale),
--         decisionId: decisión del acta de la que sale (events.data.decisions / decisionsByDate) o null }
-- ---------------------------------------------------------------------------
create table if not exists public.tasks (
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  id text not null,
  data jsonb not null,
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  server_updated_at timestamptz not null default now(),
  primary key (user_id, id)
);

-- ---------------------------------------------------------------------------
-- Vacantes (localStorage: cesi_vacancies_v1)
-- data: { title, area, description, requirements, openedAt: 'AAAA-MM-DD',
--         status: 'open' | 'in_progress' | 'filled', hiredContactIds: [ids de contactos],
--         erasedCandidates: [{ discardedAt, erasedAt }] (registro anónimo de candidatos borrados) }
-- Los candidatos son filas de contacts con una candidatura en data.candidacies con vacancyId = id.
-- ---------------------------------------------------------------------------
create table if not exists public.vacancies (
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  id text not null,
  data jsonb not null,
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  server_updated_at timestamptz not null default now(),
  primary key (user_id, id)
);

-- ---------------------------------------------------------------------------
-- Actualización desde la versión anterior de este archivo
-- ---------------------------------------------------------------------------
do $$
begin
  -- settings tenía la columna `key` en lugar de `id`.
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'settings' and column_name = 'key'
  ) and not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'settings' and column_name = 'id'
  ) then
    alter table public.settings rename column key to id;
  end if;
end;
$$;

alter table public.settings add column if not exists deleted_at timestamptz;

-- El trigger antiguo ponía updated_at = now() y rompía "gana el cambio más reciente".
do $$
declare
  t text;
begin
  foreach t in array array['events', 'contacts', 'groups', 'settings', 'rules', 'proposals', 'weekly_availability', 'projects', 'vacancies', 'tasks'] loop
    execute format('drop trigger if exists %I_touch on public.%I', t, t);
    execute format('alter table public.%I add column if not exists server_updated_at timestamptz not null default now()', t);
  end loop;
end;
$$;

drop function if exists public.cesi_touch_updated_at();

-- ---------------------------------------------------------------------------
-- Gana el updated_at más reciente
-- ---------------------------------------------------------------------------
-- Si llega una escritura más antigua que la guardada (p. ej. de un dispositivo que estuvo sin
-- conexión), se ignora. En cada cambio aceptado se renueva server_updated_at.
create or replace function public.cesi_keep_newest()
returns trigger
language plpgsql
as $$
begin
  if tg_op = 'UPDATE' and new.updated_at < old.updated_at then
    return null;
  end if;
  new.server_updated_at = clock_timestamp();
  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- Triggers, índices, RLS y Realtime de todas las tablas
-- ---------------------------------------------------------------------------
do $$
declare
  t text;
begin
  foreach t in array array['events', 'contacts', 'groups', 'settings', 'rules', 'proposals', 'weekly_availability', 'projects', 'vacancies', 'tasks'] loop
    execute format('drop trigger if exists %I_keep_newest on public.%I', t, t);
    execute format(
      'create trigger %I_keep_newest before insert or update on public.%I for each row execute function public.cesi_keep_newest()',
      t, t
    );
    execute format('drop index if exists public.%I', t || '_updated_idx');
    execute format('create index if not exists %I on public.%I (user_id, server_updated_at)', t || '_server_updated_idx', t);

    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists "%s: leer las mías" on public.%I', t, t);
    execute format('drop policy if exists "%s: crear las mías" on public.%I', t, t);
    execute format('drop policy if exists "%s: editar las mías" on public.%I', t, t);
    execute format('drop policy if exists "%s: borrar las mías" on public.%I', t, t);
    execute format('create policy "%s: leer las mías" on public.%I for select using (auth.uid() = user_id)', t, t);
    execute format('create policy "%s: crear las mías" on public.%I for insert with check (auth.uid() = user_id)', t, t);
    execute format(
      'create policy "%s: editar las mías" on public.%I for update using (auth.uid() = user_id) with check (auth.uid() = user_id)',
      t, t
    );
    execute format('create policy "%s: borrar las mías" on public.%I for delete using (auth.uid() = user_id)', t, t);

    -- Realtime: los cambios de otro dispositivo llegan solos (respetando RLS).
    begin
      execute format('alter publication supabase_realtime add table public.%I', t);
    exception
      when duplicate_object then null;
      when undefined_object then null;
    end;
  end loop;
end;
$$;

-- ---------------------------------------------------------------------------
-- Recordatorios: dispositivos suscritos a las notificaciones (Web Push)
-- ---------------------------------------------------------------------------
-- YA NO SE USAN: los recordatorios se quitaron de la app (y la Edge Function send-reminders del
-- repositorio). push_subscriptions y reminders_sent se dejan para no borrar datos; si quieres,
-- puedes eliminarlas a mano en Supabase.
-- Una fila por dispositivo (navegador) con los avisos activados. No va por la sincronización:
-- la app la escribe directamente al activar o quitar un dispositivo en Ajustes → Recordatorios.
-- La Edge Function send-reminders (con la clave de servicio) las lee para enviar los avisos.
--   id           huella del endpoint (sha-256), para no repetir el mismo dispositivo
--   endpoint     dirección del servicio push del navegador; p256dh y auth: claves del cifrado
--   device_name  p. ej. "Chrome en Windows"; time_zone: zona horaria del dispositivo
create table if not exists public.push_subscriptions (
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  id text not null,
  endpoint text not null,
  p256dh text not null,
  auth text not null,
  device_name text not null default '',
  time_zone text,
  user_agent text,
  created_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  primary key (user_id, id)
);

alter table public.push_subscriptions enable row level security;
drop policy if exists "push_subscriptions: leer las mías" on public.push_subscriptions;
drop policy if exists "push_subscriptions: crear las mías" on public.push_subscriptions;
drop policy if exists "push_subscriptions: editar las mías" on public.push_subscriptions;
drop policy if exists "push_subscriptions: borrar las mías" on public.push_subscriptions;
create policy "push_subscriptions: leer las mías" on public.push_subscriptions
  for select to authenticated using ((select auth.uid()) = user_id);
create policy "push_subscriptions: crear las mías" on public.push_subscriptions
  for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "push_subscriptions: editar las mías" on public.push_subscriptions
  for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "push_subscriptions: borrar las mías" on public.push_subscriptions
  for delete to authenticated using ((select auth.uid()) = user_id);

-- Avisos ya enviados (para no enviar dos veces el mismo). key = ocurrencia | hora | minutos.
-- Solo la usa la Edge Function (clave de servicio): con RLS activo y sin políticas, nadie más
-- puede leerla ni escribirla.
create table if not exists public.reminders_sent (
  user_id uuid not null references auth.users (id) on delete cascade,
  key text not null,
  sent_at timestamptz not null default now(),
  primary key (user_id, key)
);

alter table public.reminders_sent enable row level security;
create index if not exists reminders_sent_sent_at_idx on public.reminders_sent (sent_at);

-- La ejecución cada minuto (pg_cron, antes en supabase/cron.sql) ya no existe.

-- ---------------------------------------------------------------------------
-- Fotos de contactos y CV de candidatos (Supabase Storage)
-- ---------------------------------------------------------------------------
-- Bucket privado "cesi-photos". Cada usuario guarda sus archivos en su carpeta:
--   {user_id}/photos/{id}.webp   fotos (recortadas a 512×512, WebP)
--   {user_id}/cvs/{id}.pdf       CV de candidatos (PDF de hasta 5 MB)
-- En los documentos (contacts.data.photo, contacts.data.candidacies[].cv) solo va la ruta.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('cesi-photos', 'cesi-photos', false, 5242880, array['image/webp', 'image/jpeg', 'application/pdf'])
on conflict (id) do update
  set public = false,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "cesi-photos: leer los míos" on storage.objects;
drop policy if exists "cesi-photos: subir los míos" on storage.objects;
drop policy if exists "cesi-photos: cambiar los míos" on storage.objects;
drop policy if exists "cesi-photos: borrar los míos" on storage.objects;

create policy "cesi-photos: leer los míos" on storage.objects
  for select to authenticated
  using (bucket_id = 'cesi-photos' and (storage.foldername(name))[1] = (select auth.uid()::text));

create policy "cesi-photos: subir los míos" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'cesi-photos' and (storage.foldername(name))[1] = (select auth.uid()::text));

create policy "cesi-photos: cambiar los míos" on storage.objects
  for update to authenticated
  using (bucket_id = 'cesi-photos' and (storage.foldername(name))[1] = (select auth.uid()::text))
  with check (bucket_id = 'cesi-photos' and (storage.foldername(name))[1] = (select auth.uid()::text));

create policy "cesi-photos: borrar los míos" on storage.objects
  for delete to authenticated
  using (bucket_id = 'cesi-photos' and (storage.foldername(name))[1] = (select auth.uid()::text));

-- ---------------------------------------------------------------------------
-- Enlace para que un contacto rellene su ficha (página pública /ficha/<token>)
-- ---------------------------------------------------------------------------
-- La persona abre el enlace sin iniciar sesión. La página no toca las tablas: solo llama a
-- cesi_contact_form_get y cesi_contact_form_save con el token, que comprueban que el enlace
-- existe, no está desactivado ni caducado, y solo leen o cambian los campos permitidos del
-- contacto: nombre, email, país y zona, y disponibilidad. El resto de la ficha (teléfono,
-- organización, cargo, notas…) ni se envía ni se toca al guardar.
-- Al guardar se pone data.selfUpdatedAt y el cambio llega a la app como cualquier otro.
--   token       32 bytes aleatorios en base64url (lo genera la app)
--   expires_at  caducidad (30 días por defecto; la app puede elegir otra al crearlo)
--   revoked     true al regenerar o desactivar el enlace
create table if not exists public.contact_links (
  token text primary key check (length(token) between 32 and 100),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  contact_id text not null,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default now() + interval '30 days',
  revoked boolean not null default false
);

create index if not exists contact_links_contact_idx on public.contact_links (user_id, contact_id);

alter table public.contact_links enable row level security;
drop policy if exists "contact_links: leer los míos" on public.contact_links;
drop policy if exists "contact_links: crear los míos" on public.contact_links;
drop policy if exists "contact_links: editar los míos" on public.contact_links;
drop policy if exists "contact_links: borrar los míos" on public.contact_links;
create policy "contact_links: leer los míos" on public.contact_links
  for select to authenticated using ((select auth.uid()) = user_id);
create policy "contact_links: crear los míos" on public.contact_links
  for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "contact_links: editar los míos" on public.contact_links
  for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "contact_links: borrar los míos" on public.contact_links
  for delete to authenticated using ((select auth.uid()) = user_id);

-- ¿Es un horario semanal válido (o null)? [{ day: 0..6, enabled, slots: [{ start: 'HH:mm', end }] }]
create or replace function public.cesi_valid_week(p_week jsonb)
returns boolean
language plpgsql
immutable
set search_path = ''
as $$
declare
  e jsonb;
  s jsonb;
  seen int[] := '{}';
  hhmm constant text := '^(([01][0-9]|2[0-3]):[0-5][0-9]|24:00)$';
begin
  if p_week is null or jsonb_typeof(p_week) = 'null' then
    return true;
  end if;
  if jsonb_typeof(p_week) <> 'array' or jsonb_array_length(p_week) <> 7 then
    return false;
  end if;
  for e in select value from jsonb_array_elements(p_week) loop
    if jsonb_typeof(e) <> 'object' then
      return false;
    end if;
    if exists (select 1 from jsonb_object_keys(e) k where k not in ('day', 'enabled', 'slots')) then
      return false;
    end if;
    if jsonb_typeof(e -> 'day') is distinct from 'number'
      or jsonb_typeof(e -> 'enabled') is distinct from 'boolean'
      or jsonb_typeof(e -> 'slots') is distinct from 'array' then
      return false;
    end if;
    if (e ->> 'day') !~ '^[0-6]$' or (e ->> 'day')::int = any (seen) then
      return false;
    end if;
    seen := seen || (e ->> 'day')::int;
    if jsonb_array_length(e -> 'slots') > 8 then
      return false;
    end if;
    for s in select value from jsonb_array_elements(e -> 'slots') loop
      if jsonb_typeof(s) <> 'object' then
        return false;
      end if;
      if exists (select 1 from jsonb_object_keys(s) k where k not in ('start', 'end')) then
        return false;
      end if;
      if jsonb_typeof(s -> 'start') is distinct from 'string' or jsonb_typeof(s -> 'end') is distinct from 'string'
        or (s ->> 'start') !~ hhmm or (s ->> 'end') !~ hhmm then
        return false;
      end if;
    end loop;
  end loop;
  return true;
end;
$$;

-- Datos que ve la persona: solo los campos permitidos de su contacto. null si el enlace no vale.
create or replace function public.cesi_contact_form_get(p_token text)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_data jsonb;
begin
  if p_token is null or length(p_token) > 100 then
    return null;
  end if;
  select c.data into v_data
  from public.contact_links l
  join public.contacts c on c.user_id = l.user_id and c.id = l.contact_id
  where l.token = p_token and not l.revoked and l.expires_at > now() and c.deleted_at is null;
  if v_data is null then
    return null;
  end if;
  return jsonb_build_object(
    'name', coalesce(v_data ->> 'name', ''),
    'email', coalesce(v_data ->> 'email', ''),
    'country', coalesce(v_data ->> 'country', ''),
    'timeZone', coalesce(v_data ->> 'timeZone', ''),
    'availability', case when jsonb_typeof(v_data -> 'availability') = 'array' then v_data -> 'availability' end
  );
end;
$$;

-- Guarda lo que envía la persona. Solo acepta los campos de la lista blanca, con su tipo y
-- longitud máxima; cualquier otra cosa se rechaza entera. Nombre, país y zona, y disponibilidad
-- (al menos un día con una franja) son obligatorios; el email es opcional. Los demás campos del
-- contacto se conservan tal cual. Errores (en el mensaje): invalid_link, invalid_data,
-- name_required, invalid_email, invalid_zone, invalid_availability.
create or replace function public.cesi_contact_form_save(p_token text, p_fields jsonb)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_link public.contact_links%rowtype;
  v_limits constant jsonb := '{"name": 120, "email": 200}';
  v_clean jsonb := '{}'::jsonb;
  v_key text;
  v_text text;
  v_old timestamptz;
  v_stamp timestamptz;
  v_iso text;
begin
  if p_token is null or length(p_token) > 100 then
    raise exception 'invalid_link';
  end if;
  select * into v_link from public.contact_links
  where token = p_token and not revoked and expires_at > now();
  if not found then
    raise exception 'invalid_link';
  end if;

  if p_fields is null or jsonb_typeof(p_fields) <> 'object' or octet_length(p_fields::text) > 20000 then
    raise exception 'invalid_data';
  end if;
  if exists (
    select 1 from jsonb_object_keys(p_fields) k
    where k not in ('name', 'email', 'country', 'timeZone', 'availability')
  ) then
    raise exception 'invalid_data';
  end if;

  for v_key in select jsonb_object_keys(v_limits) loop
    if p_fields ? v_key then
      if jsonb_typeof(p_fields -> v_key) <> 'string' then
        raise exception 'invalid_data';
      end if;
      v_text := btrim(p_fields ->> v_key);
      if length(v_text) > (v_limits ->> v_key)::int then
        raise exception 'invalid_data';
      end if;
      v_clean := v_clean || jsonb_build_object(v_key, v_text);
    end if;
  end loop;
  if coalesce(v_clean ->> 'name', '') = '' then
    raise exception 'name_required';
  end if;
  if coalesce(v_clean ->> 'email', '') <> '' and (v_clean ->> 'email') !~ '^[^[:space:]@]+@[^[:space:]@]+[.][^[:space:]@]+$' then
    raise exception 'invalid_email';
  end if;

  -- País y zona (obligatorios) van juntos, y la zona tiene que existir.
  if jsonb_typeof(p_fields -> 'country') is distinct from 'string'
    or jsonb_typeof(p_fields -> 'timeZone') is distinct from 'string'
    or (p_fields ->> 'country') !~ '^[A-Z]{2}$'
    or length(p_fields ->> 'timeZone') > 64
    or not exists (select 1 from pg_catalog.pg_timezone_names where name = p_fields ->> 'timeZone') then
    raise exception 'invalid_zone';
  end if;
  v_clean := v_clean || jsonb_build_object(
    'country', p_fields ->> 'country',
    'timeZone', p_fields ->> 'timeZone',
    'countryUnreviewed', false
  );

  -- Disponibilidad obligatoria: un horario válido con al menos un día activo con franjas.
  -- En dos pasos: SQL no asegura el orden de un OR, y el segundo solo vale con un horario válido.
  if jsonb_typeof(p_fields -> 'availability') is distinct from 'array'
    or not public.cesi_valid_week(p_fields -> 'availability') then
    raise exception 'invalid_availability';
  end if;
  if not exists (
    select 1 from jsonb_array_elements(p_fields -> 'availability') e
    where (e ->> 'enabled')::boolean and jsonb_array_length(e -> 'slots') > 0
  ) then
    raise exception 'invalid_availability';
  end if;
  v_clean := v_clean || jsonb_build_object('availability', p_fields -> 'availability');

  select updated_at into v_old from public.contacts
  where user_id = v_link.user_id and id = v_link.contact_id and deleted_at is null
  for update;
  if not found then
    raise exception 'invalid_link';
  end if;

  -- Nunca anterior a la fila guardada: si no, cesi_keep_newest ignoraría el cambio.
  v_stamp := greatest(clock_timestamp(), v_old + interval '1 millisecond');
  v_iso := to_char(v_stamp at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"');
  v_clean := v_clean || jsonb_build_object('selfUpdatedAt', v_iso, 'updatedAt', v_iso);

  update public.contacts
  set data = data || v_clean, updated_at = v_stamp
  where user_id = v_link.user_id and id = v_link.contact_id;

  return jsonb_build_object('ok', true, 'savedAt', v_iso);
end;
$$;

-- Solo la página pública (anon) y la app pueden llamar a las dos funciones del formulario;
-- la de validar horarios es interna.
revoke all on function public.cesi_valid_week(jsonb) from public, anon, authenticated;
revoke all on function public.cesi_contact_form_get(text) from public;
revoke all on function public.cesi_contact_form_save(text, jsonb) from public;
grant execute on function public.cesi_contact_form_get(text) to anon, authenticated;
grant execute on function public.cesi_contact_form_save(text, jsonb) to anon, authenticated;

-- ---------------------------------------------------------------------------
-- Confirmación de asistencia a una reunión (página pública /confirmar/<token>)
-- ---------------------------------------------------------------------------
-- Un enlace por participante y reunión; en las que se repiten, por participante y día. La
-- persona abre el enlace sin iniciar sesión y la página solo llama a cesi_meeting_invite_get y
-- cesi_meeting_invite_respond con el token: ve el título, el día, la hora y su propia respuesta,
-- nada más (ni participantes, ni notas, ni descripción).
--   token            32 bytes aleatorios en base64url (lo genera la app)
--   event_id         id de la reunión (de la serie, si se repite) en la tabla events
--   occurrence_key   '' en una reunión única; 'AAAA-MM-DD' (clave del día en la serie) si se repite
--   participant_key  'contact:<id>' o 'guest:<nombre>' (invitados que no son contactos)
--   name             nombre para el saludo
--   starts_at/ends_at  hora de la reunión para este enlace (la app la mantiene al día). Si cambia
--                    y ya había respuesta, se marca needs_reconfirm (trigger de abajo).
--   response         'yes' | 'no' | 'maybe' o null (sin responder); comment: hasta 300 caracteres
--   revoked          true si la app quita al participante o se borra la reunión o ese día
-- El enlace deja de valer al terminar la reunión, y se puede responder hasta que empieza.
-- Además de revoked, las funciones comprueban en la propia reunión que sigue existiendo, que ese
-- día no está cancelado ni fuera de la serie y que el participante sigue en ella (también en los
-- cambios de un solo día): un cambio hecho sin conexión anula el enlace en cuanto se sincroniza.
create table if not exists public.meeting_invites (
  token text primary key check (length(token) between 32 and 100),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  event_id text not null,
  occurrence_key text not null default '' check (occurrence_key = '' or occurrence_key ~ '^\d{4}-\d{2}-\d{2}$'),
  participant_key text not null check (participant_key ~ '^(contact|guest):.+' and length(participant_key) <= 300),
  name text not null default '' check (length(name) <= 200),
  starts_at timestamptz not null,
  ends_at timestamptz not null check (ends_at > starts_at),
  response text check (response in ('yes', 'no', 'maybe')),
  comment text check (length(comment) <= 300),
  responded_at timestamptz,
  needs_reconfirm boolean not null default false,
  revoked boolean not null default false,
  created_at timestamptz not null default now()
);

-- Un solo enlace activo por participante y reunión (o día).
create unique index if not exists meeting_invites_active_idx
  on public.meeting_invites (user_id, event_id, occurrence_key, participant_key) where not revoked;
create index if not exists meeting_invites_ends_idx on public.meeting_invites (user_id, ends_at);

alter table public.meeting_invites enable row level security;
drop policy if exists "meeting_invites: leer los míos" on public.meeting_invites;
drop policy if exists "meeting_invites: crear los míos" on public.meeting_invites;
drop policy if exists "meeting_invites: editar los míos" on public.meeting_invites;
drop policy if exists "meeting_invites: borrar los míos" on public.meeting_invites;
create policy "meeting_invites: leer los míos" on public.meeting_invites
  for select to authenticated using ((select auth.uid()) = user_id);
create policy "meeting_invites: crear los míos" on public.meeting_invites
  for insert to authenticated
  with check ((select auth.uid()) = user_id and response is null and comment is null and not needs_reconfirm and not revoked);
create policy "meeting_invites: editar los míos" on public.meeting_invites
  for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "meeting_invites: borrar los míos" on public.meeting_invites
  for delete to authenticated using ((select auth.uid()) = user_id);

-- La app solo cambia la hora, el día o la reunión (al moverla), el participante (un invitado
-- que pasa a ser contacto) y revoked. La respuesta solo la escribe cesi_meeting_invite_respond.
revoke all on public.meeting_invites from anon;
revoke update on public.meeting_invites from authenticated;
grant select, insert, delete on public.meeting_invites to authenticated;
grant update (event_id, occurrence_key, participant_key, name, starts_at, ends_at, revoked)
  on public.meeting_invites to authenticated;

-- Si cambia la hora y ya había respuesta, hay que confirmar de nuevo (la respuesta anterior se conserva).
create or replace function public.cesi_meeting_invite_reschedule()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if (new.starts_at, new.ends_at) is distinct from (old.starts_at, old.ends_at) and old.response is not null then
    new.needs_reconfirm := true;
  end if;
  return new;
end;
$$;

drop trigger if exists meeting_invites_reschedule on public.meeting_invites;
create trigger meeting_invites_reschedule before update on public.meeting_invites
  for each row execute function public.cesi_meeting_invite_reschedule();

-- Realtime: las respuestas llegan solas a la app (respetando RLS).
do $$
begin
  alter publication supabase_realtime add table public.meeting_invites;
exception
  when duplicate_object then null;
  when undefined_object then null;
end;
$$;

-- Reunión (o día de la serie) del enlace si el enlace sigue valiendo: { title, allDay, timeZone },
-- o null. Comprueba el enlace (sin desactivar ni caducado), la reunión (sin borrar, y única o
-- serie según el enlace), el día (no cancelado ni después del final de la serie) y que el
-- participante sigue en ella. Interna: solo la usan las dos funciones de abajo.
create or replace function public.cesi_meeting_invite_check(p_invite public.meeting_invites)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_data jsonb;
  v_ex jsonb := '{}'::jsonb;
  v_ids jsonb;
  v_guests jsonb;
  v_until text;
  v_kind text;
  v_who text;
  v_zone text;
begin
  if p_invite.token is null or p_invite.revoked or p_invite.ends_at <= now() then
    return null;
  end if;
  select e.data into v_data from public.events e
  where e.user_id = p_invite.user_id and e.id = p_invite.event_id and e.deleted_at is null;
  if v_data is null or (v_data ->> 'isUnavailable') = 'true' then
    return null;
  end if;

  if jsonb_typeof(v_data -> 'recurrence') = 'object' then
    if p_invite.occurrence_key = '' then
      return null;
    end if;
    if jsonb_typeof(v_data -> 'exceptions' -> p_invite.occurrence_key) = 'object' then
      v_ex := v_data -> 'exceptions' -> p_invite.occurrence_key;
    end if;
    if (v_ex ->> 'cancelled') = 'true' then
      return null;
    end if;
    -- Series partidas o acortadas: los días después de "until" ya no son de esta serie.
    v_until := v_data -> 'recurrence' ->> 'until';
    if v_until ~ '^\d{4}-\d{2}-\d{2}T[0-9:.]+(Z|[+-]\d{2}:?\d{2})$' and p_invite.starts_at > v_until::timestamptz then
      return null;
    end if;
  elsif p_invite.occurrence_key <> '' then
    return null;
  end if;

  -- ¿Sigue en la reunión? Los participantes de ese día, si tiene los suyos, o los de la reunión.
  v_ids := case when v_ex ? 'participantIds' then v_ex -> 'participantIds' else v_data -> 'participantIds' end;
  v_guests := case when v_ex ? 'guests' then v_ex -> 'guests' else v_data -> 'guests' end;
  v_kind := split_part(p_invite.participant_key, ':', 1);
  v_who := substr(p_invite.participant_key, length(v_kind) + 2);
  -- (Reuniones antiguas sin participantIds, solo con nombres: lo comprueba la app al revocar.)
  if jsonb_typeof(v_ids) = 'array' then
    if v_kind = 'contact' and not (v_ids ? v_who) then
      return null;
    end if;
    if v_kind = 'guest' and not (jsonb_typeof(v_guests) = 'array' and v_guests ? v_who) then
      return null;
    end if;
  end if;

  -- Zona horaria de la ficha del contacto; null en invitados (la página usa la del navegador).
  if v_kind = 'contact' then
    select nullif(c.data ->> 'timeZone', '') into v_zone from public.contacts c
    where c.user_id = p_invite.user_id and c.id = v_who and c.deleted_at is null;
  end if;

  return jsonb_build_object(
    'title', left(coalesce(v_ex ->> 'title', v_data ->> 'title', ''), 300),
    'allDay', coalesce(coalesce(v_ex ->> 'allDay', v_data ->> 'allDay') = 'true', false),
    'timeZone', v_zone
  );
end;
$$;

-- Lo que ve la persona, o null si el enlace no vale.
create or replace function public.cesi_meeting_invite_get(p_token text)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_invite public.meeting_invites%rowtype;
  v_meeting jsonb;
begin
  if p_token is null or length(p_token) > 100 then
    return null;
  end if;
  select * into v_invite from public.meeting_invites where token = p_token;
  if not found then
    return null;
  end if;
  v_meeting := public.cesi_meeting_invite_check(v_invite);
  if v_meeting is null then
    return null;
  end if;
  return v_meeting || jsonb_build_object(
    'name', v_invite.name,
    'startsAt', v_invite.starts_at,
    'endsAt', v_invite.ends_at,
    'response', v_invite.response,
    'comment', coalesce(v_invite.comment, ''),
    'respondedAt', v_invite.responded_at,
    'needsReconfirm', v_invite.needs_reconfirm,
    'canRespond', now() < v_invite.starts_at
  );
end;
$$;

-- Guarda la respuesta: solo 'yes', 'no' o 'maybe' y un comentario opcional de hasta 300
-- caracteres, con el enlace válido y antes de que empiece la reunión.
-- Errores (en el mensaje): invalid_link, meeting_started, invalid_response, comment_too_long.
create or replace function public.cesi_meeting_invite_respond(p_token text, p_response text, p_comment text)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_invite public.meeting_invites%rowtype;
  v_comment text;
begin
  if p_token is null or length(p_token) > 100 then
    raise exception 'invalid_link';
  end if;
  select * into v_invite from public.meeting_invites where token = p_token for update;
  if not found or public.cesi_meeting_invite_check(v_invite) is null then
    raise exception 'invalid_link';
  end if;
  if now() >= v_invite.starts_at then
    raise exception 'meeting_started';
  end if;
  if p_response is null or p_response not in ('yes', 'no', 'maybe') then
    raise exception 'invalid_response';
  end if;
  v_comment := nullif(btrim(coalesce(p_comment, '')), '');
  if length(v_comment) > 300 then
    raise exception 'comment_too_long';
  end if;

  update public.meeting_invites
  set response = p_response, comment = v_comment, responded_at = now(), needs_reconfirm = false
  where token = p_token;

  return jsonb_build_object('ok', true, 'response', p_response, 'comment', coalesce(v_comment, ''), 'respondedAt', now());
end;
$$;

-- La página pública (anon) y la app pueden llamar a get y respond; las demás son internas.
revoke all on function public.cesi_meeting_invite_check(public.meeting_invites) from public, anon, authenticated;
revoke all on function public.cesi_meeting_invite_reschedule() from public, anon, authenticated;
revoke all on function public.cesi_meeting_invite_get(text) from public;
revoke all on function public.cesi_meeting_invite_respond(text, text, text) from public;
grant execute on function public.cesi_meeting_invite_get(text) to anon, authenticated;
grant execute on function public.cesi_meeting_invite_respond(text, text, text) to anon, authenticated;
