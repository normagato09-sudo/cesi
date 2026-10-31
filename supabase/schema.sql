-- Esquema de Supabase para sincronizar CIFA entre dispositivos.
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
--           formerGroupHandled (ya se le metió en el grupo «Antiguos miembros» o se decidió no hacerlo),
--           keepActive (sigue en el equipo aunque tenga todos sus roles terminados),
--           roles: trayectoria en CIFA [{ id, role, area, start, end }] (end null = rol actual),
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
-- Ya no se usa (ahora hay un solo horario fijo, "Mi horario": settings 'working_hours'); se
-- conserva con lo que hubiera.
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
-- Alumnos (localStorage: cesi_students_v1)
-- data: { name, email, phone (teléfono / WhatsApp),
--         discord: usuario de Discord ('' si no se sabe),
--         birthday: fecha de cumpleaños 'AAAA-MM-DD' o '' (la edad se calcula cada día, no se guarda),
--         country (ISO 3166-1 alfa-2, obligatorio), timeZone (zona IANA, obligatoria),
--         courseIds: ids de los cursos en los que está (tabla courses; la inscripción solo se guarda aquí),
--         notes, enrolledAt: 'AAAA-MM-DD' (fecha de alta),
--         availability: horario semanal con varias franjas por día, en su zona horaria, o null }
--       Los alumnos guardados antes pueden tener newsletter (ya no se usa): se conserva tal cual.
--       Más adelante, el propio alumno podrá rellenar con un enlace (students.js, SELF_SERVICE_FIELDS):
--       discord (obligatorio), name, birthday, country y timeZone, email, availability y
--       requestedCourseIds (cursos a los que quiere unirse; pasan a courseIds cuando se aprueban).
-- ---------------------------------------------------------------------------
create table if not exists public.students (
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  id text not null,
  data jsonb not null,
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  server_updated_at timestamptz not null default now(),
  primary key (user_id, id)
);

-- ---------------------------------------------------------------------------
-- Cursos (localStorage: cesi_courses_v1)
-- data: { name, description,
--         teacherId: id del contacto del profesor (un miembro del Equipo) o null,
--         classMinutes: duración de cada clase, classesPerWeek: clases por semana (1..7),
--         schedule: horario fijo o null: { timeZone, slots: [{ day: 0..6, start: 'HH:mm' }],
--           since: 'AAAA-MM-DD' desde cuándo vale (si falta, desde que se creó el curso) }
--           (cada clase acaba como muy tarde a las 23:59 de su día en esa zona) }
-- Todo menos name es opcional (los cursos guardados antes solo tienen name). Las clases no se
-- guardan: se calculan con el horario y no salen en el calendario.
-- Los inscritos se calculan con students.data.courseIds. Al borrar un curso se quita de los
-- courseIds de sus alumnos.
-- ---------------------------------------------------------------------------
create table if not exists public.courses (
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  id text not null,
  data jsonb not null,
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  server_updated_at timestamptz not null default now(),
  primary key (user_id, id)
);

-- ---------------------------------------------------------------------------
-- Pase de lista (localStorage: cesi_attendance_v1). Un registro por alumno y clase.
-- data: { courseId, studentId,
--         classKey: 'AAAA-MM-DD_HH:mm' (clase del horario, en su zona) o 'extra:<id>' (clase suelta),
--         classStart, classEnd, timeZone: la clase copiada (el historial no cambia con el horario),
--         status: 'present' | 'late' | 'absent', lateMinutes (solo 'late'),
--         arrivedAt, leftAt: entrada y salida (ISO; solo si vino),
--         justified: falta o retraso justificado (si falta, no lo está), justification: el motivo }
-- Sin registro = sin marcar. Las clases no se guardan: salen del horario del curso.
-- Al borrar un alumno o un curso se borran sus registros.
-- ---------------------------------------------------------------------------
create table if not exists public.attendance (
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  id text not null,
  data jsonb not null,
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  server_updated_at timestamptz not null default now(),
  primary key (user_id, id)
);

