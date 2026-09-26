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
--         notes (reunión única) o notesByDate { 'AAAA-MM-DD': texto } (reunión que se repite),
--         exceptions (reunión que se repite) { 'AAAA-MM-DD' (día que le toca en la serie):
--           { cancelled: true } (ese día no hay reunión) o { start, end, title, participantIds, guests,
--           participants, projectId, description, meetLink, category, tags, reminder, acceptedUnavailable } (solo lo que cambia ese día) },
--         reminder: aviso antes de la reunión: null (el aviso por defecto), 5 | 10 | 15 | 30 | 60 (minutos) o 'none',
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
--         teamProfile (miembros del equipo): { status: 'active' | 'former', leftAt, role, area,
--           joinedAt, bio (trayectoria, texto libre), quote (frase personal, hasta 150), links: [{ id, label, url }] (una sola
--           lista, redes incluidas), cv (si vino de una candidatura) },
--         links: enlaces que conserva un contacto que salió del equipo,
--         candidacy (candidatos de Vacantes): { vacancyId, appliedAt, status: 'new' | 'interview' |
--           'accepted' | 'discarded', history: [{ status, at }], discardedAt,
--           cv: { store: 'cloud', path } (PDF en Storage) o { url } o null } }
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
--   id = 'preferences'   (cesi_preferences_v1):   { bufferMinutes, reminders: { defaultMinutes (5, 10, 15, 30 o 60),
--                                                   timeZone (zona IANA en la que se calculan los avisos) } }
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
-- data: { title, durationMinutes, category, tags, projectId, participantIds, guests }
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
-- Vacantes (localStorage: cesi_vacancies_v1)
-- data: { title, area, description, requirements, openedAt: 'AAAA-MM-DD',
--         status: 'open' | 'in_progress' | 'filled', hiredContactIds: [ids de contactos],
--         erasedCandidates: [{ discardedAt, erasedAt }] (registro anónimo de candidatos borrados) }
-- Los candidatos son filas de contacts con data.candidacy.vacancyId = id.
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
  foreach t in array array['events', 'contacts', 'groups', 'settings', 'rules', 'proposals', 'weekly_availability', 'projects', 'vacancies'] loop
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
  foreach t in array array['events', 'contacts', 'groups', 'settings', 'rules', 'proposals', 'weekly_availability', 'projects', 'vacancies'] loop
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

-- La ejecución cada minuto (pg_cron) está en supabase/cron.sql: se ejecuta aparte, después de
-- desplegar la función y guardar sus secretos.

-- ---------------------------------------------------------------------------
-- Fotos de contactos y CV de candidatos (Supabase Storage)
-- ---------------------------------------------------------------------------
-- Bucket privado "cesi-photos". Cada usuario guarda sus archivos en su carpeta:
--   {user_id}/photos/{id}.webp   fotos (recortadas a 512×512, WebP)
--   {user_id}/cvs/{id}.pdf       CV de candidatos (PDF de hasta 5 MB)
-- En los documentos (contacts.data.photo, contacts.data.candidacy.cv) solo va la ruta.
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