-- ---------------------------------------------------------------------------
-- Clases sueltas de los cursos, p. ej. de recuperación (localStorage: cesi_extra_classes_v1)
-- data: { courseId, start, end (ISO), timeZone, note }
-- Al borrar la clase o su curso se borran también sus registros de attendance.
-- ---------------------------------------------------------------------------
create table if not exists public.extra_classes (
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
  foreach t in array array['events', 'contacts', 'groups', 'settings', 'rules', 'proposals', 'weekly_availability', 'projects', 'vacancies', 'tasks', 'students', 'courses', 'attendance', 'extra_classes'] loop
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
  foreach t in array array['events', 'contacts', 'groups', 'settings', 'rules', 'proposals', 'weekly_availability', 'projects', 'vacancies', 'tasks', 'students', 'courses', 'attendance', 'extra_classes'] loop
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
-- Horas de 00:00 a 23:59 (no vale 24:00) y, en los días activos, cada franja termina después de
-- empezar: ninguna cruza la medianoche.
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
  hhmm constant text := '^([01][0-9]|2[0-3]):[0-5][0-9]$';
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
      if (e ->> 'enabled')::boolean and (s ->> 'end')::time <= (s ->> 'start')::time then
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

-- ---------------------------------------------------------------------------
-- Enlace de reservas (página pública /reservar/<token>, tipo Calendly)
-- ---------------------------------------------------------------------------
-- Quien tiene el enlace lo abre sin iniciar sesión, ve solo los huecos libres de mi horario desde
-- hoy hasta horizon_weeks semanas, y pide una reunión (nombre, email o teléfono y motivo).
-- La solicitud me llega como pendiente; hasta que la acepto o la rechazo, su hueco sale ocupado
-- para los demás. Al llegar su hora sin respuesta, caduca y el hueco se libera.
--
-- La página no toca las tablas: solo llama a cesi_booking_get y cesi_booking_request con el token.
-- Mis reuniones están en JSON (con repeticiones y excepciones), así que los huecos libres los
-- calcula la app y los publica en booking_links.published (solo intervalos de tiempo, sin títulos,
-- participantes ni nada más):
--   published = { free: [[inicio, fin], ...] (ISO, UTC),
--                 daysOff: [{ date: 'AAAA-MM-DD', kind: 'vacation' | 'holiday' }],
--                 horizonEnd: ISO (hasta dónde llega lo publicado), timeZone (la mía) }
--   (las versiones anteriores publicaban también weeks: ['AAAA-MM-DD'], las semanas declaradas)
-- La app publica 2 semanas más de las que se pueden reservar; las funciones recortan a hoy +
-- horizon_weeks (así la ventana avanza sola cada día) y restan las solicitudes pendientes (y
-- aceptadas) y la antelación mínima.
--   token          32 bytes aleatorios en base64url (lo genera la app)
--   display_name   «Reserva una reunión con <display_name>» (vacío: «Reserva una reunión»)
--   durations      duraciones que se pueden elegir, en minutos (30 y 60 por defecto)
--   min_notice_hours  antelación mínima (24 h por defecto)
--   step_minutes   cada cuánto empiezan los huecos (30 min por defecto)
--   horizon_weeks  "Se puede reservar hasta": semanas desde hoy (4 por defecto)
--   video_options  dónde se puede hacer la reunión (ver src/lib/videoCall.js)
--   revoked        true al regenerar o desactivar el enlace (como mucho uno activo por usuario)
create table if not exists public.booking_links (
  token text primary key check (length(token) between 32 and 100),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  display_name text not null default '' check (length(display_name) <= 80),
  durations int[] not null default '{30,60}'
    check (cardinality(durations) between 1 and 6 and durations <@ '{15,30,45,60,90,120}'::int[]),
  min_notice_hours int not null default 24 check (min_notice_hours between 0 and 720),
  step_minutes int not null default 30 check (step_minutes in (15, 30, 60)),
  horizon_weeks int not null default 4 check (horizon_weeks between 1 and 12),
  published jsonb not null default '{}'::jsonb,
  published_at timestamptz,
  revoked boolean not null default false,
  created_at timestamptz not null default now()
);

-- Para los enlaces creados antes de que existiera "Se puede reservar hasta".
alter table public.booking_links add column if not exists horizon_weeks int not null default 4
  check (horizon_weeks between 1 and 12);

-- Videollamada: dónde se puede hacer la reunión (zoom, meet, teams, jitsi, in_person). Mis salas
-- fijas no se guardan aquí (están en mis preferencias): solo qué opciones se ofrecen.
alter table public.booking_links add column if not exists video_options text[] not null default '{jitsi,in_person}'
  check (video_options <@ '{zoom,meet,teams,jitsi,in_person}'::text[]);

create unique index if not exists booking_links_active_idx on public.booking_links (user_id) where not revoked;

alter table public.booking_links enable row level security;
drop policy if exists "booking_links: leer los míos" on public.booking_links;
drop policy if exists "booking_links: crear los míos" on public.booking_links;
drop policy if exists "booking_links: editar los míos" on public.booking_links;
drop policy if exists "booking_links: borrar los míos" on public.booking_links;
create policy "booking_links: leer los míos" on public.booking_links
  for select to authenticated using ((select auth.uid()) = user_id);
create policy "booking_links: crear los míos" on public.booking_links
  for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "booking_links: editar los míos" on public.booking_links
  for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "booking_links: borrar los míos" on public.booking_links
  for delete to authenticated using ((select auth.uid()) = user_id);
revoke all on public.booking_links from anon;

-- Solicitudes de reunión. Solo las crea cesi_booking_request; la app solo las lee y cambia su
-- estado (aceptar o rechazar). status: 'pending' | 'accepted' | 'rejected'.
create table if not exists public.booking_requests (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  link_token text not null,
  starts_at timestamptz not null,
  ends_at timestamptz not null check (ends_at > starts_at),
  name text not null check (length(name) between 1 and 120),
  email text not null default '' check (length(email) <= 200),
  phone text not null default '' check (length(phone) <= 40),
  reason text not null check (length(reason) between 1 and 500),
  time_zone text not null default '' check (length(time_zone) <= 64),
  status text not null default 'pending' check (status in ('pending', 'accepted', 'rejected')),
  created_at timestamptz not null default now(),
  decided_at timestamptz
);

create index if not exists booking_requests_user_idx on public.booking_requests (user_id, status, starts_at);

-- Dónde quiere hacer la reunión quien reserva ('' en las solicitudes anteriores).
alter table public.booking_requests add column if not exists meeting_place text not null default ''
  check (meeting_place in ('', 'zoom', 'meet', 'teams', 'jitsi', 'in_person'));

alter table public.booking_requests enable row level security;
drop policy if exists "booking_requests: leer los míos" on public.booking_requests;
drop policy if exists "booking_requests: editar los míos" on public.booking_requests;
drop policy if exists "booking_requests: borrar los míos" on public.booking_requests;
create policy "booking_requests: leer los míos" on public.booking_requests
  for select to authenticated using ((select auth.uid()) = user_id);
create policy "booking_requests: editar los míos" on public.booking_requests
  for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "booking_requests: borrar los míos" on public.booking_requests
  for delete to authenticated using ((select auth.uid()) = user_id);
revoke all on public.booking_requests from anon;
revoke insert, update on public.booking_requests from authenticated;
grant select, delete on public.booking_requests to authenticated;
grant update (status, decided_at) on public.booking_requests to authenticated;

-- Realtime: las solicitudes nuevas llegan solas a la app (respetando RLS).
do $$
begin
  alter publication supabase_realtime add table public.booking_requests;
exception
  when duplicate_object then null;
  when undefined_object then null;
end;
$$;

-- Mi zona horaria (la publicada) o UTC si no es válida. Interna.
create or replace function public.cesi_booking_zone(p_link public.booking_links)
returns text
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_zone text := p_link.published ->> 'timeZone';
begin
  if v_zone is null or not exists (select 1 from pg_catalog.pg_timezone_names where name = v_zone) then
    return 'UTC';
  end if;
  return v_zone;
end;
$$;

-- Último día que se puede reservar, en mi zona horaria: hoy + horizon_weeks semanas - 1 día
-- (4 semanas un jueves 8: hasta el miércoles 4 del mes siguiente). Interna.
create or replace function public.cesi_booking_until(p_link public.booking_links)
returns date
language sql
stable
security definer
set search_path = ''
as $$
  select (now() at time zone public.cesi_booking_zone(p_link))::date + 7 * p_link.horizon_weeks - 1;
$$;

-- Huecos libres de un enlace: lo publicado por la app, desde ahora + la antelación mínima hasta el
-- fin del último día que se puede reservar (sin pasar de lo publicado), menos las solicitudes
-- pendientes que aún no han empezado y las aceptadas que aún no han terminado. Interna (no la
-- puede llamar nadie desde fuera).
create or replace function public.cesi_booking_free(p_link public.booking_links)
returns tstzmultirange
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_free tstzmultirange;
  v_busy tstzmultirange;
  v_from timestamptz := now() + make_interval(hours => p_link.min_notice_hours);
  v_to timestamptz;
begin
  begin
    v_to := ((public.cesi_booking_until(p_link) + 1)::timestamp at time zone public.cesi_booking_zone(p_link));
    v_to := least(v_to, (p_link.published ->> 'horizonEnd')::timestamptz);
    select range_agg(tstzrange((e ->> 0)::timestamptz, (e ->> 1)::timestamptz))
      into v_free
    from jsonb_array_elements(
      case when jsonb_typeof(p_link.published -> 'free') = 'array' then p_link.published -> 'free' else '[]'::jsonb end
    ) e
    where jsonb_typeof(e) = 'array' and (e ->> 0)::timestamptz < (e ->> 1)::timestamptz;
  exception when others then
    return '{}'::tstzmultirange;
  end;
  if v_free is null or v_to is null or v_to <= v_from then
    return '{}'::tstzmultirange;
  end if;
  select range_agg(tstzrange(r.starts_at, r.ends_at))
    into v_busy
  from public.booking_requests r
  where r.user_id = p_link.user_id
    and ((r.status = 'pending' and r.starts_at > now()) or (r.status = 'accepted' and r.ends_at > now()));
  return v_free * tstzmultirange(tstzrange(v_from, v_to)) - coalesce(v_busy, '{}'::tstzmultirange);
end;
$$;

-- Lo que ve la página: nombre, duraciones, opciones de dónde hacer la reunión (videoOptions), huecos libres, último día que se puede reservar
-- (until), días de vacaciones o festivo (solo la fecha y el tipo) y, por compatibilidad, las
-- semanas que publicaban las versiones anteriores. null si el enlace no existe o está desactivado.
create or replace function public.cesi_booking_get(p_token text)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_link public.booking_links%rowtype;
  v_free jsonb;
  v_weeks jsonb;
  v_days jsonb;
  v_zone text;
begin
  if p_token is null or length(p_token) > 100 then
    return null;
  end if;
  select * into v_link from public.booking_links where token = p_token and not revoked;
  if not found then
    return null;
  end if;

  select coalesce(jsonb_agg(jsonb_build_array(lower(r), upper(r)) order by lower(r)), '[]'::jsonb)
    into v_free
  from unnest(public.cesi_booking_free(v_link)) r;

  select coalesce(jsonb_agg(w order by w), '[]'::jsonb)
    into v_weeks
  from (
    select distinct w #>> '{}' as w
    from jsonb_array_elements(
      case when jsonb_typeof(v_link.published -> 'weeks') = 'array' then v_link.published -> 'weeks' else '[]'::jsonb end
    ) w
    where jsonb_typeof(w) = 'string' and (w #>> '{}') ~ '^\d{4}-\d{2}-\d{2}$'
  ) s;

  select coalesce(jsonb_agg(jsonb_build_object('date', d ->> 'date', 'kind', d ->> 'kind') order by d ->> 'date'), '[]'::jsonb)
    into v_days
  from jsonb_array_elements(
    case when jsonb_typeof(v_link.published -> 'daysOff') = 'array' then v_link.published -> 'daysOff' else '[]'::jsonb end
  ) d
  where jsonb_typeof(d) = 'object'
    and (d ->> 'date') ~ '^\d{4}-\d{2}-\d{2}$'
    and (d ->> 'kind') in ('vacation', 'holiday');

  v_zone := v_link.published ->> 'timeZone';
  if v_zone is null or v_zone !~ '^[A-Za-z_]+(/[A-Za-z0-9_+-]+){0,2}$' then
    v_zone := '';
  end if;

  return jsonb_build_object(
    'name', v_link.display_name,
    'durations', to_jsonb(v_link.durations),
    'stepMinutes', v_link.step_minutes,
    'minNoticeHours', v_link.min_notice_hours,
    'free', v_free,
    'weeks', v_weeks,
    'until', public.cesi_booking_until(v_link),
    'daysOff', v_days,
    'timeZone', v_zone,
    'videoOptions', to_jsonb(v_link.video_options)
  );
end;
$$;

-- Pide una reunión. Lo vuelve a comprobar todo: enlace activo, duración permitida, inicio en
-- punto (cada step_minutes), antelación mínima, hueco libre (también frente a otras solicitudes,
-- con un bloqueo para que dos personas no reserven el mismo hueco a la vez), que no cruce la
-- medianoche en mi zona (acaba como muy tarde a las 23:59 del día en que empieza), datos y límites
-- antispam (5 pendientes por email o teléfono y 20 en total). Errores (en el mensaje):
-- invalid_link, invalid_slot, slot_taken, name_required, contact_required, invalid_email,
-- invalid_phone, reason_required, too_many, invalid_place (una opción de dónde hacer la reunión que el
-- enlace no ofrece; '' vale: páginas anteriores que no preguntaban).
-- La versión anterior (sin p_place) se quita: con dos versiones, las llamadas serían ambiguas.
drop function if exists public.cesi_booking_request(text, timestamptz, int, text, text, text, text, text);
create or replace function public.cesi_booking_request(
  p_token text,
  p_start timestamptz,
  p_minutes int,
  p_name text,
  p_email text,
  p_phone text,
  p_reason text,
  p_time_zone text,
  p_place text default ''
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_link public.booking_links%rowtype;
  v_end timestamptz;
  v_name text := btrim(regexp_replace(coalesce(p_name, ''), '\s+', ' ', 'g'));
  v_email text := lower(btrim(coalesce(p_email, '')));
  v_phone text := btrim(regexp_replace(coalesce(p_phone, ''), '\s+', ' ', 'g'));
  v_digits text;
  v_reason text := btrim(coalesce(p_reason, ''));
  v_zone text := btrim(coalesce(p_time_zone, ''));
  v_place text := btrim(coalesce(p_place, ''));
  v_owner_zone text;
  v_id uuid;
begin
  if p_token is null or length(p_token) > 100 then
    raise exception 'invalid_link';
  end if;
  select * into v_link from public.booking_links where token = p_token and not revoked;
  if not found then
    raise exception 'invalid_link';
  end if;

  if v_name = '' then
    raise exception 'name_required';
  end if;
  if length(v_name) > 120 then
    raise exception 'invalid_data';
  end if;
  if v_email = '' and v_phone = '' then
    raise exception 'contact_required';
  end if;
  if v_email <> '' and (length(v_email) > 200 or v_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$') then
    raise exception 'invalid_email';
  end if;
  v_digits := regexp_replace(v_phone, '\D', '', 'g');
  if v_phone <> '' and (length(v_phone) > 40 or v_phone !~ '^\+?[0-9 ()./-]+$' or length(v_digits) < 6) then
    raise exception 'invalid_phone';
  end if;
  if v_reason = '' then
    raise exception 'reason_required';
  end if;
  if length(v_reason) > 500 then
    raise exception 'invalid_data';
  end if;
  if length(v_zone) > 64 then
    v_zone := '';
  end if;
  if v_place <> '' and not (v_place = any (v_link.video_options)) then
    raise exception 'invalid_place';
  end if;

  if p_start is null or p_minutes is null or not (p_minutes = any (v_link.durations))
    or mod(extract(epoch from p_start)::bigint, v_link.step_minutes * 60) <> 0 then
    raise exception 'invalid_slot';
  end if;
  v_end := p_start + make_interval(mins => p_minutes);
  -- Una reunión que acaba a las 00:00 o más tarde ya es del día siguiente en mi zona.
  v_owner_zone := public.cesi_booking_zone(v_link);
  if (p_start at time zone v_owner_zone)::date <> (v_end at time zone v_owner_zone)::date then
    raise exception 'invalid_slot';
  end if;

  -- Una reserva a la vez por usuario: así dos personas no pueden coger el mismo hueco.
  perform pg_advisory_xact_lock(hashtextextended('cesi_booking:' || v_link.user_id::text, 0));

  if not (tstzrange(p_start, v_end) <@ public.cesi_booking_free(v_link)) then
    raise exception 'slot_taken';
  end if;

  if (select count(*) from public.booking_requests r
      where r.user_id = v_link.user_id and r.status = 'pending' and r.starts_at > now()) >= 20 then
    raise exception 'too_many';
  end if;
  if (select count(*) from public.booking_requests r
      where r.user_id = v_link.user_id and r.status = 'pending' and r.starts_at > now()
        and ((v_email <> '' and r.email = v_email)
          or (v_digits <> '' and regexp_replace(r.phone, '\D', '', 'g') = v_digits))) >= 5 then
    raise exception 'too_many';
  end if;

  insert into public.booking_requests (user_id, link_token, starts_at, ends_at, name, email, phone, reason, time_zone, meeting_place)
  values (v_link.user_id, v_link.token, p_start, v_end, v_name, v_email, v_phone, v_reason, v_zone, v_place)
  returning id into v_id;

  return jsonb_build_object('ok', true, 'id', v_id, 'start', p_start, 'end', v_end);
end;
$$;

-- Solo la página pública (anon) y la app pueden llamar a estas dos; las demás son internas.
revoke all on function public.cesi_booking_zone(public.booking_links) from public, anon, authenticated;
revoke all on function public.cesi_booking_until(public.booking_links) from public, anon, authenticated;
revoke all on function public.cesi_booking_free(public.booking_links) from public, anon, authenticated;
revoke all on function public.cesi_booking_get(text) from public;
revoke all on function public.cesi_booking_request(text, timestamptz, int, text, text, text, text, text, text) from public;
grant execute on function public.cesi_booking_get(text) to anon, authenticated;
grant execute on function public.cesi_booking_request(text, timestamptz, int, text, text, text, text, text, text) to anon, authenticated;

-- ---------------------------------------------------------------------------
-- Perfiles: cuentas y papeles (parte 1a)
-- ---------------------------------------------------------------------------
--   id                 la cuenta (auth.users.id)
--   email              el de la cuenta al crearse el perfil
--   display_name       nombre (el de la cuenta, si lo trae; si no, vacío)
--   role               'ceo' | 'equipo' | 'alumno' | 'pendiente' (por defecto 'pendiente')
--   linked_team_id     persona de Equipo a la que está unida: id del contacto (contacts.id,
--                      con teamProfile) de la cuenta ceo, o null
--   linked_student_id  alumno al que está unida: id del alumno (students.id) de la cuenta ceo,
--                      o null
-- Los enlaces no llevan clave foránea: contacts y students tienen como clave (user_id, id).
create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  email text not null default '',
  display_name text not null default '' check (length(display_name) <= 120),
  role text not null default 'pendiente' check (role in ('ceo', 'equipo', 'alumno', 'pendiente')),
  linked_team_id text check (linked_team_id is null or length(linked_team_id) between 1 and 200),
  linked_student_id text check (linked_student_id is null or length(linked_student_id) between 1 and 200),
  created_at timestamptz not null default now()
);

-- ¿La cuenta actual es ceo? security definer: lee profiles sin pasar por su RLS (así las
-- políticas de profiles pueden usarla sin recursión).
create or replace function public.is_ceo()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.profiles where id = (select auth.uid()) and role = 'ceo'
  );
$$;

revoke all on function public.is_ceo() from public, anon;
grant execute on function public.is_ceo() to authenticated;

-- Perfil de cada cuenta nueva, con papel 'pendiente'.
create or replace function public.cesi_handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, email, display_name, role)
  values (
    new.id,
    coalesce(new.email, ''),
    left(coalesce(new.raw_user_meta_data ->> 'full_name', new.raw_user_meta_data ->> 'name', ''), 120),
    'pendiente'
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

revoke all on function public.cesi_handle_new_user() from public, anon, authenticated;

drop trigger if exists cesi_on_auth_user_created on auth.users;
create trigger cesi_on_auth_user_created
  after insert on auth.users
  for each row execute function public.cesi_handle_new_user();

-- Nadie puede cambiarse su propio papel (tampoco la ceo quitárselo). Desde el SQL Editor no
-- hay cuenta (auth.uid() es null), así que ahí sí se puede.
create or replace function public.cesi_profiles_guard()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if old.id = (select auth.uid()) and new.role is distinct from old.role then
    raise exception 'No puedes cambiar tu propio papel.' using errcode = '42501';
  end if;
  return new;
end;
$$;

revoke all on function public.cesi_profiles_guard() from public, anon, authenticated;

drop trigger if exists profiles_guard on public.profiles;
create trigger profiles_guard
  before update on public.profiles
  for each row execute function public.cesi_profiles_guard();

-- Perfiles de las cuentas que ya existen (no toca los que ya hay).
insert into public.profiles (id, email, display_name, role)
select
  u.id,
  coalesce(u.email, ''),
  left(coalesce(u.raw_user_meta_data ->> 'full_name', u.raw_user_meta_data ->> 'name', ''), 120),
  'pendiente'
from auth.users u
on conflict (id) do nothing;

-- RLS: cada cuenta lee su perfil; la ceo lee todos y es la única que los cambia.
-- Los perfiles solo los crea el trigger y no se borran desde la app.
alter table public.profiles enable row level security;
drop policy if exists "profiles: leer el mío (la ceo, todos)" on public.profiles;
drop policy if exists "profiles: cambiar (solo la ceo)" on public.profiles;
create policy "profiles: leer el mío (la ceo, todos)" on public.profiles
  for select to authenticated using (id = (select auth.uid()) or (select public.is_ceo()));
create policy "profiles: cambiar (solo la ceo)" on public.profiles
  for update to authenticated using ((select public.is_ceo())) with check ((select public.is_ceo()));

revoke all on public.profiles from anon;
revoke insert, update, delete on public.profiles from authenticated;
grant select on public.profiles to authenticated;
grant update (display_name, role, linked_team_id, linked_student_id) on public.profiles to authenticated;

-- La primera ceo se pone a mano: ver supabase/parte1a_cuentas_papeles.sql.

-- ---------------------------------------------------------------------------
-- Perfiles: entrar con Google y con Discord (parte 1b)
-- ---------------------------------------------------------------------------
-- auth_provider: con qué se registró la cuenta (email, google o discord); discord_username: su
-- usuario de Discord. Sustituye a cesi_handle_new_user de la parte 1a.
alter table public.profiles add column if not exists auth_provider text not null default ''
  check (length(auth_provider) <= 40);
alter table public.profiles add column if not exists discord_username text
  check (discord_username is null or length(discord_username) <= 100);

-- Nombre de una cuenta según lo que manda Google o Discord (vacío si no manda ninguno).
-- Discord: global_name (el nombre visible) o, si no, el nombre de usuario.
create or replace function public.cesi_auth_display_name(p_meta jsonb)
returns text
language sql
immutable
set search_path = ''
as $$
  select left(coalesce(
    nullif(trim(p_meta -> 'custom_claims' ->> 'global_name'), ''),
    nullif(trim(p_meta ->> 'global_name'), ''),
    nullif(trim(p_meta ->> 'full_name'), ''),
    nullif(trim(regexp_replace(coalesce(p_meta ->> 'name', ''), '#0+$', '')), ''),
    nullif(trim(p_meta ->> 'user_name'), ''),
    nullif(trim(p_meta ->> 'preferred_username'), ''),
    ''
  ), 120);
$$;

-- Nombre de usuario de Discord (null si la cuenta no es de Discord).
create or replace function public.cesi_discord_username(p_provider text, p_meta jsonb)
returns text
language sql
immutable
set search_path = ''
as $$
  select case when p_provider = 'discord' then left(coalesce(
    nullif(trim(p_meta ->> 'user_name'), ''),
    nullif(trim(p_meta ->> 'preferred_username'), ''),
    nullif(trim(regexp_replace(coalesce(p_meta ->> 'name', ''), '#0+$', '')), ''),
    nullif(trim(p_meta ->> 'full_name'), '')
  ), 100) end;
$$;

revoke all on function public.cesi_auth_display_name(jsonb) from public, anon, authenticated;
revoke all on function public.cesi_discord_username(text, jsonb) from public, anon, authenticated;

-- Perfil de cada cuenta nueva (correo, Google o Discord), con papel 'pendiente'.
create or replace function public.cesi_handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_provider text := coalesce(new.raw_app_meta_data ->> 'provider', 'email');
  v_meta jsonb := coalesce(new.raw_user_meta_data, '{}'::jsonb);
begin
  insert into public.profiles (id, email, display_name, role, auth_provider, discord_username)
  values (
    new.id,
    coalesce(new.email, ''),
    public.cesi_auth_display_name(v_meta),
    'pendiente',
    left(v_provider, 40),
    public.cesi_discord_username(v_provider, v_meta)
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

revoke all on function public.cesi_handle_new_user() from public, anon, authenticated;

-- El trigger ya existe desde la parte 1a; se vuelve a crear igual por si acaso.
drop trigger if exists cesi_on_auth_user_created on auth.users;
create trigger cesi_on_auth_user_created
  after insert on auth.users
  for each row execute function public.cesi_handle_new_user();

-- Perfiles que ya hay: proveedor, usuario de Discord y nombre (solo si está vacío). No toca papeles
-- ni enlaces.
update public.profiles p
set
  auth_provider = left(coalesce(u.raw_app_meta_data ->> 'provider', 'email'), 40),
  discord_username = coalesce(
    p.discord_username,
    public.cesi_discord_username(coalesce(u.raw_app_meta_data ->> 'provider', 'email'), coalesce(u.raw_user_meta_data, '{}'::jsonb))
  ),
  display_name = case
    when trim(p.display_name) = '' then public.cesi_auth_display_name(coalesce(u.raw_user_meta_data, '{}'::jsonb))
    else p.display_name
  end
from auth.users u
where u.id = p.id
  and (p.auth_provider = '' or (p.discord_username is null and u.raw_app_meta_data ->> 'provider' = 'discord') or trim(p.display_name) = '');

-- ---------------------------------------------------------------------------
-- Parte 2: áreas y permisos del equipo; los datos actuales, solo para la ceo
-- ---------------------------------------------------------------------------
-- Sustituye las políticas "cada usuario solo ve lo suyo" de arriba: además, solo la ceo
-- (is_ceo()) lee y escribe. Las páginas públicas usan funciones security definer y no cambian.
-- ---------------------------------------------------------------------------
-- Áreas y permisos
-- ---------------------------------------------------------------------------
-- Pantallas: calendario, contactos, huecos, equipo, vacantes, fichajes, cursos, alumnos,
-- asistencia. Niveles: none (no la ve), read (ver), write (editar).
create table if not exists public.areas (
  id text primary key check (id ~ '^[a-z_]{1,40}$'),
  name text not null check (length(name) between 1 and 60),
  sort int not null default 0
);

insert into public.areas (id, name, sort) values
  ('direccion', 'Dirección', 1),
  ('formacion', 'Formación', 2),
  ('comunicacion', 'Comunicación', 3),
  ('alianzas', 'Alianzas', 4),
  ('personas', 'Personas', 5)
on conflict (id) do nothing;

create table if not exists public.area_permissions (
  area text not null references public.areas (id) on update cascade on delete cascade,
  screen text not null check (screen in ('calendario', 'contactos', 'huecos', 'equipo', 'vacantes', 'fichajes', 'cursos', 'alumnos', 'asistencia')),
  level text not null check (level in ('none', 'read', 'write')),
  primary key (area, screen)
);

create table if not exists public.profile_permissions (
  profile_id uuid not null references public.profiles (id) on delete cascade,
  screen text not null check (screen in ('calendario', 'contactos', 'huecos', 'equipo', 'vacantes', 'fichajes', 'cursos', 'alumnos', 'asistencia')),
  level text not null check (level in ('none', 'read', 'write')),
  primary key (profile_id, screen)
);

alter table public.profiles add column if not exists area text
  references public.areas (id) on update cascade on delete set null;

-- Permisos por defecto (solo los que falten).
insert into public.area_permissions (area, screen, level)
select a.id, s.screen,
  coalesce(d.level, case when a.id = 'direccion' then 'read' else 'none' end)
from public.areas a
cross join unnest(array['calendario', 'contactos', 'huecos', 'equipo', 'vacantes', 'fichajes', 'cursos', 'alumnos', 'asistencia']) as s (screen)
left join (values
  ('direccion', 'fichajes', 'write'),
  ('formacion', 'cursos', 'write'),
  ('formacion', 'alumnos', 'write'),
  ('formacion', 'asistencia', 'write'),
  ('formacion', 'calendario', 'read'),
  ('formacion', 'fichajes', 'write'),
  ('comunicacion', 'calendario', 'read'),
  ('comunicacion', 'fichajes', 'write'),
  ('alianzas', 'contactos', 'write'),
  ('alianzas', 'calendario', 'read'),
  ('alianzas', 'fichajes', 'write'),
  ('personas', 'equipo', 'write'),
  ('personas', 'vacantes', 'write'),
  ('personas', 'alumnos', 'read'),
  ('personas', 'fichajes', 'write')
) as d (area, screen, level) on d.area = a.id and d.screen = s.screen
where a.id in ('direccion', 'formacion', 'comunicacion', 'alianzas', 'personas')
on conflict (area, screen) do nothing;

-- ---------------------------------------------------------------------------
-- Funciones (security definer: leen profiles y permisos sin pasar por su RLS)
-- ---------------------------------------------------------------------------
-- Papel de la cuenta actual ('ceo' | 'equipo' | 'alumno' | 'pendiente'), null sin perfil.
create or replace function public.my_role()
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select role from public.profiles where id = (select auth.uid());
$$;

-- Área de la cuenta actual (null si no tiene).
create or replace function public.my_area()
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select area from public.profiles where id = (select auth.uid());
$$;

-- Nivel de la cuenta actual en una pantalla: la ceo, write; equipo, el suyo propio o el de su
-- área; el resto, none.
create or replace function public.cesi_my_level(p_screen text)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select case
    when p.role = 'ceo' then 'write'
    when p.role = 'equipo' then coalesce(
      (select pp.level from public.profile_permissions pp where pp.profile_id = p.id and pp.screen = p_screen),
      (select ap.level from public.area_permissions ap where ap.area = p.area and ap.screen = p_screen),
      'none'
    )
    else 'none'
  end
  from public.profiles p
  where p.id = (select auth.uid());
$$;

-- ¿Puede la cuenta actual ver ('read') o editar ('write') esa pantalla? La ceo, siempre.
create or replace function public.can_access(p_screen text, p_level text default 'read')
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    array_position(array['none', 'read', 'write'], public.cesi_my_level(p_screen))
      >= array_position(array['none', 'read', 'write'], coalesce(p_level, 'read')),
    false
  );
$$;

-- Lo que usa la app: { pantalla: nivel } de la cuenta actual (todas las pantallas).
create or replace function public.my_permissions()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(jsonb_object_agg(s.screen, coalesce(public.cesi_my_level(s.screen), 'none')), '{}'::jsonb)
  from unnest(array['calendario', 'contactos', 'huecos', 'equipo', 'vacantes', 'fichajes', 'cursos', 'alumnos', 'asistencia']) as s (screen);
$$;

revoke all on function public.my_role() from public, anon;
revoke all on function public.my_area() from public, anon;
revoke all on function public.cesi_my_level(text) from public, anon, authenticated;
revoke all on function public.can_access(text, text) from public, anon;
revoke all on function public.my_permissions() from public, anon;
grant execute on function public.my_role() to authenticated;
grant execute on function public.my_area() to authenticated;
grant execute on function public.can_access(text, text) to authenticated;
grant execute on function public.my_permissions() to authenticated;

-- ---------------------------------------------------------------------------
-- RLS de áreas y permisos: cualquiera con sesión lee las áreas; solo la ceo cambia nada.
-- ---------------------------------------------------------------------------
alter table public.areas enable row level security;
drop policy if exists "areas: leer" on public.areas;
drop policy if exists "areas: cambiar (solo la ceo)" on public.areas;
create policy "areas: leer" on public.areas for select to authenticated using (true);
create policy "areas: cambiar (solo la ceo)" on public.areas for all to authenticated
  using ((select public.is_ceo())) with check ((select public.is_ceo()));

alter table public.area_permissions enable row level security;
drop policy if exists "area_permissions: leer (solo la ceo)" on public.area_permissions;
drop policy if exists "area_permissions: cambiar (solo la ceo)" on public.area_permissions;
create policy "area_permissions: leer (solo la ceo)" on public.area_permissions for select to authenticated
  using ((select public.is_ceo()));
create policy "area_permissions: cambiar (solo la ceo)" on public.area_permissions for all to authenticated
  using ((select public.is_ceo())) with check ((select public.is_ceo()));

alter table public.profile_permissions enable row level security;
drop policy if exists "profile_permissions: leer los míos (la ceo, todos)" on public.profile_permissions;
drop policy if exists "profile_permissions: cambiar (solo la ceo)" on public.profile_permissions;
create policy "profile_permissions: leer los míos (la ceo, todos)" on public.profile_permissions for select to authenticated
  using (profile_id = (select auth.uid()) or (select public.is_ceo()));
create policy "profile_permissions: cambiar (solo la ceo)" on public.profile_permissions for all to authenticated
  using ((select public.is_ceo())) with check ((select public.is_ceo()));

revoke all on public.areas, public.area_permissions, public.profile_permissions from anon;
grant select, insert, update, delete on public.areas, public.area_permissions, public.profile_permissions to authenticated;

-- El área de una cuenta la cambia la ceo, como el papel (la política de profiles ya es solo ceo).
grant update (display_name, role, linked_team_id, linked_student_id, area) on public.profiles to authenticated;

-- ---------------------------------------------------------------------------
-- Tablas actuales: solo la ceo
-- ---------------------------------------------------------------------------
-- Sincronización: mismas políticas que antes (mismos nombres) + solo la ceo.
do $$
declare
  t text;
begin
  foreach t in array array['events', 'contacts', 'groups', 'settings', 'rules', 'proposals', 'weekly_availability', 'projects', 'vacancies', 'tasks', 'students', 'courses', 'attendance', 'extra_classes'] loop
    if to_regclass('public.' || t) is null then
      raise notice 'No existe la tabla %: se salta.', t;
      continue;
    end if;
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists "%s: leer las mías" on public.%I', t, t);
    execute format('drop policy if exists "%s: crear las mías" on public.%I', t, t);
    execute format('drop policy if exists "%s: editar las mías" on public.%I', t, t);
    execute format('drop policy if exists "%s: borrar las mías" on public.%I', t, t);
    execute format(
      'create policy "%s: leer las mías" on public.%I for select to authenticated using ((select auth.uid()) = user_id and (select public.is_ceo()))',
      t, t
    );
    execute format(
      'create policy "%s: crear las mías" on public.%I for insert to authenticated with check ((select auth.uid()) = user_id and (select public.is_ceo()))',
      t, t
    );
    execute format(
      'create policy "%s: editar las mías" on public.%I for update to authenticated using ((select auth.uid()) = user_id and (select public.is_ceo())) with check ((select auth.uid()) = user_id and (select public.is_ceo()))',
      t, t
    );
    execute format(
      'create policy "%s: borrar las mías" on public.%I for delete to authenticated using ((select auth.uid()) = user_id and (select public.is_ceo()))',
      t, t
    );
  end loop;
end;
$$;

-- Enlaces /ficha y de reservas: lo mismo (mismos nombres de política que en schema.sql).
do $$
declare
  t text;
  verbs text[];
  v text;
  own constant text := '(select auth.uid()) = user_id and (select public.is_ceo())';
begin
  foreach t in array array['contact_links', 'booking_links', 'booking_requests'] loop
    if to_regclass('public.' || t) is null then
      raise notice 'No existe la tabla %: se salta.', t;
      continue;
    end if;
    -- booking_requests no tiene «crear»: las solicitudes solo las crea cesi_booking_request.
    verbs := case when t = 'booking_requests' then array['leer', 'editar', 'borrar'] else array['leer', 'crear', 'editar', 'borrar'] end;
    execute format('alter table public.%I enable row level security', t);
    foreach v in array verbs loop
      execute format('drop policy if exists "%s: %s los míos" on public.%I', t, v, t);
      execute format(
        'create policy "%s: %s los míos" on public.%I for %s to authenticated %s',
        t, v, t,
        case v when 'leer' then 'select' when 'crear' then 'insert' when 'editar' then 'update' else 'delete' end,
        case v
          when 'crear' then format('with check (%s)', own)
          when 'editar' then format('using (%s) with check (%s)', own, own)
          else format('using (%s)', own)
        end
      );
    end loop;
  end loop;
end;
$$;

-- Fotos y CV (bucket cesi-photos): cada archivo va en la carpeta de su cuenta; solo la ceo.
drop policy if exists "cesi-photos: leer los míos" on storage.objects;
drop policy if exists "cesi-photos: subir los míos" on storage.objects;
drop policy if exists "cesi-photos: cambiar los míos" on storage.objects;
drop policy if exists "cesi-photos: borrar los míos" on storage.objects;

create policy "cesi-photos: leer los míos" on storage.objects
  for select to authenticated
  using (bucket_id = 'cesi-photos' and (storage.foldername(name))[1] = (select auth.uid()::text) and (select public.is_ceo()));

create policy "cesi-photos: subir los míos" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'cesi-photos' and (storage.foldername(name))[1] = (select auth.uid()::text) and (select public.is_ceo()));

create policy "cesi-photos: cambiar los míos" on storage.objects
  for update to authenticated
  using (bucket_id = 'cesi-photos' and (storage.foldername(name))[1] = (select auth.uid()::text) and (select public.is_ceo()))
  with check (bucket_id = 'cesi-photos' and (storage.foldername(name))[1] = (select auth.uid()::text) and (select public.is_ceo()));

create policy "cesi-photos: borrar los míos" on storage.objects
  for delete to authenticated
  using (bucket_id = 'cesi-photos' and (storage.foldername(name))[1] = (select auth.uid()::text) and (select public.is_ceo()));

-- ---------------------------------------------------------------------------
-- Portal de alumnos: perfil del alumno (parte 3)
-- ---------------------------------------------------------------------------
-- ¿Es una disponibilidad del portal válida (o null)? Mismo formato que los horarios de la app:
-- [{ day: 0..6, enabled, slots: [{ start: 'HH:mm', end }] }], 7 días, de 00:00 a 23:59, cada
-- franja termina después de empezar (ninguna cruza la medianoche). Hasta 12 franjas por día
-- (se marca hora a hora).
create or replace function public.cesi_valid_student_week(p_week jsonb)
returns boolean
language plpgsql
immutable
set search_path = ''
as $$
declare
  e jsonb;
  s jsonb;
  seen int[] := '{}';
  hhmm constant text := '^([01][0-9]|2[0-3]):[0-5][0-9]$';
begin
  if p_week is null or jsonb_typeof(p_week) = 'null' then
    return true;
  end if;
  if jsonb_typeof(p_week) <> 'array' or jsonb_array_length(p_week) <> 7 then
    return false;
  end if;
  for e in select value from jsonb_array_elements(p_week) loop
    if jsonb_typeof(e) <> 'object'
      or exists (select 1 from jsonb_object_keys(e) k where k not in ('day', 'enabled', 'slots'))
      or jsonb_typeof(e -> 'day') is distinct from 'number'
      or jsonb_typeof(e -> 'enabled') is distinct from 'boolean'
      or jsonb_typeof(e -> 'slots') is distinct from 'array' then
      return false;
    end if;
    if (e ->> 'day') !~ '^[0-6]$' or (e ->> 'day')::int = any (seen) then
      return false;
    end if;
    seen := seen || (e ->> 'day')::int;
    if jsonb_array_length(e -> 'slots') > 12 then
      return false;
    end if;
    for s in select value from jsonb_array_elements(e -> 'slots') loop
      if jsonb_typeof(s) <> 'object'
        or exists (select 1 from jsonb_object_keys(s) k where k not in ('start', 'end'))
        or jsonb_typeof(s -> 'start') is distinct from 'string'
        or jsonb_typeof(s -> 'end') is distinct from 'string'
        or (s ->> 'start') !~ hhmm or (s ->> 'end') !~ hhmm then
        return false;
      end if;
      if (s ->> 'end')::time <= (s ->> 'start')::time then
        return false;
      end if;
    end loop;
  end loop;
  return true;
end;
$$;

-- La usa la comprobación de la columna availability, que se evalúa con los permisos del alumno.
revoke all on function public.cesi_valid_student_week(jsonb) from public, anon;
grant execute on function public.cesi_valid_student_week(jsonb) to authenticated;

-- ---------------------------------------------------------------------------
-- Perfil de cada cuenta: alumnos, equipo y ceo (parte 4; antes, student_profiles)
-- ---------------------------------------------------------------------------
--   id            la cuenta (profiles.id)
--   full_name     nombre y apellidos
--   discord       usuario de Discord ('' si no lo da)
--   country       país (ISO 3166-1 alfa-2) y time_zone (zona IANA de ese país)
--   birthday      cumpleaños sin año, 'MM-DD' ('' si no lo da)
--   availability  disponibilidad semanal en su hora local (ver cesi_valid_student_week)
--   completed_at  cuándo completó el perfil (null: un alumno o una persona de equipo aún no puede
--                 usar la app; a la ceo solo se le avisa)
-- Un alumno se une a mi ficha de Alumnos con profiles.linked_student_id (lo pone la ceo en Accesos).
-- Base del calendario compartido. Mi disponibilidad de «Buscar hueco» (weekly_availability) va aparte.

-- La tabla de la parte 3 (student_profiles) pasa a llamarse account_profiles, con sus filas, sus
-- ids y sus permisos. Solo la primera vez: después student_profiles ya es una vista.
do $$
declare
  c record;
begin
  if to_regclass('public.account_profiles') is null
     and exists (select 1 from pg_class where oid = to_regclass('public.student_profiles') and relkind = 'r') then
    alter table public.student_profiles rename to account_profiles;
  end if;
  -- Restricciones (y la clave primaria) con el nombre nuevo.
  if to_regclass('public.account_profiles') is not null then
    for c in
      select conname from pg_constraint
      where conrelid = 'public.account_profiles'::regclass and conname like 'student\_profiles\_%'
    loop
      execute format('alter table public.account_profiles rename constraint %I to %I',
        c.conname, 'account_profiles_' || substr(c.conname, length('student_profiles_') + 1));
    end loop;
  end if;
end;
$$;

create table if not exists public.account_profiles (
  id uuid primary key references public.profiles (id) on delete cascade,
  full_name text not null default '' check (length(full_name) <= 120),
  discord text not null default '' check (length(discord) <= 40),
  country text not null default '' check (country = '' or country ~ '^[A-Z]{2}$'),
  time_zone text not null default '' check (length(time_zone) <= 64),
  birthday text not null default '' check (birthday = '' or birthday ~ '^(0[1-9]|1[0-2])-(0[1-9]|[12][0-9]|3[01])$'),
  availability jsonb check (public.cesi_valid_student_week(availability)),
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint account_profiles_complete check (
    completed_at is null
    or (length(trim(full_name)) > 0 and country <> '' and time_zone <> '' and availability is not null)
  )
);

-- updated_at lo pone el servidor en cada cambio.
create or replace function public.cesi_account_profiles_touch()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  if tg_op = 'UPDATE' then
    new.created_at := old.created_at;
  end if;
  return new;
end;
$$;

revoke all on function public.cesi_account_profiles_touch() from public, anon, authenticated;

drop trigger if exists student_profiles_touch on public.account_profiles;
drop trigger if exists account_profiles_touch on public.account_profiles;
create trigger account_profiles_touch
  before insert or update on public.account_profiles
  for each row execute function public.cesi_account_profiles_touch();
drop function if exists public.cesi_student_profiles_touch();

-- RLS: cada cuenta (alumno, equipo o ceo), solo su fila; la ceo lee todas. Una cuenta pendiente,
-- ninguna. Nadie ve todavía el perfil de los demás (llegará con el calendario compartido). Nadie
-- la borra desde la app (se borra sola si se borra la cuenta).
alter table public.account_profiles enable row level security;
drop policy if exists "student_profiles: leer el mío (la ceo, todos)" on public.account_profiles;
drop policy if exists "student_profiles: crear el mío" on public.account_profiles;
drop policy if exists "student_profiles: editar el mío" on public.account_profiles;
drop policy if exists "account_profiles: leer el mío (la ceo, todos)" on public.account_profiles;
drop policy if exists "account_profiles: crear el mío" on public.account_profiles;
drop policy if exists "account_profiles: editar el mío" on public.account_profiles;
create policy "account_profiles: leer el mío (la ceo, todos)" on public.account_profiles
  for select to authenticated
  using ((id = (select auth.uid()) and (select public.my_role()) in ('alumno', 'equipo', 'ceo')) or (select public.is_ceo()));
create policy "account_profiles: crear el mío" on public.account_profiles
  for insert to authenticated
  with check (id = (select auth.uid()) and (select public.my_role()) in ('alumno', 'equipo', 'ceo'));
create policy "account_profiles: editar el mío" on public.account_profiles
  for update to authenticated
  using (id = (select auth.uid()) and (select public.my_role()) in ('alumno', 'equipo', 'ceo'))
  with check (id = (select auth.uid()) and (select public.my_role()) in ('alumno', 'equipo', 'ceo'));

revoke all on public.account_profiles from anon;
revoke all on public.account_profiles from authenticated;
grant select on public.account_profiles to authenticated;
grant insert (id, full_name, discord, country, time_zone, birthday, availability, completed_at) on public.account_profiles to authenticated;
grant update (full_name, discord, country, time_zone, birthday, availability, completed_at) on public.account_profiles to authenticated;

-- TEMPORAL: student_profiles como vista de account_profiles, para que la versión anterior de la
-- app siga leyendo y guardando mientras Vercel publica la nueva. security_invoker: se aplican las
-- reglas de acceso de account_profiles con la cuenta de quien consulta. Quitarla cuando la nueva
-- versión esté publicada (DROP VIEW al final de supabase/parte4_perfil_para_todos.sql).
create or replace view public.student_profiles
with (security_invoker = true)
as
  select id, full_name, discord, country, time_zone, birthday, availability, completed_at, created_at, updated_at
  from public.account_profiles;

revoke all on public.student_profiles from anon;
revoke all on public.student_profiles from authenticated;
grant select on public.student_profiles to authenticated;
grant insert (id, full_name, discord, country, time_zone, birthday, availability, completed_at) on public.student_profiles to authenticated;
grant update (full_name, discord, country, time_zone, birthday, availability, completed_at) on public.student_profiles to authenticated;

-- ---------------------------------------------------------------------------
-- Parte 5: las 10 áreas del equipo (solo nombres y orden)
-- ---------------------------------------------------------------------------
-- Renombradas con el mismo id (quien las tiene y sus permisos no cambian): direccion → Directivo,
-- formacion → Profesor, personas → RRHH. Nuevas sin permisos (todo 'none': solo ven Mi panel).
-- Comunicación se quita: quien la tenía pasa a «Sin área» y se borran sus permisos de área (los
-- permisos propios de cada persona, profile_permissions, se quedan).
insert into public.areas (id, name, sort) values
  ('direccion', 'Directivo', 1),
  ('formacion', 'Profesor', 2),
  ('alianzas', 'Alianzas', 3),
  ('personas', 'RRHH', 4),
  ('finanzas', 'Finanzas', 5),
  ('legal', 'Legal', 6),
  ('media', 'Media', 7),
  ('tecnico', 'Técnico', 8),
  ('ciberseguridad', 'Ciberseguridad', 9),
  ('moderacion', 'Moderación', 10)
on conflict (id) do update set name = excluded.name, sort = excluded.sort;

-- Áreas nuevas: ninguna pantalla (solo las filas que falten; no toca las de las demás áreas).
insert into public.area_permissions (area, screen, level)
select a.id, s.screen, 'none'
from unnest(array['finanzas', 'legal', 'media', 'tecnico', 'ciberseguridad', 'moderacion']) as a (id)
cross join unnest(array['calendario', 'contactos', 'huecos', 'equipo', 'vacantes', 'fichajes', 'cursos', 'alumnos', 'asistencia']) as s (screen)
on conflict (area, screen) do nothing;

-- Quitar Comunicación.
update public.profiles set area = null where area = 'comunicacion';
delete from public.area_permissions where area = 'comunicacion';
delete from public.areas where id = 'comunicacion';

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
