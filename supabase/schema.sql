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

-- ---------------------------------------------------------------------------
-- Parte 9: sin enlace de reservas
-- ---------------------------------------------------------------------------
-- El enlace de reservas ya no se usa (sus tablas y datos se conservan): nadie puede leer un enlace
-- ni pedir una reunión con él.
revoke all on function public.cesi_booking_get(text) from public, anon, authenticated;
revoke all on function public.cesi_booking_request(text, timestamptz, int, text, text, text, text, text, text) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Parte 10: «Nueva reunión» con el área de cada persona
-- ---------------------------------------------------------------------------
create or replace function public.cesi_invitable_people_areas()
returns table (id uuid, name text, role text, area_name text)
language sql
stable
security definer
set search_path = ''
as $$
  select p.id, public.cesi_person_name(p.id), p.role,
    case when p.role = 'equipo' then coalesce(a.name, '') else '' end
  from public.profiles p
  left join public.areas a on a.id = p.area
  where p.role in ('ceo', 'equipo', 'alumno') and public.cesi_can_invite((select auth.uid()), p.id)
  order by 2;
$$;

revoke all on function public.cesi_invitable_people_areas() from public, anon;
grant execute on function public.cesi_invitable_people_areas() to authenticated;

-- ---------------------------------------------------------------------------
-- Parte 11: las pantallas de la ceo para el equipo, en solo lectura
-- ---------------------------------------------------------------------------
-- ---------------------------------------------------------------------------
-- Permisos fijos por área
-- ---------------------------------------------------------------------------
-- Sin permisos propios: manda solo el área.
delete from public.profile_permissions;

insert into public.area_permissions (area, screen, level)
select a.id, s.screen,
  case
    when a.id = 'direccion' and s.screen in ('contactos', 'equipo', 'vacantes', 'alumnos', 'asistencia') then 'read'
    when a.id = 'direccion' and s.screen = 'cursos' then 'write'
    when a.id = 'formacion' and s.screen in ('cursos', 'alumnos', 'asistencia') then 'read'
    when a.id = 'personas' and s.screen in ('equipo', 'vacantes') then 'read'
    when a.id = 'alianzas' and s.screen = 'contactos' then 'read'
    else 'none'
  end
from public.areas a
cross join (values ('calendario'), ('contactos'), ('huecos'), ('equipo'), ('vacantes'), ('fichajes'), ('cursos'), ('alumnos'), ('asistencia')) as s (screen)
on conflict (area, screen) do update set level = excluded.level;

-- Nivel de una persona en una pantalla ('none' | 'read' | 'write'): como cesi_my_level, pero de
-- cualquier cuenta (para «Ver como»).
create or replace function public.cesi_level_for(p_profile uuid, p_screen text)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((
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
    where p.id = p_profile
  ), 'none');
$$;

-- La versión anterior (sin p_area) se sustituye por esta.
drop function if exists public.cesi_screen_data(text, uuid);

-- Lo que necesita una pantalla, para quien tenga permiso: { level, contacts, groups, vacancies,
-- courses, students, attendance, extraClasses } (cada lista, los documentos tal cual se guardan;
-- con «Ver», sin los datos sensibles).
create or replace function public.cesi_screen_data(p_screen text, p_as uuid default null, p_area text default null)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_who uuid := (select auth.uid());
  v_level text;
  v_full boolean;
  v_out jsonb;
begin
  if p_as is not null and p_as <> v_who then
    if not public.is_ceo() then
      raise exception 'Sin permiso.' using errcode = '42501';
    end if;
    v_who := p_as;
  end if;
  if p_screen is null or p_screen not in ('contactos', 'equipo', 'vacantes', 'cursos', 'alumnos', 'asistencia') then
    raise exception 'Pantalla no válida.' using errcode = '22023';
  end if;
  if p_area is not null then
    -- «Ver como» un área (solo la ceo): sus permisos.
    if not public.is_ceo() then
      raise exception 'Sin permiso.' using errcode = '42501';
    end if;
    v_level := coalesce((select ap.level from public.area_permissions ap where ap.area = p_area and ap.screen = p_screen), 'none');
  else
    v_level := public.cesi_level_for(v_who, p_screen);
  end if;
  if v_level not in ('read', 'write') then
    raise exception 'No tienes acceso a esta pantalla.' using errcode = '42501';
  end if;
  v_full := v_level = 'write';

  with
  ceo as (select id from public.profiles where role = 'ceo'),
  -- Contactos (con «Ver», sin email, teléfono, notas ni foto; sin CV de equipo).
  c_all as (
    select case when v_full then c.data
      else (c.data - 'email' - 'phone' - 'notes' - 'photo') #- '{teamProfile,cv}' end as data
    from public.contacts c
    where c.user_id in (select id from ceo) and c.deleted_at is null
  ),
  c_flags as (
    select data,
      (data ? 'teamProfile' and jsonb_typeof(data -> 'teamProfile') = 'object') as team,
      (data ? 'teamProfile' and jsonb_typeof(data -> 'teamProfile') = 'object'
        and coalesce(data -> 'teamProfile' ->> 'status', 'active') <> 'former'
        and not coalesce((data ->> 'archived')::boolean, false)) as active,
      (coalesce((data ->> 'candidateOnly')::boolean, false) and not (data ? 'teamProfile' and jsonb_typeof(data -> 'teamProfile') = 'object')) as candidate_only,
      (jsonb_typeof(data -> 'candidacies') = 'array' and jsonb_array_length(data -> 'candidacies') > 0) as candidate
    from c_all
  ),
  -- Candidaturas: con «Ver», sin CV ni notas.
  c_cand as (
    select case when v_full then data
      else jsonb_set(data, '{candidacies}', coalesce((
        select jsonb_agg(x - 'cv' - 'notes') from jsonb_array_elements(data -> 'candidacies') as x
      ), '[]'::jsonb)) end as data
    from c_flags
    where candidate
  ),
  -- Profesores (para los cursos): solo lo que hace falta para nombrarlos y su disponibilidad.
  c_teachers as (
    select jsonb_build_object(
      'id', data ->> 'id', 'name', data ->> 'name', 'country', data -> 'country', 'timeZone', data -> 'timeZone',
      'availability', data -> 'availability',
      'teamProfile', jsonb_build_object('status', data -> 'teamProfile' -> 'status', 'area', data -> 'teamProfile' -> 'area',
        'role', data -> 'teamProfile' -> 'role', 'roles', data -> 'teamProfile' -> 'roles')
    ) as data
    from c_flags
    where team
  ),
  -- Alumnos (con «Ver», sin email, teléfono, cumpleaños, notas ni Discord).
  s_all as (
    select case when v_full then s.data else s.data - 'email' - 'phone' - 'birthday' - 'notes' - 'discord' end as data
    from public.students s
    where s.user_id in (select id from ceo) and s.deleted_at is null
  ),
  courses as (
    select co.data from public.courses co where co.user_id in (select id from ceo) and co.deleted_at is null
  )
  select jsonb_build_object(
    'level', v_level,
    'contacts', case p_screen
      when 'contactos' then coalesce((select jsonb_agg(data - 'candidacies' - 'candidateOnly') from c_flags where not active and not candidate_only), '[]'::jsonb)
      when 'equipo' then coalesce((select jsonb_agg(data - 'candidacies' - 'candidateOnly') from c_flags where team), '[]'::jsonb)
      when 'vacantes' then coalesce((select jsonb_agg(data) from c_cand), '[]'::jsonb)
      else coalesce((select jsonb_agg(data) from c_teachers), '[]'::jsonb)
    end,
    'groups', case when p_screen in ('contactos', 'equipo') then coalesce((
        select jsonb_agg(g.data) from public.groups g where g.user_id in (select id from ceo) and g.deleted_at is null
      ), '[]'::jsonb) else '[]'::jsonb end,
    'vacancies', case when p_screen = 'vacantes' then coalesce((
        select jsonb_agg(v.data) from public.vacancies v where v.user_id in (select id from ceo) and v.deleted_at is null
      ), '[]'::jsonb) else '[]'::jsonb end,
    'courses', case when p_screen in ('cursos', 'alumnos', 'asistencia') then coalesce((select jsonb_agg(data) from courses), '[]'::jsonb) else '[]'::jsonb end,
    'students', case when p_screen in ('cursos', 'alumnos', 'asistencia') then coalesce((select jsonb_agg(data) from s_all), '[]'::jsonb) else '[]'::jsonb end,
    'attendance', case when p_screen in ('cursos', 'alumnos', 'asistencia') then coalesce((
        select jsonb_agg(a.data) from public.attendance a where a.user_id in (select id from ceo) and a.deleted_at is null
      ), '[]'::jsonb) else '[]'::jsonb end,
    'extraClasses', case when p_screen in ('cursos', 'alumnos', 'asistencia') then coalesce((
        select jsonb_agg(x.data) from public.extra_classes x where x.user_id in (select id from ceo) and x.deleted_at is null
      ), '[]'::jsonb) else '[]'::jsonb end
  ) into v_out;
  return v_out;
end;
$$;

revoke all on function public.cesi_level_for(uuid, text) from public, anon, authenticated;
revoke all on function public.cesi_screen_data(text, uuid, text) from public, anon;
grant execute on function public.cesi_screen_data(text, uuid, text) to authenticated;

-- ---------------------------------------------------------------------------
-- Parte 12: Inicio del equipo y de Directivo (alertas y resumen en cifras)
-- ---------------------------------------------------------------------------
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

-- ---------------------------------------------------------------------------
-- Parte 13: tareas para varias personas o para un área entera
-- ---------------------------------------------------------------------------
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

-- ---------------------------------------------------------------------------
-- Parte 14: objetivos del mes por área
-- ---------------------------------------------------------------------------
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

-- ---------------------------------------------------------------------------
-- Parte 15: el Profesor ve solo sus cursos y sus alumnos, y pasa lista
-- ---------------------------------------------------------------------------
-- -----------------------------------------------------------------------------
-- Ayudas
-- -----------------------------------------------------------------------------

-- Instante en el formato de la app (como Date.toISOString(): 2030-11-04T17:00:00.000Z).
create or replace function public.cesi_iso(p timestamptz)
returns text
language sql
immutable
set search_path = ''
as $$
  select to_char(p at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"');
$$;

-- ¿Es `p_profile` del área Profesor (y no Directivo ni la ceo)? Entonces solo ve sus cursos.
create or replace function public.cesi_is_teacher_only(p_profile uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (select 1 from public.profiles where id = p_profile and role = 'equipo' and area = 'formacion');
$$;

revoke all on function public.cesi_iso(timestamptz) from public, anon, authenticated;
revoke all on function public.cesi_is_teacher_only(uuid) from public, anon, authenticated;

-- -----------------------------------------------------------------------------
-- Lo que necesita una pantalla (como en la parte 11; al Profesor, solo lo de sus cursos)
-- -----------------------------------------------------------------------------
--   teacher   true si solo se ven los cursos de esa persona (área Profesor)
--   canMark   puede pasar lista en sus clases (su propia cuenta, no «Ver como»)
-- «Ver como» el área Profesor sin elegir persona: sin cursos (no hay de quién).
create or replace function public.cesi_screen_data(p_screen text, p_as uuid default null, p_area text default null)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_me uuid := (select auth.uid());
  v_who uuid := v_me;
  v_level text;
  v_full boolean;
  v_teacher boolean;
  v_out jsonb;
begin
  if p_as is not null and p_as <> v_who then
    if not public.is_ceo() then
      raise exception 'Sin permiso.' using errcode = '42501';
    end if;
    v_who := p_as;
  end if;
  if p_screen is null or p_screen not in ('contactos', 'equipo', 'vacantes', 'cursos', 'alumnos', 'asistencia') then
    raise exception 'Pantalla no válida.' using errcode = '22023';
  end if;
  if p_area is not null then
    -- «Ver como» un área (solo la ceo): sus permisos.
    if not public.is_ceo() then
      raise exception 'Sin permiso.' using errcode = '42501';
    end if;
    v_level := coalesce((select ap.level from public.area_permissions ap where ap.area = p_area and ap.screen = p_screen), 'none');
    v_teacher := p_area = 'formacion';
  else
    v_level := public.cesi_level_for(v_who, p_screen);
    v_teacher := public.cesi_is_teacher_only(v_who);
  end if;
  if v_level not in ('read', 'write') then
    raise exception 'No tienes acceso a esta pantalla.' using errcode = '42501';
  end if;
  v_full := v_level = 'write';

  with
  ceo as (select id from public.profiles where role = 'ceo'),
  -- Cursos del profesor (ninguno en «Ver como» un área sin persona).
  my_courses as (
    select c.id from public.cesi_teacher_courses(case when p_area is null then v_who end) as c (id)
  ),
  -- Contactos (con «Ver», sin email, teléfono, notas ni foto; sin CV de equipo).
  c_all as (
    select case when v_full then c.data
      else (c.data - 'email' - 'phone' - 'notes' - 'photo') #- '{teamProfile,cv}' end as data
    from public.contacts c
    where c.user_id in (select id from ceo) and c.deleted_at is null
  ),
  c_flags as (
    select data,
      (data ? 'teamProfile' and jsonb_typeof(data -> 'teamProfile') = 'object') as team,
      (data ? 'teamProfile' and jsonb_typeof(data -> 'teamProfile') = 'object'
        and coalesce(data -> 'teamProfile' ->> 'status', 'active') <> 'former'
        and not coalesce((data ->> 'archived')::boolean, false)) as active,
      (coalesce((data ->> 'candidateOnly')::boolean, false) and not (data ? 'teamProfile' and jsonb_typeof(data -> 'teamProfile') = 'object')) as candidate_only,
      (jsonb_typeof(data -> 'candidacies') = 'array' and jsonb_array_length(data -> 'candidacies') > 0) as candidate
    from c_all
  ),
  -- Candidaturas: con «Ver», sin CV ni notas.
  c_cand as (
    select case when v_full then data
      else jsonb_set(data, '{candidacies}', coalesce((
        select jsonb_agg(x - 'cv' - 'notes') from jsonb_array_elements(data -> 'candidacies') as x
      ), '[]'::jsonb)) end as data
    from c_flags
    where candidate
  ),
  -- Profesores (para los cursos): solo lo que hace falta para nombrarlos y su disponibilidad.
  c_teachers as (
    select jsonb_build_object(
      'id', data ->> 'id', 'name', data ->> 'name', 'country', data -> 'country', 'timeZone', data -> 'timeZone',
      'availability', data -> 'availability',
      'teamProfile', jsonb_build_object('status', data -> 'teamProfile' -> 'status', 'area', data -> 'teamProfile' -> 'area',
        'role', data -> 'teamProfile' -> 'role', 'roles', data -> 'teamProfile' -> 'roles')
    ) as data
    from c_flags
    where team
  ),
  courses as (
    select co.data from public.courses co
    where co.user_id in (select id from ceo) and co.deleted_at is null
      and (not v_teacher or co.id in (select id from my_courses))
  ),
  -- Alumnos (con «Ver», sin email, teléfono, cumpleaños, notas ni Discord). Al profesor, solo los
  -- de sus cursos y, en courseIds, solo esos cursos.
  s_rows as (
    select case when v_full then s.data else s.data - 'email' - 'phone' - 'birthday' - 'notes' - 'discord' end as data
    from public.students s
    where s.user_id in (select id from ceo) and s.deleted_at is null
      and (not v_teacher or (
        jsonb_typeof(s.data -> 'courseIds') = 'array'
        and exists (select 1 from jsonb_array_elements_text(s.data -> 'courseIds') x where x in (select id from my_courses))
      ))
  ),
  s_all as (
    select case when v_teacher then jsonb_set(data, '{courseIds}', coalesce((
        select jsonb_agg(x) from jsonb_array_elements_text(data -> 'courseIds') x where x in (select id from my_courses)
      ), '[]'::jsonb)) else data end as data
    from s_rows
  )
  select jsonb_build_object(
    'level', v_level,
    'teacher', v_teacher,
    'canMark', v_teacher and p_area is null and v_who = v_me,
    'contacts', case p_screen
      when 'contactos' then coalesce((select jsonb_agg(data - 'candidacies' - 'candidateOnly') from c_flags where not active and not candidate_only), '[]'::jsonb)
      when 'equipo' then coalesce((select jsonb_agg(data - 'candidacies' - 'candidateOnly') from c_flags where team), '[]'::jsonb)
      when 'vacantes' then coalesce((select jsonb_agg(data) from c_cand), '[]'::jsonb)
      else coalesce((select jsonb_agg(data) from c_teachers), '[]'::jsonb)
    end,
    'groups', case when p_screen in ('contactos', 'equipo') then coalesce((
        select jsonb_agg(g.data) from public.groups g where g.user_id in (select id from ceo) and g.deleted_at is null
      ), '[]'::jsonb) else '[]'::jsonb end,
    'vacancies', case when p_screen = 'vacantes' then coalesce((
        select jsonb_agg(v.data) from public.vacancies v where v.user_id in (select id from ceo) and v.deleted_at is null
      ), '[]'::jsonb) else '[]'::jsonb end,
    'courses', case when p_screen in ('cursos', 'alumnos', 'asistencia') then coalesce((select jsonb_agg(data) from courses), '[]'::jsonb) else '[]'::jsonb end,
    'students', case when p_screen in ('cursos', 'alumnos', 'asistencia') then coalesce((select jsonb_agg(data) from s_all), '[]'::jsonb) else '[]'::jsonb end,
    'attendance', case when p_screen in ('cursos', 'alumnos', 'asistencia') then coalesce((
        select jsonb_agg(a.data) from public.attendance a
        where a.user_id in (select id from ceo) and a.deleted_at is null
          and (not v_teacher or a.data ->> 'courseId' in (select id from my_courses))
      ), '[]'::jsonb) else '[]'::jsonb end,
    'extraClasses', case when p_screen in ('cursos', 'alumnos', 'asistencia') then coalesce((
        select jsonb_agg(x.data) from public.extra_classes x
        where x.user_id in (select id from ceo) and x.deleted_at is null
          and (not v_teacher or x.data ->> 'courseId' in (select id from my_courses))
      ), '[]'::jsonb) else '[]'::jsonb end
  ) into v_out;
  return v_out;
end;
$$;

-- -----------------------------------------------------------------------------
-- Pasar lista (el profesor, en las clases de sus cursos)
-- -----------------------------------------------------------------------------

-- La clase de un curso del profesor: { course, ceo, start, end, timeZone }. Error si el curso no
-- es suyo, el alumno no está en él o la clase no existe (del horario, suelta o, si cambió el
-- horario, la que ya tiene pase de lista).
create or replace function public.cesi_teacher_class(p_course_id text, p_class_key text, p_student_id text,
  out o_ceo uuid, out o_start timestamptz, out o_end timestamptz, out o_zone text)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_me uuid := (select auth.uid());
  v_course public.courses;
  v_day date;
  v_extra jsonb;
begin
  if not public.cesi_is_teacher_only(v_me) or p_course_id is null
     or p_course_id not in (select c from public.cesi_teacher_courses(v_me) as c) then
    raise exception 'Solo puedes pasar lista en tus cursos.' using errcode = '42501';
  end if;
  select * into v_course from public.courses
  where id = p_course_id and deleted_at is null and user_id in (select id from public.profiles where role = 'ceo')
  limit 1;
  if not found then
    raise exception 'Ese curso ya no existe.' using errcode = '22023';
  end if;
  o_ceo := v_course.user_id;

  if not exists (
    select 1 from public.students s
    where s.user_id = o_ceo and s.id = p_student_id and s.deleted_at is null
      and jsonb_typeof(s.data -> 'courseIds') = 'array' and (s.data -> 'courseIds') ? p_course_id
  ) then
    raise exception 'Ese alumno no está en el curso.' using errcode = '22023';
  end if;

  if p_class_key like 'extra:%' then
    select x.data into v_extra from public.extra_classes x
    where x.user_id = o_ceo and x.id = substr(p_class_key, 7) and x.deleted_at is null and x.data ->> 'courseId' = p_course_id;
    if v_extra is not null then
      o_start := (v_extra ->> 'start')::timestamptz;
      o_end := (v_extra ->> 'end')::timestamptz;
      o_zone := v_extra ->> 'timeZone';
    end if;
  elsif p_class_key ~ '^\d{4}-\d{2}-\d{2}_\d{2}:\d{2}$' then
    v_day := substr(p_class_key, 1, 10)::date;
    select k.starts_at, k.ends_at into o_start, o_end
    from public.cesi_course_classes(v_course, (v_day - 2)::timestamptz, (v_day + 3)::timestamptz) k
    where k.class_key = p_class_key and not k.is_extra
    limit 1;
    o_zone := v_course.data -> 'schedule' ->> 'timeZone';
  end if;

  -- Si el horario cambió, la clase que ya tiene pase de lista.
  if o_start is null then
    select (a.data ->> 'classStart')::timestamptz, (a.data ->> 'classEnd')::timestamptz, a.data ->> 'timeZone'
    into o_start, o_end, o_zone
    from public.attendance a
    where a.user_id = o_ceo and a.deleted_at is null and a.data ->> 'courseId' = p_course_id and a.data ->> 'classKey' = p_class_key
    order by a.updated_at desc
    limit 1;
  end if;
  if o_start is null or o_end is null then
    raise exception 'Esa clase no existe.' using errcode = '22023';
  end if;
  o_zone := coalesce(nullif(o_zone, ''), 'Europe/Madrid');
end;
$$;

-- Marcar a un alumno: p_data { status, lateMinutes, arrivedAt, leftAt, justified, justification }
-- (lo demás lo pone la función). Devuelve el registro guardado (el de la app de la ceo).
create or replace function public.cesi_teacher_attendance_save(p_course_id text, p_class_key text, p_student_id text, p_data jsonb)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_class record;
  v_status text := p_data ->> 'status';
  v_late integer;
  v_arrived timestamptz;
  v_left timestamptz;
  v_justified boolean := coalesce((p_data ->> 'justified')::boolean, false);
  v_reason text := trim(coalesce(p_data ->> 'justification', ''));
  v_old public.attendance;
  v_id text;
  v_stamp timestamptz;
  v_data jsonb;
begin
  select * into v_class from public.cesi_teacher_class(p_course_id, p_class_key, p_student_id);

  if coalesce(v_status, '') not in ('present', 'late', 'absent') then
    raise exception 'Estado de asistencia no válido.' using errcode = '22023';
  end if;
  if v_status = 'late' and (p_data ->> 'lateMinutes') is not null then
    v_late := case when (p_data ->> 'lateMinutes') ~ '^\d{1,3}$' then (p_data ->> 'lateMinutes')::integer end;
    if v_late is null or v_late not between 1 and 600 then
      raise exception 'Los minutos de retraso tienen que ser un número del 1 al 600.' using errcode = '22023';
    end if;
  end if;
  if v_status <> 'absent' then
    begin
      v_arrived := (p_data ->> 'arrivedAt')::timestamptz;
      v_left := (p_data ->> 'leftAt')::timestamptz;
    exception when others then
      raise exception 'Hora de entrada o de salida no válida.' using errcode = '22023';
    end;
    if v_arrived is null or v_left is null or v_left <= v_arrived
       or v_arrived < v_class.o_start - interval '3 hours' or v_left > v_class.o_end + interval '3 hours' then
      raise exception 'La entrada y la salida tienen que estar entre 3 h antes del inicio y 3 h después del fin de la clase.' using errcode = '22023';
    end if;
  end if;
  if v_status = 'present' then
    v_justified := false;
    v_reason := '';
  end if;
  if not v_justified then
    v_reason := '';
  end if;
  if length(v_reason) > 500 then
    raise exception 'El motivo puede tener como mucho 500 caracteres.' using errcode = '22023';
  end if;

  -- El registro de ese alumno y clase (el más reciente si hubiera varios).
  select * into v_old from public.attendance a
  where a.user_id = v_class.o_ceo and a.deleted_at is null
    and a.data ->> 'courseId' = p_course_id and a.data ->> 'classKey' = p_class_key and a.data ->> 'studentId' = p_student_id
  order by a.updated_at desc
  limit 1
  for update;

  -- Siempre más reciente que lo guardado (aunque el reloj de un dispositivo vaya adelantado).
  v_stamp := greatest(clock_timestamp(), coalesce(v_old.updated_at + interval '1 millisecond', '-infinity'));
  v_id := coalesce(v_old.id, gen_random_uuid()::text);
  v_data := coalesce(v_old.data, '{}'::jsonb) || jsonb_build_object(
    'id', v_id,
    'courseId', p_course_id,
    'classKey', p_class_key,
    'classStart', public.cesi_iso(v_class.o_start),
    'classEnd', public.cesi_iso(v_class.o_end),
    'timeZone', v_class.o_zone,
    'studentId', p_student_id,
    'status', v_status,
    'lateMinutes', v_late,
    'arrivedAt', case when v_status = 'absent' then null else public.cesi_iso(v_arrived) end,
    'leftAt', case when v_status = 'absent' then null else public.cesi_iso(v_left) end,
    'justified', v_justified,
    'justification', v_reason,
    'createdAt', coalesce(v_old.data ->> 'createdAt', public.cesi_iso(v_stamp)),
    'updatedAt', public.cesi_iso(v_stamp)
  );

  insert into public.attendance (user_id, id, data, updated_at, deleted_at)
  values (v_class.o_ceo, v_id, v_data, v_stamp, null)
  on conflict (user_id, id) do update set data = excluded.data, updated_at = excluded.updated_at, deleted_at = null;

  -- Otros registros del mismo alumno y clase: se borran (como en la app, se queda el más reciente).
  update public.attendance a
  set deleted_at = v_stamp, updated_at = greatest(v_stamp, a.updated_at + interval '1 millisecond')
  where a.user_id = v_class.o_ceo and a.deleted_at is null and a.id <> v_id
    and a.data ->> 'courseId' = p_course_id and a.data ->> 'classKey' = p_class_key and a.data ->> 'studentId' = p_student_id;

  return v_data;
end;
$$;

-- Dejar a un alumno sin marcar en una clase de un curso del profesor.
create or replace function public.cesi_teacher_attendance_clear(p_course_id text, p_class_key text, p_student_id text)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_class record;
  v_now timestamptz := clock_timestamp();
begin
  select * into v_class from public.cesi_teacher_class(p_course_id, p_class_key, p_student_id);
  update public.attendance a
  set deleted_at = v_now, updated_at = greatest(v_now, a.updated_at + interval '1 millisecond')
  where a.user_id = v_class.o_ceo and a.deleted_at is null
    and a.data ->> 'courseId' = p_course_id and a.data ->> 'classKey' = p_class_key and a.data ->> 'studentId' = p_student_id;
end;
$$;

-- -----------------------------------------------------------------------------
-- Permisos de las funciones
-- -----------------------------------------------------------------------------
revoke all on function public.cesi_teacher_class(text, text, text) from public, anon, authenticated;
revoke all on function public.cesi_screen_data(text, uuid, text) from public, anon;
revoke all on function public.cesi_teacher_attendance_save(text, text, text, jsonb) from public, anon;
revoke all on function public.cesi_teacher_attendance_clear(text, text, text) from public, anon;
grant execute on function public.cesi_screen_data(text, uuid, text) to authenticated;
grant execute on function public.cesi_teacher_attendance_save(text, text, text, jsonb) to authenticated;
grant execute on function public.cesi_teacher_attendance_clear(text, text, text) to authenticated;

-- ---------------------------------------------------------------------------
-- Parte 16: Alianzas (seguimiento de patrocinadores y colaboraciones)
-- ---------------------------------------------------------------------------
-- -----------------------------------------------------------------------------
-- Permisos: Alianzas puede editar Contactos externos
-- -----------------------------------------------------------------------------
insert into public.area_permissions (area, screen, level)
values ('alianzas', 'contactos', 'write')
on conflict (area, screen) do update set level = excluded.level;

-- -----------------------------------------------------------------------------
-- Ayudas
-- -----------------------------------------------------------------------------

-- Qué puede hacer `p_profile` con las alianzas: 'edit' (Alianzas y la ceo), 'view' (Directivo) o null.
create or replace function public.cesi_alliance_role(p_profile uuid)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select case
    when p.role = 'ceo' then 'edit'
    when p.role = 'equipo' and p.area = 'alianzas' then 'edit'
    when p.role = 'equipo' and p.area = 'direccion' then 'view'
  end
  from public.profiles p
  where p.id = p_profile;
$$;

-- ¿Es un contacto externo? (no es del equipo, ni candidato, ni está archivado)
create or replace function public.cesi_is_external_contact(p_data jsonb)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select not (p_data ? 'teamProfile' and jsonb_typeof(p_data -> 'teamProfile') = 'object')
    and not (jsonb_typeof(p_data -> 'candidacies') = 'array' and jsonb_array_length(p_data -> 'candidacies') > 0)
    and not coalesce((p_data ->> 'candidateOnly')::boolean, false)
    and not coalesce((p_data ->> 'archived')::boolean, false);
$$;

-- Solo una persona de Alianzas escribe con estas funciones (la ceo, desde su app).
create or replace function public.cesi_alliance_writer()
returns uuid
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_me uuid := (select auth.uid());
begin
  if not exists (select 1 from public.profiles where id = v_me and role = 'equipo' and area = 'alianzas') then
    raise exception 'Solo Alianzas puede cambiar los contactos externos y su seguimiento.' using errcode = '42501';
  end if;
  return v_me;
end;
$$;

-- 'AAAA-MM-DD' válido o ''.
create or replace function public.cesi_day_or_empty(p text)
returns text
language plpgsql
immutable
set search_path = ''
as $$
begin
  if coalesce(p, '') = '' then
    return '';
  end if;
  if p !~ '^\d{4}-\d{2}-\d{2}$' then
    raise exception 'Fecha no válida.' using errcode = '22023';
  end if;
  perform p::date;
  return p;
exception when invalid_datetime_format or datetime_field_overflow then
  raise exception 'Fecha no válida.' using errcode = '22023';
end;
$$;

revoke all on function public.cesi_alliance_role(uuid) from public, anon, authenticated;
revoke all on function public.cesi_is_external_contact(jsonb) from public, anon, authenticated;
revoke all on function public.cesi_alliance_writer() from public, anon, authenticated;
revoke all on function public.cesi_day_or_empty(text) from public, anon, authenticated;

-- -----------------------------------------------------------------------------
-- Lo que necesita una pantalla (como en la parte 15; el seguimiento de alianza solo para
-- Alianzas, Directivo y la ceo)
-- -----------------------------------------------------------------------------
--   alliance      ve el seguimiento de alianza
--   allianceEdit  puede crear y editar contactos externos y su seguimiento (su propia cuenta)
create or replace function public.cesi_screen_data(p_screen text, p_as uuid default null, p_area text default null)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_me uuid := (select auth.uid());
  v_who uuid := v_me;
  v_level text;
  v_full boolean;
  v_teacher boolean;
  v_alliance text;
  v_out jsonb;
begin
  if p_as is not null and p_as <> v_who then
    if not public.is_ceo() then
      raise exception 'Sin permiso.' using errcode = '42501';
    end if;
    v_who := p_as;
  end if;
  if p_screen is null or p_screen not in ('contactos', 'equipo', 'vacantes', 'cursos', 'alumnos', 'asistencia') then
    raise exception 'Pantalla no válida.' using errcode = '22023';
  end if;
  if p_area is not null then
    -- «Ver como» un área (solo la ceo): sus permisos.
    if not public.is_ceo() then
      raise exception 'Sin permiso.' using errcode = '42501';
    end if;
    v_level := coalesce((select ap.level from public.area_permissions ap where ap.area = p_area and ap.screen = p_screen), 'none');
    v_teacher := p_area = 'formacion';
    v_alliance := case when p_area = 'alianzas' then 'edit' when p_area = 'direccion' then 'view' end;
  else
    v_level := public.cesi_level_for(v_who, p_screen);
    v_teacher := public.cesi_is_teacher_only(v_who);
    v_alliance := public.cesi_alliance_role(v_who);
  end if;
  if v_level not in ('read', 'write') then
    raise exception 'No tienes acceso a esta pantalla.' using errcode = '42501';
  end if;
  v_full := v_level = 'write';

  with
  ceo as (select id from public.profiles where role = 'ceo'),
  -- Cursos del profesor (ninguno en «Ver como» un área sin persona).
  my_courses as (
    select c.id from public.cesi_teacher_courses(case when p_area is null then v_who end) as c (id)
  ),
  -- Contactos (con «Ver», sin email, teléfono, notas ni foto; sin CV de equipo).
  c_all as (
    select case when v_full then c0.data
      else (c0.data - 'email' - 'phone' - 'notes' - 'photo') #- '{teamProfile,cv}' end as data
    from (select case when v_alliance is null then c.data - 'alliance' else c.data end as data, c.user_id, c.deleted_at from public.contacts c) c0
    where c0.user_id in (select id from ceo) and c0.deleted_at is null
  ),
  c_flags as (
    select data,
      (data ? 'teamProfile' and jsonb_typeof(data -> 'teamProfile') = 'object') as team,
      (data ? 'teamProfile' and jsonb_typeof(data -> 'teamProfile') = 'object'
        and coalesce(data -> 'teamProfile' ->> 'status', 'active') <> 'former'
        and not coalesce((data ->> 'archived')::boolean, false)) as active,
      (coalesce((data ->> 'candidateOnly')::boolean, false) and not (data ? 'teamProfile' and jsonb_typeof(data -> 'teamProfile') = 'object')) as candidate_only,
      (jsonb_typeof(data -> 'candidacies') = 'array' and jsonb_array_length(data -> 'candidacies') > 0) as candidate,
      public.cesi_is_external_contact(data) as external
    from c_all
  ),
  -- Candidaturas: con «Ver», sin CV ni notas.
  c_cand as (
    select case when v_full then data
      else jsonb_set(data, '{candidacies}', coalesce((
        select jsonb_agg(x - 'cv' - 'notes') from jsonb_array_elements(data -> 'candidacies') as x
      ), '[]'::jsonb)) end as data
    from c_flags
    where candidate
  ),
  -- Profesores (para los cursos): solo lo que hace falta para nombrarlos y su disponibilidad.
  c_teachers as (
    select jsonb_build_object(
      'id', data ->> 'id', 'name', data ->> 'name', 'country', data -> 'country', 'timeZone', data -> 'timeZone',
      'availability', data -> 'availability',
      'teamProfile', jsonb_build_object('status', data -> 'teamProfile' -> 'status', 'area', data -> 'teamProfile' -> 'area',
        'role', data -> 'teamProfile' -> 'role', 'roles', data -> 'teamProfile' -> 'roles')
    ) as data
    from c_flags
    where team
  ),
  courses as (
    select co.data from public.courses co
    where co.user_id in (select id from ceo) and co.deleted_at is null
      and (not v_teacher or co.id in (select id from my_courses))
  ),
  -- Alumnos (con «Ver», sin email, teléfono, cumpleaños, notas ni Discord). Al profesor, solo los
  -- de sus cursos y, en courseIds, solo esos cursos.
  s_rows as (
    select case when v_full then s.data else s.data - 'email' - 'phone' - 'birthday' - 'notes' - 'discord' end as data
    from public.students s
    where s.user_id in (select id from ceo) and s.deleted_at is null
      and (not v_teacher or (
        jsonb_typeof(s.data -> 'courseIds') = 'array'
        and exists (select 1 from jsonb_array_elements_text(s.data -> 'courseIds') x where x in (select id from my_courses))
      ))
  ),
  s_all as (
    select case when v_teacher then jsonb_set(data, '{courseIds}', coalesce((
        select jsonb_agg(x) from jsonb_array_elements_text(data -> 'courseIds') x where x in (select id from my_courses)
      ), '[]'::jsonb)) else data end as data
    from s_rows
  )
  select jsonb_build_object(
    'level', v_level,
    'teacher', v_teacher,
    'canMark', v_teacher and p_area is null and v_who = v_me,
    'alliance', v_alliance is not null,
    'allianceEdit', coalesce(v_alliance = 'edit', false) and p_area is null and v_who = v_me and not public.is_ceo(),
    'contacts', case p_screen
      -- external: contacto externo (lo puede editar Alianzas).
      when 'contactos' then coalesce((select jsonb_agg((data - 'candidacies' - 'candidateOnly') || jsonb_build_object('external', external)) from c_flags where not active and not candidate_only), '[]'::jsonb)
      when 'equipo' then coalesce((select jsonb_agg(data - 'candidacies' - 'candidateOnly') from c_flags where team), '[]'::jsonb)
      when 'vacantes' then coalesce((select jsonb_agg(data) from c_cand), '[]'::jsonb)
      else coalesce((select jsonb_agg(data) from c_teachers), '[]'::jsonb)
    end,
    'groups', case when p_screen in ('contactos', 'equipo') then coalesce((
        select jsonb_agg(g.data) from public.groups g where g.user_id in (select id from ceo) and g.deleted_at is null
      ), '[]'::jsonb) else '[]'::jsonb end,
    'vacancies', case when p_screen = 'vacantes' then coalesce((
        select jsonb_agg(v.data) from public.vacancies v where v.user_id in (select id from ceo) and v.deleted_at is null
      ), '[]'::jsonb) else '[]'::jsonb end,
    'courses', case when p_screen in ('cursos', 'alumnos', 'asistencia') then coalesce((select jsonb_agg(data) from courses), '[]'::jsonb) else '[]'::jsonb end,
    'students', case when p_screen in ('cursos', 'alumnos', 'asistencia') then coalesce((select jsonb_agg(data) from s_all), '[]'::jsonb) else '[]'::jsonb end,
    'attendance', case when p_screen in ('cursos', 'alumnos', 'asistencia') then coalesce((
        select jsonb_agg(a.data) from public.attendance a
        where a.user_id in (select id from ceo) and a.deleted_at is null
          and (not v_teacher or a.data ->> 'courseId' in (select id from my_courses))
      ), '[]'::jsonb) else '[]'::jsonb end,
    'extraClasses', case when p_screen in ('cursos', 'alumnos', 'asistencia') then coalesce((
        select jsonb_agg(x.data) from public.extra_classes x
        where x.user_id in (select id from ceo) and x.deleted_at is null
          and (not v_teacher or x.data ->> 'courseId' in (select id from my_courses))
      ), '[]'::jsonb) else '[]'::jsonb end
  ) into v_out;
  return v_out;
end;
$$;

-- -----------------------------------------------------------------------------
-- Escribir en los contactos de la ceo
-- -----------------------------------------------------------------------------

-- Guarda la ficha y la deja como la más reciente (aunque el reloj de un dispositivo de la ceo vaya
-- adelantado). Devuelve la ficha guardada.
create or replace function public.cesi_contact_write(p_ceo uuid, p_id text, p_data jsonb, p_old_stamp timestamptz)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_stamp timestamptz := greatest(clock_timestamp(), coalesce(p_old_stamp + interval '1 millisecond', '-infinity'));
  v_data jsonb := p_data || jsonb_build_object('id', p_id, 'updatedAt', public.cesi_iso(v_stamp));
begin
  insert into public.contacts (user_id, id, data, updated_at, deleted_at)
  values (p_ceo, p_id, v_data, v_stamp, null)
  on conflict (user_id, id) do update set data = excluded.data, updated_at = excluded.updated_at, deleted_at = null;
  return v_data;
end;
$$;

-- La ficha de un contacto externo de la ceo, bloqueada para cambiarla. Error si no es externo.
create or replace function public.cesi_external_contact(p_id text, out o_ceo uuid, out o_data jsonb, out o_stamp timestamptz)
language plpgsql
volatile
security definer
set search_path = ''
as $$
begin
  select c.user_id, c.data, c.updated_at into o_ceo, o_data, o_stamp
  from public.contacts c
  where c.id = p_id and c.deleted_at is null and c.user_id in (select id from public.profiles where role = 'ceo')
  limit 1
  for update;
  if o_ceo is null then
    raise exception 'Ese contacto ya no existe.' using errcode = '22023';
  end if;
  if not public.cesi_is_external_contact(o_data) then
    raise exception 'Solo se pueden cambiar los contactos externos (no las fichas de Equipo, alumnos ni candidatos).' using errcode = '42501';
  end if;
end;
$$;

revoke all on function public.cesi_contact_write(uuid, text, jsonb, timestamptz) from public, anon, authenticated;
revoke all on function public.cesi_external_contact(text) from public, anon, authenticated;

-- Crear (p_id null) o editar un contacto externo (Alianzas). p_data: { name, email, phone,
-- organization, role, notes, groupIds, country, timeZone, availability }; lo demás de la ficha se
-- queda como está. Devuelve la ficha guardada.
create or replace function public.cesi_external_contact_save(p_id text, p_data jsonb)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_me uuid := public.cesi_alliance_writer();
  v_ceo uuid;
  v_old jsonb := '{}'::jsonb;
  v_stamp timestamptz;
  v_id text := p_id;
  v_name text := trim(coalesce(p_data ->> 'name', ''));
  v_patch jsonb;
begin
  if length(v_name) = 0 or length(v_name) > 200 then
    raise exception 'Escribe el nombre (como mucho 200 caracteres).' using errcode = '22023';
  end if;
  if coalesce(p_data ->> 'country', '') = '' or coalesce(p_data ->> 'timeZone', '') = '' then
    raise exception 'El país es obligatorio.' using errcode = '22023';
  end if;
  if length(coalesce(p_data ->> 'notes', '')) > 4000 or length(coalesce(p_data ->> 'email', '')) > 200
     or length(coalesce(p_data ->> 'phone', '')) > 60 or length(coalesce(p_data ->> 'organization', '')) > 200
     or length(coalesce(p_data ->> 'role', '')) > 200 then
    raise exception 'Algún dato es demasiado largo.' using errcode = '22023';
  end if;

  if v_id is null then
    select id into v_ceo from public.profiles where role = 'ceo' order by created_at limit 1;
    if v_ceo is null then
      raise exception 'No hay cuenta de la dirección.' using errcode = '22023';
    end if;
    v_id := gen_random_uuid()::text;
    v_old := jsonb_build_object('photo', null, 'createdAt', public.cesi_iso(clock_timestamp()));
  else
    select o_ceo, o_data, o_stamp into v_ceo, v_old, v_stamp from public.cesi_external_contact(v_id);
  end if;

  v_patch := jsonb_build_object(
    'name', v_name,
    'email', trim(coalesce(p_data ->> 'email', '')),
    'phone', trim(coalesce(p_data ->> 'phone', '')),
    'organization', trim(coalesce(p_data ->> 'organization', '')),
    'role', trim(coalesce(p_data ->> 'role', '')),
    'notes', trim(coalesce(p_data ->> 'notes', '')),
    'groupIds', case when jsonb_typeof(p_data -> 'groupIds') = 'array' then p_data -> 'groupIds' else '[]'::jsonb end,
    'country', p_data ->> 'country',
    'timeZone', p_data ->> 'timeZone',
    'countryUnreviewed', false,
    'availability', case when jsonb_typeof(p_data -> 'availability') = 'object' then p_data -> 'availability' else 'null'::jsonb end
  );
  return public.cesi_contact_write(v_ceo, v_id, v_old || v_patch, v_stamp);
end;
$$;

-- Guardar el seguimiento de alianza de un contacto externo (Alianzas). p_alliance: { type, status,
-- offer, amount, startDate, endDate, nextStep, nextStepDate, ownerId }. Las notas no se tocan
-- (van con las funciones de abajo). Al pasar a «cerrado» se guarda cuándo (closedAt).
create or replace function public.cesi_alliance_save(p_contact_id text, p_alliance jsonb)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_me uuid := public.cesi_alliance_writer();
  v_ceo uuid;
  v_data jsonb;
  v_stamp timestamptz;
  v_old jsonb;
  v_status text := p_alliance ->> 'status';
  v_type text := p_alliance ->> 'type';
  v_amount numeric;
  v_owner uuid;
  v_start text;
  v_end text;
begin
  select o_ceo, o_data, o_stamp into v_ceo, v_data, v_stamp from public.cesi_external_contact(p_contact_id);
  v_old := case when jsonb_typeof(v_data -> 'alliance') = 'object' then v_data -> 'alliance' else '{}'::jsonb end;

  if coalesce(v_type, '') not in ('patrocinador', 'colaborador', 'partner', 'otro') then
    raise exception 'Elige el tipo.' using errcode = '22023';
  end if;
  if coalesce(v_status, '') not in ('por_contactar', 'contactado', 'negociacion', 'cerrado', 'descartado') then
    raise exception 'Estado no válido.' using errcode = '22023';
  end if;
  if length(coalesce(p_alliance ->> 'offer', '')) > 2000 or length(coalesce(p_alliance ->> 'nextStep', '')) > 500 then
    raise exception 'El texto es demasiado largo.' using errcode = '22023';
  end if;
  if coalesce(p_alliance ->> 'amount', '') <> '' then
    if (p_alliance ->> 'amount') !~ '^\d{1,9}(\.\d{1,2})?$' then
      raise exception 'El importe tiene que ser un número de euros (sin signos).' using errcode = '22023';
    end if;
    v_amount := (p_alliance ->> 'amount')::numeric;
  end if;
  v_start := public.cesi_day_or_empty(p_alliance ->> 'startDate');
  v_end := public.cesi_day_or_empty(p_alliance ->> 'endDate');
  if v_start <> '' and v_end <> '' and v_end < v_start then
    raise exception 'El fin del acuerdo tiene que ser después del inicio.' using errcode = '22023';
  end if;
  if coalesce(p_alliance ->> 'ownerId', '') <> '' then
    begin
      v_owner := (p_alliance ->> 'ownerId')::uuid;
    exception when others then
      raise exception 'Responsable no válido.' using errcode = '22023';
    end;
    if not exists (select 1 from public.profiles where id = v_owner and role = 'equipo' and area in ('alianzas', 'direccion')) then
      raise exception 'El responsable tiene que ser de Alianzas o Directivo.' using errcode = '22023';
    end if;
  end if;

  v_data := v_data || jsonb_build_object('alliance', v_old || jsonb_build_object(
    'type', v_type,
    'status', v_status,
    'offer', trim(coalesce(p_alliance ->> 'offer', '')),
    'amount', v_amount,
    'startDate', v_start,
    'endDate', v_end,
    'nextStep', trim(coalesce(p_alliance ->> 'nextStep', '')),
    'nextStepDate', public.cesi_day_or_empty(p_alliance ->> 'nextStepDate'),
    'ownerId', v_owner,
    'ownerName', case when v_owner is null then '' else public.cesi_person_name(v_owner) end,
    'notes', case when jsonb_typeof(v_old -> 'notes') = 'array' then v_old -> 'notes' else '[]'::jsonb end,
    'closedAt', case
      when v_status <> 'cerrado' then null
      when v_old ->> 'status' = 'cerrado' and v_old ? 'closedAt' then v_old -> 'closedAt'
      else to_jsonb(public.cesi_iso(clock_timestamp()))
    end,
    'updatedAt', public.cesi_iso(clock_timestamp())
  ));
  return public.cesi_contact_write(v_ceo, p_contact_id, v_data, v_stamp);
end;
$$;

-- Añadir una nota al historial (Alianzas). Si el contacto aún no tenía seguimiento, se crea (otro,
-- por contactar).
create or replace function public.cesi_alliance_note_add(p_contact_id text, p_text text)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_me uuid := public.cesi_alliance_writer();
  v_ceo uuid;
  v_data jsonb;
  v_stamp timestamptz;
  v_alliance jsonb;
  v_text text := trim(coalesce(p_text, ''));
begin
  if length(v_text) = 0 or length(v_text) > 1000 then
    raise exception 'Escribe la nota (como mucho 1000 caracteres).' using errcode = '22023';
  end if;
  select o_ceo, o_data, o_stamp into v_ceo, v_data, v_stamp from public.cesi_external_contact(p_contact_id);
  v_alliance := case when jsonb_typeof(v_data -> 'alliance') = 'object' then v_data -> 'alliance'
    else jsonb_build_object('type', 'otro', 'status', 'por_contactar', 'offer', '', 'amount', null, 'startDate', '', 'endDate', '',
      'nextStep', '', 'nextStepDate', '', 'ownerId', null, 'ownerName', '', 'closedAt', null) end;
  v_alliance := v_alliance || jsonb_build_object(
    'notes', (case when jsonb_typeof(v_alliance -> 'notes') = 'array' then v_alliance -> 'notes' else '[]'::jsonb end)
      || jsonb_build_array(jsonb_build_object(
        'id', gen_random_uuid()::text, 'at', public.cesi_iso(clock_timestamp()), 'text', v_text,
        'byId', v_me, 'by', public.cesi_person_name(v_me))),
    'updatedAt', public.cesi_iso(clock_timestamp()));
  return public.cesi_contact_write(v_ceo, p_contact_id, v_data || jsonb_build_object('alliance', v_alliance), v_stamp);
end;
$$;

-- Quitar una nota del historial (Alianzas).
create or replace function public.cesi_alliance_note_remove(p_contact_id text, p_note_id text)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_me uuid := public.cesi_alliance_writer();
  v_ceo uuid;
  v_data jsonb;
  v_stamp timestamptz;
  v_alliance jsonb;
begin
  select o_ceo, o_data, o_stamp into v_ceo, v_data, v_stamp from public.cesi_external_contact(p_contact_id);
  if jsonb_typeof(v_data -> 'alliance') <> 'object' or jsonb_typeof(v_data -> 'alliance' -> 'notes') <> 'array' then
    return v_data;
  end if;
  v_alliance := (v_data -> 'alliance') || jsonb_build_object(
    'notes', coalesce((select jsonb_agg(n) from jsonb_array_elements(v_data -> 'alliance' -> 'notes') n where n ->> 'id' is distinct from p_note_id), '[]'::jsonb),
    'updatedAt', public.cesi_iso(clock_timestamp()));
  return public.cesi_contact_write(v_ceo, p_contact_id, v_data || jsonb_build_object('alliance', v_alliance), v_stamp);
end;
$$;

-- -----------------------------------------------------------------------------
-- Responsables y cifras
-- -----------------------------------------------------------------------------

-- Responsables posibles: las personas de Alianzas y de Directivo (para quien ve las alianzas).
create or replace function public.cesi_alliance_people()
returns table (id uuid, name text, area text)
language plpgsql
stable
security definer
set search_path = ''
as $$
#variable_conflict use_column
begin
  if public.cesi_alliance_role((select auth.uid())) is null then
    raise exception 'Sin permiso.' using errcode = '42501';
  end if;
  return query
    select p.id, public.cesi_person_name(p.id), p.area
    from public.profiles p
    where p.role = 'equipo' and p.area in ('alianzas', 'direccion')
    order by 2;
end;
$$;

-- Alianzas cerradas este mes (en la zona de quien mira) y en negociación. Directivo y la ceo
-- (p_as: «Ver como» de la ceo).
create or replace function public.cesi_alliance_stats(p_as uuid default null)
returns table (closed_month integer, negotiating integer)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_me uuid := public.cesi_home_viewer(p_as);
  v_zone text := public.cesi_zone_of(v_me);
  v_month timestamptz := date_trunc('month', now() at time zone v_zone) at time zone v_zone;
begin
  return query
  with a as (
    select c.data -> 'alliance' as al
    from public.contacts c
    where c.user_id in (select id from public.profiles where role = 'ceo') and c.deleted_at is null
      and jsonb_typeof(c.data -> 'alliance') = 'object' and public.cesi_is_external_contact(c.data)
  )
  select
    (select count(*) from a where al ->> 'status' = 'cerrado' and public.cesi_try_ts(al ->> 'closedAt') >= v_month)::integer,
    (select count(*) from a where al ->> 'status' = 'negociacion')::integer;
end;
$$;

-- -----------------------------------------------------------------------------
-- Permisos de las funciones
-- -----------------------------------------------------------------------------
revoke all on function public.cesi_screen_data(text, uuid, text) from public, anon;
revoke all on function public.cesi_external_contact_save(text, jsonb) from public, anon;
revoke all on function public.cesi_alliance_save(text, jsonb) from public, anon;
revoke all on function public.cesi_alliance_note_add(text, text) from public, anon;
revoke all on function public.cesi_alliance_note_remove(text, text) from public, anon;
revoke all on function public.cesi_alliance_people() from public, anon;
revoke all on function public.cesi_alliance_stats(uuid) from public, anon;
grant execute on function public.cesi_screen_data(text, uuid, text) to authenticated;
grant execute on function public.cesi_external_contact_save(text, jsonb) to authenticated;
grant execute on function public.cesi_alliance_save(text, jsonb) to authenticated;
grant execute on function public.cesi_alliance_note_add(text, text) to authenticated;
grant execute on function public.cesi_alliance_note_remove(text, text) to authenticated;
grant execute on function public.cesi_alliance_people() to authenticated;
grant execute on function public.cesi_alliance_stats(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- Parte 17: tablero de cada área (Moderación, Media, Técnico, Ciberseguridad y Legal)
-- ---------------------------------------------------------------------------
-- -----------------------------------------------------------------------------
-- Configuración de cada tablero
-- -----------------------------------------------------------------------------
--   statuses        estados en orden (las columnas)
--   done_statuses   los que cuentan como terminados (no salen como pendientes)
--   priorities      prioridad o gravedad (null: el tablero no la usa)
--   with_time       la fecha lleva hora (publicaciones)
--   fields          { campo: [opciones] | null (texto libre) }
create table if not exists public.board_configs (
  area text primary key references public.areas (id) on update cascade on delete cascade,
  statuses text[] not null,
  done_statuses text[] not null default '{}',
  priorities text[],
  with_time boolean not null default false,
  fields jsonb not null default '{}'::jsonb
);

insert into public.board_configs (area, statuses, done_statuses, priorities, with_time, fields) values
  ('moderacion', array['abierto', 'en_revision', 'resuelto'], array['resuelto'], array['leve', 'media', 'grave'], false,
    '{"type": ["aviso", "sancion", "incidencia", "expulsion"], "discordUser": null, "channel": null, "reason": null}'),
  ('media', array['idea', 'preparacion', 'programada', 'publicada'], array['publicada'], null, true,
    '{"network": ["instagram", "tiktok", "youtube", "x", "discord", "otra"], "link": null}'),
  ('tecnico', array['nueva', 'en_curso', 'en_pruebas', 'resuelta'], array['resuelta'], array['baja', 'media', 'alta', 'urgente'], false,
    '{"type": ["error", "peticion", "mejora"], "system": ["web", "app", "bot", "otro"], "requestedBy": null}'),
  ('ciberseguridad', array['abierto', 'en_analisis', 'resuelto'], array['resuelto'], array['leve', 'media', 'grave'], false,
    '{"type": ["incidente", "revision", "alerta"], "system": null}'),
  ('legal', array['borrador', 'en_vigor', 'a_revisar'], array['en_vigor'], null, false,
    '{"type": ["norma", "contrato", "privacidad", "otro"], "link": null}')
on conflict (area) do update set
  statuses = excluded.statuses, done_statuses = excluded.done_statuses, priorities = excluded.priorities,
  with_time = excluded.with_time, fields = excluded.fields;

-- -----------------------------------------------------------------------------
-- Elementos y comentarios
-- -----------------------------------------------------------------------------
create table if not exists public.board_items (
  id uuid primary key default gen_random_uuid(),
  area text not null references public.areas (id) on update cascade on delete cascade,
  title text not null check (length(trim(title)) between 1 and 200),
  description text not null default '' check (length(description) <= 4000),
  owner_id uuid references public.profiles (id) on delete set null,
  owner_gone_name text not null default '',
  due_date date,
  due_time time,
  priority text,
  status text not null,
  fields jsonb not null default '{}'::jsonb,
  created_by uuid references public.profiles (id) on delete set null,
  creator_gone_name text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  done_at timestamptz
);
create index if not exists board_items_area_idx on public.board_items (area, status);
create index if not exists board_items_owner_idx on public.board_items (owner_id);

create table if not exists public.board_comments (
  id uuid primary key default gen_random_uuid(),
  item_id uuid not null references public.board_items (id) on delete cascade,
  author_id uuid references public.profiles (id) on delete set null,
  author_gone_name text not null default '',
  text text not null check (length(trim(text)) between 1 and 2000),
  created_at timestamptz not null default now()
);
create index if not exists board_comments_item_idx on public.board_comments (item_id, created_at);

-- -----------------------------------------------------------------------------
-- Ayudas
-- -----------------------------------------------------------------------------

-- Qué puede hacer `p_profile` en el tablero de `p_area`: 'edit' (las personas del área y la ceo),
-- 'comment' (Directivo: ver y comentar) o null (nada; tampoco si el área no tiene tablero).
create or replace function public.cesi_board_role(p_profile uuid, p_area text)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select case
    when not exists (select 1 from public.board_configs where area = p_area) then null
    when p.role = 'ceo' then 'edit'
    when p.role = 'equipo' and p.area = p_area then 'edit'
    when p.role = 'equipo' and p.area = 'direccion' then 'comment'
  end
  from public.profiles p
  where p.id = p_profile;
$$;

-- Quién mira: la cuenta o, solo la ceo, otra con p_as («Ver como»).
create or replace function public.cesi_board_viewer(p_as uuid)
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
    return p_as;
  end if;
  return v_me;
end;
$$;

-- La usan las reglas de acceso de abajo (con la cuenta que lee): tiene que poder ejecutarla.
revoke all on function public.cesi_board_role(uuid, text) from public, anon;
grant execute on function public.cesi_board_role(uuid, text) to authenticated;
revoke all on function public.cesi_board_viewer(uuid) from public, anon, authenticated;

-- -----------------------------------------------------------------------------
-- Reglas de acceso (solo leer; escribir, con las funciones)
-- -----------------------------------------------------------------------------
alter table public.board_configs enable row level security;
alter table public.board_items enable row level security;
alter table public.board_comments enable row level security;

drop policy if exists "board_configs: leer" on public.board_configs;
create policy "board_configs: leer" on public.board_configs
  for select to authenticated using (true);

drop policy if exists "board_items: leer los de mis tableros" on public.board_items;
create policy "board_items: leer los de mis tableros" on public.board_items
  for select to authenticated
  using (public.cesi_board_role((select auth.uid()), area) is not null);

drop policy if exists "board_comments: leer los de mis tableros" on public.board_comments;
create policy "board_comments: leer los de mis tableros" on public.board_comments
  for select to authenticated
  using (exists (
    select 1 from public.board_items i
    where i.id = board_comments.item_id and public.cesi_board_role((select auth.uid()), i.area) is not null
  ));

revoke all on public.board_configs, public.board_items, public.board_comments from anon;
revoke all on public.board_configs, public.board_items, public.board_comments from authenticated;
grant select on public.board_configs, public.board_items, public.board_comments to authenticated;

-- -----------------------------------------------------------------------------
-- Leer
-- -----------------------------------------------------------------------------

-- Los elementos del tablero de un área (para quien lo ve), con el nombre del responsable,
-- cuántos comentarios tiene y lo que puedo hacer (can_edit: crear, editar, mover y borrar;
-- can_comment: comentar).
create or replace function public.cesi_board_items(p_area text, p_as uuid default null)
returns table (
  id uuid, area text, title text, description text, owner_id uuid, owner_name text,
  due_date date, due_time text, priority text, status text, fields jsonb,
  created_by_name text, created_at timestamptz, updated_at timestamptz, done_at timestamptz,
  comments_count integer, can_edit boolean, can_comment boolean
)
language plpgsql
stable
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  v_me uuid := public.cesi_board_viewer(p_as);
  v_role text := public.cesi_board_role(v_me, p_area);
begin
  if v_role is null then
    raise exception 'No tienes acceso a este tablero.' using errcode = '42501';
  end if;
  return query
    select i.id, i.area, i.title, i.description, i.owner_id,
      case when i.owner_id is null and i.owner_gone_name = '' then '' else public.cesi_name_or_gone(i.owner_id, i.owner_gone_name) end,
      i.due_date, to_char(i.due_time, 'HH24:MI'), i.priority, i.status, i.fields,
      case when i.created_by is null and i.creator_gone_name = '' then '' else public.cesi_name_or_gone(i.created_by, i.creator_gone_name) end,
      i.created_at, i.updated_at, i.done_at,
      (select count(*)::integer from public.board_comments c where c.item_id = i.id),
      v_role = 'edit', true
    from public.board_items i
    where i.area = p_area
    order by i.due_date nulls last, i.due_time nulls last, i.created_at;
end;
$$;

-- Comentarios de un elemento (del más antiguo al más nuevo). can_delete: los míos (la ceo, todos).
create or replace function public.cesi_board_comments(p_item uuid, p_as uuid default null)
returns table (id uuid, author_id uuid, author_name text, text text, created_at timestamptz, can_delete boolean)
language plpgsql
stable
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  v_me uuid := public.cesi_board_viewer(p_as);
  v_area text := (select i.area from public.board_items i where i.id = p_item);
begin
  if v_area is null or public.cesi_board_role(v_me, v_area) is null then
    raise exception 'No tienes acceso a este tablero.' using errcode = '42501';
  end if;
  return query
    select c.id, c.author_id, public.cesi_name_or_gone(c.author_id, c.author_gone_name), c.text, c.created_at,
      p_as is null and (c.author_id = v_me or public.is_ceo())
    from public.board_comments c
    where c.item_id = p_item
    order by c.created_at;
end;
$$;

-- Responsables posibles de un tablero: las personas de equipo de esa área.
create or replace function public.cesi_board_people(p_area text)
returns table (id uuid, name text)
language plpgsql
stable
security definer
set search_path = ''
as $$
#variable_conflict use_column
begin
  if public.cesi_board_role((select auth.uid()), p_area) is null then
    raise exception 'No tienes acceso a este tablero.' using errcode = '42501';
  end if;
  return query
    select p.id, public.cesi_person_name(p.id)
    from public.profiles p
    where p.role = 'equipo' and p.area = p_area
    order by 2;
end;
$$;

-- Elementos abiertos (sin terminar) por área, para «Mi equipo» y el Inicio de Directivo.
create or replace function public.cesi_board_counts(p_as uuid default null)
returns table (area text, open_count integer)
language plpgsql
stable
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  v_me uuid := public.cesi_home_viewer(p_as);
begin
  return query
    select b.area,
      (select count(*)::integer from public.board_items i where i.area = b.area and not (i.status = any (b.done_statuses)))
    from public.board_configs b
    join public.areas a on a.id = b.area
    order by a.sort;
end;
$$;

-- -----------------------------------------------------------------------------
-- Escribir
-- -----------------------------------------------------------------------------

-- Crear (p_id null) o editar un elemento (las personas del área y la ceo). p_fields: los campos
-- propios del área ({ campo: texto }); los que tienen opciones, solo esas (o vacío).
create or replace function public.cesi_board_save(
  p_id uuid, p_area text, p_title text, p_description text, p_owner uuid,
  p_due_date date, p_due_time text, p_priority text, p_status text, p_fields jsonb
)
returns uuid
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_me uuid := (select auth.uid());
  v_cfg public.board_configs;
  v_old public.board_items;
  v_id uuid := p_id;
  v_fields jsonb := '{}'::jsonb;
  v_key text;
  v_value jsonb;
  v_time time;
begin
  select * into v_cfg from public.board_configs where area = p_area;
  if not found then
    raise exception 'Esa área no tiene tablero.' using errcode = '22023';
  end if;
  if public.cesi_board_role(v_me, p_area) is distinct from 'edit' then
    raise exception 'Solo las personas del área (y la dirección) pueden cambiar este tablero.' using errcode = '42501';
  end if;
  if length(trim(coalesce(p_title, ''))) = 0 or length(trim(p_title)) > 200 then
    raise exception 'Escribe un título (como mucho 200 caracteres).' using errcode = '22023';
  end if;
  if length(coalesce(p_description, '')) > 4000 then
    raise exception 'La descripción es demasiado larga.' using errcode = '22023';
  end if;
  if not (coalesce(p_status, '') = any (v_cfg.statuses)) then
    raise exception 'Estado no válido.' using errcode = '22023';
  end if;
  if p_priority is not null and (v_cfg.priorities is null or not (p_priority = any (v_cfg.priorities))) then
    raise exception 'Prioridad o gravedad no válida.' using errcode = '22023';
  end if;
  if p_owner is not null and not exists (select 1 from public.profiles where id = p_owner and role = 'equipo' and area = p_area) then
    raise exception 'El responsable tiene que ser una persona de esa área.' using errcode = '22023';
  end if;
  if coalesce(p_due_time, '') <> '' then
    if not v_cfg.with_time or p_due_date is null or p_due_time !~ '^([01]\d|2[0-3]):[0-5]\d$' then
      raise exception 'Hora no válida.' using errcode = '22023';
    end if;
    v_time := p_due_time::time;
  end if;

  -- Campos propios: solo los del área, en texto, y con sus opciones.
  if p_fields is not null and jsonb_typeof(p_fields) = 'object' then
    for v_key, v_value in select * from jsonb_each(p_fields) loop
      if not (v_cfg.fields ? v_key) then
        raise exception 'Campo no válido: %.', v_key using errcode = '22023';
      end if;
      if jsonb_typeof(v_value) = 'null' or (jsonb_typeof(v_value) = 'string' and v_value #>> '{}' = '') then
        continue;
      end if;
      if jsonb_typeof(v_value) <> 'string' or length(v_value #>> '{}') > 1000 then
        raise exception 'Campo no válido: %.', v_key using errcode = '22023';
      end if;
      if jsonb_typeof(v_cfg.fields -> v_key) = 'array' and not ((v_cfg.fields -> v_key) ? (v_value #>> '{}')) then
        raise exception 'Opción no válida en %.', v_key using errcode = '22023';
      end if;
      v_fields := v_fields || jsonb_build_object(v_key, trim(v_value #>> '{}'));
    end loop;
  end if;

  if v_id is null then
    insert into public.board_items (area, title, description, owner_id, due_date, due_time, priority, status, fields, created_by, done_at)
    values (p_area, trim(p_title), coalesce(p_description, ''), p_owner, p_due_date, v_time, p_priority, p_status, v_fields, v_me,
            case when p_status = any (v_cfg.done_statuses) then now() end)
    returning id into v_id;
  else
    select * into v_old from public.board_items where id = v_id for update;
    if not found or v_old.area <> p_area then
      raise exception 'Ese elemento ya no existe.' using errcode = '22023';
    end if;
    update public.board_items
    set title = trim(p_title), description = coalesce(p_description, ''), owner_id = p_owner,
        owner_gone_name = case when p_owner is null then owner_gone_name else '' end,
        due_date = p_due_date, due_time = v_time, priority = p_priority, status = p_status, fields = v_fields,
        updated_at = now(),
        done_at = case when not (p_status = any (v_cfg.done_statuses)) then null else coalesce(done_at, now()) end
    where id = v_id;
  end if;
  return v_id;
end;
$$;

-- Mover a otra columna (cambiar el estado).
create or replace function public.cesi_board_move(p_id uuid, p_status text)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_item public.board_items;
  v_cfg public.board_configs;
begin
  select * into v_item from public.board_items where id = p_id for update;
  if not found then
    raise exception 'Ese elemento ya no existe.' using errcode = '22023';
  end if;
  select * into v_cfg from public.board_configs where area = v_item.area;
  if public.cesi_board_role((select auth.uid()), v_item.area) is distinct from 'edit' then
    raise exception 'Solo las personas del área (y la dirección) pueden cambiar este tablero.' using errcode = '42501';
  end if;
  if not (coalesce(p_status, '') = any (v_cfg.statuses)) then
    raise exception 'Estado no válido.' using errcode = '22023';
  end if;
  update public.board_items
  set status = p_status, updated_at = now(),
      done_at = case when not (p_status = any (v_cfg.done_statuses)) then null else coalesce(done_at, now()) end
  where id = p_id;
end;
$$;

-- Borrar un elemento (las personas del área y la ceo), con sus comentarios.
create or replace function public.cesi_board_delete(p_id uuid)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_area text := (select area from public.board_items where id = p_id);
begin
  if v_area is null then
    raise exception 'Ese elemento ya no existe.' using errcode = '22023';
  end if;
  if public.cesi_board_role((select auth.uid()), v_area) is distinct from 'edit' then
    raise exception 'Solo las personas del área (y la dirección) pueden borrar en este tablero.' using errcode = '42501';
  end if;
  delete from public.board_items where id = p_id;
end;
$$;

-- Comentar (las personas del área, Directivo y la ceo).
create or replace function public.cesi_board_comment_add(p_item uuid, p_text text)
returns uuid
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_me uuid := (select auth.uid());
  v_area text := (select area from public.board_items where id = p_item);
  v_id uuid;
begin
  if v_area is null or public.cesi_board_role(v_me, v_area) is null then
    raise exception 'No tienes acceso a este tablero.' using errcode = '42501';
  end if;
  if length(trim(coalesce(p_text, ''))) = 0 or length(trim(p_text)) > 2000 then
    raise exception 'Escribe el comentario (como mucho 2000 caracteres).' using errcode = '22023';
  end if;
  insert into public.board_comments (item_id, author_id, text) values (p_item, v_me, trim(p_text)) returning id into v_id;
  return v_id;
end;
$$;

-- Borrar un comentario: quien lo escribió o la ceo.
create or replace function public.cesi_board_comment_delete(p_id uuid)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_me uuid := (select auth.uid());
begin
  delete from public.board_comments where id = p_id and (author_id = v_me or public.is_ceo());
  if not found then
    raise exception 'Solo quien lo escribió o la dirección pueden borrarlo.' using errcode = '42501';
  end if;
end;
$$;

-- Al eliminar una cuenta, sus elementos y comentarios se quedan con su nombre.
create or replace function public.cesi_board_gone()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_name text := left(coalesce(nullif(public.cesi_person_name(old.id), ''), 'Sin nombre'), 200);
begin
  update public.board_items set owner_gone_name = v_name where owner_id = old.id;
  update public.board_items set creator_gone_name = v_name where created_by = old.id;
  update public.board_comments set author_gone_name = v_name where author_id = old.id;
  return old;
end;
$$;

revoke all on function public.cesi_board_gone() from public, anon, authenticated;

drop trigger if exists profiles_board_gone on public.profiles;
create trigger profiles_board_gone
  before delete on public.profiles
  for each row execute function public.cesi_board_gone();

-- -----------------------------------------------------------------------------
-- Permisos de las funciones
-- -----------------------------------------------------------------------------
revoke all on function public.cesi_board_items(text, uuid) from public, anon;
revoke all on function public.cesi_board_comments(uuid, uuid) from public, anon;
revoke all on function public.cesi_board_people(text) from public, anon;
revoke all on function public.cesi_board_counts(uuid) from public, anon;
revoke all on function public.cesi_board_save(uuid, text, text, text, uuid, date, text, text, text, jsonb) from public, anon;
revoke all on function public.cesi_board_move(uuid, text) from public, anon;
revoke all on function public.cesi_board_delete(uuid) from public, anon;
revoke all on function public.cesi_board_comment_add(uuid, text) from public, anon;
revoke all on function public.cesi_board_comment_delete(uuid) from public, anon;
grant execute on function public.cesi_board_items(text, uuid) to authenticated;
grant execute on function public.cesi_board_comments(uuid, uuid) to authenticated;
grant execute on function public.cesi_board_people(text) to authenticated;
grant execute on function public.cesi_board_counts(uuid) to authenticated;
grant execute on function public.cesi_board_save(uuid, text, text, text, uuid, date, text, text, text, jsonb) to authenticated;
grant execute on function public.cesi_board_move(uuid, text) to authenticated;
grant execute on function public.cesi_board_delete(uuid) to authenticated;
grant execute on function public.cesi_board_comment_add(uuid, text) to authenticated;
grant execute on function public.cesi_board_comment_delete(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- Parte 18: avisos del equipo
-- ---------------------------------------------------------------------------
-- -----------------------------------------------------------------------------
-- Tablas
-- -----------------------------------------------------------------------------
--   area        null: todo el equipo; si no, solo esa área (si se borra el área, se borra el aviso)
--   show_until  último día en que se muestra (null: siempre)
create table if not exists public.team_notices (
  id uuid primary key default gen_random_uuid(),
  title text not null check (length(trim(title)) between 1 and 200),
  body text not null default '' check (length(body) <= 4000),
  area text references public.areas (id) on update cascade on delete cascade,
  important boolean not null default false,
  show_until date,
  created_by uuid references public.profiles (id) on delete set null,
  creator_gone_name text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists team_notices_created_idx on public.team_notices (created_at desc);

create table if not exists public.team_notice_reads (
  notice_id uuid not null references public.team_notices (id) on delete cascade,
  profile_id uuid not null references public.profiles (id) on delete cascade,
  read_at timestamptz not null default now(),
  primary key (notice_id, profile_id)
);
create index if not exists team_notice_reads_profile_idx on public.team_notice_reads (profile_id);

-- -----------------------------------------------------------------------------
-- Ayudas
-- -----------------------------------------------------------------------------

-- ¿Publica avisos? (la ceo y Directivo)
create or replace function public.cesi_notice_publisher(p_profile uuid)
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

-- ¿Es `p_profile` una de las personas a las que va el aviso? (de equipo y, si es para un área, de esa)
create or replace function public.cesi_notice_for(p_profile uuid, p_area text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.profiles
    where id = p_profile and role = 'equipo' and (p_area is null or area = p_area)
  );
$$;

-- Las usan las reglas de acceso de abajo (con la cuenta que lee): tienen que poder ejecutarse.
revoke all on function public.cesi_notice_publisher(uuid) from public, anon;
revoke all on function public.cesi_notice_for(uuid, text) from public, anon;
grant execute on function public.cesi_notice_publisher(uuid) to authenticated;
grant execute on function public.cesi_notice_for(uuid, text) to authenticated;

-- -----------------------------------------------------------------------------
-- Reglas de acceso (solo leer; escribir, con las funciones)
-- -----------------------------------------------------------------------------
alter table public.team_notices enable row level security;
alter table public.team_notice_reads enable row level security;

drop policy if exists "team_notices: leer los míos (quien publica, todos)" on public.team_notices;
create policy "team_notices: leer los míos (quien publica, todos)" on public.team_notices
  for select to authenticated
  using (public.cesi_notice_publisher((select auth.uid())) or public.cesi_notice_for((select auth.uid()), area));

drop policy if exists "team_notice_reads: leer los míos (quien publica, todos)" on public.team_notice_reads;
create policy "team_notice_reads: leer los míos (quien publica, todos)" on public.team_notice_reads
  for select to authenticated
  using (profile_id = (select auth.uid()) or public.cesi_notice_publisher((select auth.uid())));

revoke all on public.team_notices, public.team_notice_reads from anon;
revoke all on public.team_notices, public.team_notice_reads from authenticated;
grant select on public.team_notices, public.team_notice_reads to authenticated;

-- -----------------------------------------------------------------------------
-- Leer
-- -----------------------------------------------------------------------------
-- Los avisos de la cuenta actual (o, solo la ceo, de otra con p_as: «Ver como»), del más nuevo al
-- más antiguo. A quien publica: todos (también los caducados) y, en cada uno, cuántos lo han leído
-- y quién falta. A los demás: los suyos que aún se muestran.
--   for_me      va para mí;  read_at: cuándo lo leí (null: sin leer)
--   expired     ya pasó su fecha (en mi zona)
--   can_edit    lo publiqué yo o soy la ceo
--   recipients / read_count / missing_names: solo para quien publica (si no, 0, 0 y '')
create or replace function public.cesi_notices(p_as uuid default null)
returns table (
  id uuid, title text, body text, area text, area_name text, important boolean, show_until date,
  created_by uuid, created_by_name text, created_at timestamptz, updated_at timestamptz,
  for_me boolean, read_at timestamptz, expired boolean, can_edit boolean,
  recipients integer, read_count integer, missing_names text
)
language plpgsql
stable
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  v_me uuid := (select auth.uid());
  v_publisher boolean;
  v_ceo boolean;
  v_today date;
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
  v_publisher := public.cesi_notice_publisher(v_me);
  v_ceo := exists (select 1 from public.profiles p where p.id = v_me and p.role = 'ceo');
  v_today := (now() at time zone public.cesi_zone_of(v_me))::date;
  return query
    select n.id, n.title, n.body, n.area, coalesce(a.name, ''), n.important, n.show_until,
      n.created_by,
      case when n.created_by is null and n.creator_gone_name = '' then '' else public.cesi_name_or_gone(n.created_by, n.creator_gone_name) end,
      n.created_at, n.updated_at,
      public.cesi_notice_for(v_me, n.area),
      (select r.read_at from public.team_notice_reads r where r.notice_id = n.id and r.profile_id = v_me),
      n.show_until is not null and n.show_until < v_today,
      v_ceo or coalesce(n.created_by = v_me, false),
      case when v_publisher then coalesce(s.total, 0) else 0 end,
      case when v_publisher then coalesce(s.done, 0) else 0 end,
      case when v_publisher then coalesce(s.missing, '') else '' end
    from public.team_notices n
    left join public.areas a on a.id = n.area
    left join lateral (
      select count(*)::integer as total,
        (count(*) filter (where r.profile_id is not null))::integer as done,
        string_agg(x.name, ', ' order by x.name) filter (where r.profile_id is null) as missing
      from (
        select p.id, public.cesi_person_name(p.id) as name
        from public.profiles p
        where p.role = 'equipo' and (n.area is null or p.area = n.area)
      ) x
      left join public.team_notice_reads r on r.notice_id = n.id and r.profile_id = x.id
    ) s on v_publisher
    where v_publisher
       or (public.cesi_notice_for(v_me, n.area) and (n.show_until is null or n.show_until >= v_today))
    order by n.created_at desc;
end;
$$;

-- -----------------------------------------------------------------------------
-- Escribir
-- -----------------------------------------------------------------------------

-- Publicar (p_id null) o editar un aviso. Publican la ceo y Directivo; editan quien lo publicó y la
-- ceo. p_area: null (todo el equipo) o un área. Devuelve el id.
create or replace function public.cesi_notice_save(
  p_id uuid, p_title text, p_body text, p_area text, p_important boolean, p_show_until date
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
  v_old public.team_notices;
begin
  if not public.cesi_notice_publisher(v_me) then
    raise exception 'Solo la dirección y Directivo pueden publicar avisos.' using errcode = '42501';
  end if;
  if length(trim(coalesce(p_title, ''))) = 0 or length(trim(p_title)) > 200 then
    raise exception 'Escribe un título (como mucho 200 caracteres).' using errcode = '22023';
  end if;
  if length(coalesce(p_body, '')) > 4000 then
    raise exception 'El texto es demasiado largo (como mucho 4000 caracteres).' using errcode = '22023';
  end if;
  if p_area is not null and not exists (select 1 from public.areas where id = p_area) then
    raise exception 'Esa área no existe.' using errcode = '22023';
  end if;

  if v_id is null then
    insert into public.team_notices (title, body, area, important, show_until, created_by)
    values (trim(p_title), coalesce(p_body, ''), p_area, coalesce(p_important, false), p_show_until, v_me)
    returning id into v_id;
  else
    select * into v_old from public.team_notices where id = v_id for update;
    if not found or not (public.is_ceo() or coalesce(v_old.created_by = v_me, false)) then
      raise exception 'Solo quien lo publicó o la dirección pueden cambiarlo.' using errcode = '42501';
    end if;
    update public.team_notices
    set title = trim(p_title), body = coalesce(p_body, ''), area = p_area, important = coalesce(p_important, false),
        show_until = p_show_until, updated_at = now()
    where id = v_id;
  end if;
  return v_id;
end;
$$;

-- Borrar un aviso: quien lo publicó o la ceo.
create or replace function public.cesi_notice_delete(p_id uuid)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_me uuid := (select auth.uid());
begin
  delete from public.team_notices
  where id = p_id and (public.is_ceo() or created_by = v_me);
  if not found then
    raise exception 'Solo quien lo publicó o la dirección pueden borrarlo.' using errcode = '42501';
  end if;
end;
$$;

-- «Leído» (p_read true) o volver a «sin leer» (false): la persona a la que va el aviso.
create or replace function public.cesi_notice_read(p_id uuid, p_read boolean default true)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_me uuid := (select auth.uid());
  v_area text;
begin
  select area into v_area from public.team_notices where id = p_id;
  if not found then
    raise exception 'Ese aviso ya no existe.' using errcode = '22023';
  end if;
  if not public.cesi_notice_for(v_me, v_area) then
    raise exception 'Ese aviso no es para ti.' using errcode = '42501';
  end if;
  if coalesce(p_read, true) then
    insert into public.team_notice_reads (notice_id, profile_id) values (p_id, v_me)
    on conflict (notice_id, profile_id) do nothing;
  else
    delete from public.team_notice_reads where notice_id = p_id and profile_id = v_me;
  end if;
end;
$$;

-- Al eliminar una cuenta, sus avisos se quedan con su nombre.
create or replace function public.cesi_notices_gone()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.team_notices
  set creator_gone_name = left(coalesce(nullif(public.cesi_person_name(old.id), ''), 'Sin nombre'), 200)
  where created_by = old.id;
  return old;
end;
$$;

revoke all on function public.cesi_notices_gone() from public, anon, authenticated;

drop trigger if exists profiles_notices_gone on public.profiles;
create trigger profiles_notices_gone
  before delete on public.profiles
  for each row execute function public.cesi_notices_gone();

-- -----------------------------------------------------------------------------
-- Permisos de las funciones
-- -----------------------------------------------------------------------------
revoke all on function public.cesi_notices(uuid) from public, anon;
revoke all on function public.cesi_notice_save(uuid, text, text, text, boolean, date) from public, anon;
revoke all on function public.cesi_notice_delete(uuid) from public, anon;
revoke all on function public.cesi_notice_read(uuid, boolean) from public, anon;
grant execute on function public.cesi_notices(uuid) to authenticated;
grant execute on function public.cesi_notice_save(uuid, text, text, text, boolean, date) to authenticated;
grant execute on function public.cesi_notice_delete(uuid) to authenticated;
grant execute on function public.cesi_notice_read(uuid, boolean) to authenticated;

-- ---------------------------------------------------------------------------
-- Parte 19: Finanzas
-- ---------------------------------------------------------------------------
-- -----------------------------------------------------------------------------
-- Tablas
-- -----------------------------------------------------------------------------
--   kind         'ingreso' | 'gasto'
--   amount_cents cantidad en céntimos (siempre positiva; el tipo dice si suma o resta)
--   category     ingreso: patrocinio, donacion, colaboracion, otro
--                gasto: dominio_web, herramientas, premios, publicidad, material, otro
--   method       transferencia, paypal, tarjeta, efectivo, otro
--   contact_id / contact_name  contacto externo de Alianzas (solo en ingresos; el nombre, copiado)
create table if not exists public.finance_movements (
  id uuid primary key default gen_random_uuid(),
  kind text not null check (kind in ('ingreso', 'gasto')),
  day date not null,
  concept text not null check (length(trim(concept)) between 1 and 200),
  amount_cents bigint not null check (amount_cents > 0 and amount_cents <= 100000000000),
  category text not null,
  area text references public.areas (id) on update cascade on delete set null,
  method text not null default 'transferencia' check (method in ('transferencia', 'paypal', 'tarjeta', 'efectivo', 'otro')),
  receipt_url text not null default '' check (length(receipt_url) <= 1000),
  notes text not null default '' check (length(notes) <= 2000),
  contact_id text,
  contact_name text not null default '',
  created_by uuid references public.profiles (id) on delete set null,
  updated_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint finance_movements_category check (
    (kind = 'ingreso' and category in ('patrocinio', 'donacion', 'colaboracion', 'otro'))
    or (kind = 'gasto' and category in ('dominio_web', 'herramientas', 'premios', 'publicidad', 'material', 'otro'))
  )
);
create index if not exists finance_movements_day_idx on public.finance_movements (day);

create table if not exists public.finance_budgets (
  area text primary key references public.areas (id) on update cascade on delete cascade,
  monthly_cents bigint not null check (monthly_cents >= 0 and monthly_cents <= 100000000000),
  updated_by uuid references public.profiles (id) on delete set null,
  updated_at timestamptz not null default now()
);

--   action  'alta' | 'edicion' | 'borrado' | 'presupuesto'
--   who_name  el nombre de quien lo hizo (se queda aunque se elimine su cuenta)
create table if not exists public.finance_log (
  id bigint generated always as identity primary key,
  at timestamptz not null default now(),
  who uuid references public.profiles (id) on delete set null,
  who_name text not null default '',
  action text not null,
  movement_id uuid,
  area text,
  before jsonb,
  after jsonb
);
create index if not exists finance_log_at_idx on public.finance_log (at desc);

-- -----------------------------------------------------------------------------
-- Ayudas
-- -----------------------------------------------------------------------------

-- Qué puede hacer `p_profile` en Finanzas: 'edit' (Finanzas y la ceo), 'view' (Directivo) o null.
create or replace function public.cesi_finance_role(p_profile uuid)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select case
    when p.role = 'ceo' then 'edit'
    when p.role = 'equipo' and p.area = 'finanzas' then 'edit'
    when p.role = 'equipo' and p.area = 'direccion' then 'view'
  end
  from public.profiles p
  where p.id = p_profile;
$$;

-- Quién mira (o, solo la ceo, otra cuenta con p_as: «Ver como»). Error si no ve Finanzas.
create or replace function public.cesi_finance_viewer(p_as uuid)
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
  if public.cesi_finance_role(v_me) is null then
    raise exception 'No tienes acceso a Finanzas.' using errcode = '42501';
  end if;
  return v_me;
end;
$$;

-- Solo Finanzas y la ceo escriben.
create or replace function public.cesi_finance_writer()
returns uuid
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_me uuid := (select auth.uid());
begin
  if public.cesi_finance_role(v_me) is distinct from 'edit' then
    raise exception 'Solo Finanzas y la dirección pueden cambiar las finanzas.' using errcode = '42501';
  end if;
  return v_me;
end;
$$;

-- La usan las reglas de acceso de abajo (con la cuenta que lee): tiene que poder ejecutarse.
revoke all on function public.cesi_finance_role(uuid) from public, anon;
grant execute on function public.cesi_finance_role(uuid) to authenticated;
revoke all on function public.cesi_finance_viewer(uuid) from public, anon, authenticated;
revoke all on function public.cesi_finance_writer() from public, anon, authenticated;

-- -----------------------------------------------------------------------------
-- Reglas de acceso (solo leer; escribir, con las funciones)
-- -----------------------------------------------------------------------------
alter table public.finance_movements enable row level security;
alter table public.finance_budgets enable row level security;
alter table public.finance_log enable row level security;

drop policy if exists "finance_movements: leer (Finanzas, Directivo y la ceo)" on public.finance_movements;
create policy "finance_movements: leer (Finanzas, Directivo y la ceo)" on public.finance_movements
  for select to authenticated using (public.cesi_finance_role((select auth.uid())) is not null);

drop policy if exists "finance_budgets: leer (Finanzas, Directivo y la ceo)" on public.finance_budgets;
create policy "finance_budgets: leer (Finanzas, Directivo y la ceo)" on public.finance_budgets
  for select to authenticated using (public.cesi_finance_role((select auth.uid())) is not null);

drop policy if exists "finance_log: leer (Finanzas, Directivo y la ceo)" on public.finance_log;
create policy "finance_log: leer (Finanzas, Directivo y la ceo)" on public.finance_log
  for select to authenticated using (public.cesi_finance_role((select auth.uid())) is not null);

revoke all on public.finance_movements, public.finance_budgets, public.finance_log from anon;
revoke all on public.finance_movements, public.finance_budgets, public.finance_log from authenticated;
grant select on public.finance_movements, public.finance_budgets, public.finance_log to authenticated;

-- -----------------------------------------------------------------------------
-- Leer
-- -----------------------------------------------------------------------------

-- Los movimientos (del más reciente al más antiguo), con el nombre del área y de quién los creó
-- y cambió. can_edit: Finanzas y la ceo (no en «Ver como»).
create or replace function public.cesi_finance_movements(p_as uuid default null)
returns table (
  id uuid, kind text, day date, concept text, amount_cents bigint, category text, area text, area_name text,
  method text, receipt_url text, notes text, contact_id text, contact_name text,
  created_by_name text, updated_by_name text, created_at timestamptz, updated_at timestamptz, can_edit boolean
)
language plpgsql
stable
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  v_me uuid := public.cesi_finance_viewer(p_as);
  v_edit boolean := public.cesi_finance_role(v_me) = 'edit' and (p_as is null or p_as = (select auth.uid()));
begin
  return query
    select m.id, m.kind, m.day, m.concept, m.amount_cents, m.category, m.area, coalesce(a.name, ''),
      m.method, m.receipt_url, m.notes, m.contact_id, m.contact_name,
      case when m.created_by is null then '' else public.cesi_person_name(m.created_by) end,
      case when m.updated_by is null then '' else public.cesi_person_name(m.updated_by) end,
      m.created_at, m.updated_at, v_edit
    from public.finance_movements m
    left join public.areas a on a.id = m.area
    order by m.day desc, m.created_at desc;
end;
$$;

-- Resumen: { month, income, expense, balance, total_balance, months: [{ month, income, expense }]
-- (los últimos 6, del más antiguo al actual), by_category: [{ category, cents }] (gastos del mes),
-- budgets: [{ area, area_name, monthly, spent }] (todas las áreas; monthly null si no tiene) }.
-- p_month: primer día del mes (null: el actual en mi zona). Cantidades en céntimos.
create or replace function public.cesi_finance_summary(p_month date default null, p_as uuid default null)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_me uuid := public.cesi_finance_viewer(p_as);
  v_month date := date_trunc('month', coalesce(p_month, (now() at time zone public.cesi_zone_of(v_me))::date))::date;
  v_next date := (v_month + interval '1 month')::date;
begin
  return jsonb_build_object(
    'month', v_month,
    'income', (select coalesce(sum(amount_cents), 0) from public.finance_movements where kind = 'ingreso' and day >= v_month and day < v_next),
    'expense', (select coalesce(sum(amount_cents), 0) from public.finance_movements where kind = 'gasto' and day >= v_month and day < v_next),
    'balance', (select coalesce(sum(case when kind = 'ingreso' then amount_cents else -amount_cents end), 0)
                from public.finance_movements where day >= v_month and day < v_next),
    'total_balance', (select coalesce(sum(case when kind = 'ingreso' then amount_cents else -amount_cents end), 0)
                      from public.finance_movements where day < v_next),
    'months', (
      select jsonb_agg(jsonb_build_object(
        'month', mm.m,
        'income', (select coalesce(sum(amount_cents), 0) from public.finance_movements
                   where kind = 'ingreso' and day >= mm.m and day < (mm.m + interval '1 month')::date),
        'expense', (select coalesce(sum(amount_cents), 0) from public.finance_movements
                    where kind = 'gasto' and day >= mm.m and day < (mm.m + interval '1 month')::date)
      ) order by mm.m)
      from (select (v_month - make_interval(months => g))::date as m from generate_series(0, 5) g) mm
    ),
    'by_category', coalesce((
      select jsonb_agg(jsonb_build_object('category', category, 'cents', cents) order by cents desc)
      from (select category, sum(amount_cents) as cents from public.finance_movements
            where kind = 'gasto' and day >= v_month and day < v_next group by category) c
    ), '[]'::jsonb),
    'budgets', coalesce((
      select jsonb_agg(jsonb_build_object(
        'area', a.id, 'area_name', a.name, 'monthly', b.monthly_cents,
        'spent', (select coalesce(sum(amount_cents), 0) from public.finance_movements
                  where kind = 'gasto' and area = a.id and day >= v_month and day < v_next)
      ) order by a.sort)
      from public.areas a
      left join public.finance_budgets b on b.area = a.id
    ), '[]'::jsonb)
  );
end;
$$;

-- Saldo del mes (para «Mi equipo» y el Inicio de Directivo y de Finanzas).
create or replace function public.cesi_finance_month_balance(p_as uuid default null)
returns table (income bigint, expense bigint, balance bigint)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_me uuid := public.cesi_finance_viewer(p_as);
  v_month date := date_trunc('month', (now() at time zone public.cesi_zone_of(v_me))::date)::date;
  v_next date := (v_month + interval '1 month')::date;
begin
  return query
    select
      coalesce(sum(m.amount_cents) filter (where m.kind = 'ingreso'), 0)::bigint,
      coalesce(sum(m.amount_cents) filter (where m.kind = 'gasto'), 0)::bigint,
      coalesce(sum(case when m.kind = 'ingreso' then m.amount_cents else -m.amount_cents end), 0)::bigint
    from public.finance_movements m
    where m.day >= v_month and m.day < v_next;
end;
$$;

-- Historial de cambios (los 200 más recientes).
create or replace function public.cesi_finance_log(p_as uuid default null)
returns table (id bigint, at timestamptz, who_name text, action text, movement_id uuid, area text, before jsonb, after jsonb)
language plpgsql
stable
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  v_me uuid := public.cesi_finance_viewer(p_as);
begin
  return query
    select l.id, l.at, l.who_name, l.action, l.movement_id, l.area, l.before, l.after
    from public.finance_log l
    order by l.at desc, l.id desc
    limit 200;
end;
$$;

-- Contactos externos con seguimiento de alianza (para unir un ingreso): solo el id y el nombre.
create or replace function public.cesi_finance_contacts()
returns table (id text, name text)
language plpgsql
stable
security definer
set search_path = ''
as $$
#variable_conflict use_column
begin
  perform public.cesi_finance_writer();
  return query
    select c.id, coalesce(nullif(trim(c.data ->> 'name'), ''), 'Sin nombre')
    from public.contacts c
    where c.user_id in (select id from public.profiles where role = 'ceo') and c.deleted_at is null
      and jsonb_typeof(c.data -> 'alliance') = 'object' and public.cesi_is_external_contact(c.data)
    order by 2;
end;
$$;

-- -----------------------------------------------------------------------------
-- Escribir
-- -----------------------------------------------------------------------------

-- El movimiento como se guarda en el historial.
create or replace function public.cesi_finance_row(m public.finance_movements)
returns jsonb
language sql
immutable
set search_path = ''
as $$
  select jsonb_build_object('kind', m.kind, 'day', m.day, 'concept', m.concept, 'amount_cents', m.amount_cents,
    'category', m.category, 'area', m.area, 'method', m.method, 'receipt_url', m.receipt_url, 'notes', m.notes,
    'contact_name', m.contact_name);
$$;

revoke all on function public.cesi_finance_row(public.finance_movements) from public, anon, authenticated;

-- Crear (p_id null) o editar un movimiento (Finanzas y la ceo). p_contact: contacto externo de
-- Alianzas (solo en ingresos). Devuelve el id.
create or replace function public.cesi_finance_save(
  p_id uuid, p_kind text, p_day date, p_concept text, p_amount_cents bigint, p_category text, p_area text,
  p_method text, p_receipt_url text, p_notes text, p_contact text
)
returns uuid
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_me uuid := public.cesi_finance_writer();
  v_id uuid := p_id;
  v_old public.finance_movements;
  v_new public.finance_movements;
  v_contact text := nullif(p_contact, '');
  v_contact_name text := '';
begin
  if coalesce(p_kind, '') not in ('ingreso', 'gasto') then
    raise exception 'Elige si es un ingreso o un gasto.' using errcode = '22023';
  end if;
  if p_day is null then
    raise exception 'Pon la fecha.' using errcode = '22023';
  end if;
  if not ((p_kind = 'ingreso' and coalesce(p_category, '') in ('patrocinio', 'donacion', 'colaboracion', 'otro'))
       or (p_kind = 'gasto' and coalesce(p_category, '') in ('dominio_web', 'herramientas', 'premios', 'publicidad', 'material', 'otro'))) then
    raise exception 'Elige una categoría de %.', p_kind using errcode = '22023';
  end if;
  if coalesce(p_method, '') not in ('', 'transferencia', 'paypal', 'tarjeta', 'efectivo', 'otro') then
    raise exception 'Método no válido.' using errcode = '22023';
  end if;
  if length(trim(coalesce(p_concept, ''))) = 0 or length(trim(p_concept)) > 200 then
    raise exception 'Escribe el concepto (como mucho 200 caracteres).' using errcode = '22023';
  end if;
  if p_amount_cents is null or p_amount_cents <= 0 or p_amount_cents > 100000000000 then
    raise exception 'Pon una cantidad mayor que 0.' using errcode = '22023';
  end if;
  if p_area is not null and not exists (select 1 from public.areas where id = p_area) then
    raise exception 'Esa área no existe.' using errcode = '22023';
  end if;
  if coalesce(p_receipt_url, '') <> '' and p_receipt_url !~* '^https?://\S+$' then
    raise exception 'El justificante tiene que ser un enlace que empiece por https://' using errcode = '22023';
  end if;
  if v_contact is not null then
    if p_kind <> 'ingreso' then
      raise exception 'Solo un ingreso puede venir de una alianza.' using errcode = '22023';
    end if;
    select coalesce(nullif(trim(c.data ->> 'name'), ''), 'Sin nombre') into v_contact_name
    from public.contacts c
    where c.id = v_contact and c.deleted_at is null and c.user_id in (select id from public.profiles where role = 'ceo')
      and public.cesi_is_external_contact(c.data);
    if v_contact_name is null then
      raise exception 'Ese contacto externo ya no existe.' using errcode = '22023';
    end if;
  end if;

  if v_id is null then
    insert into public.finance_movements (kind, day, concept, amount_cents, category, area, method, receipt_url, notes,
      contact_id, contact_name, created_by, updated_by)
    values (p_kind, p_day, trim(p_concept), p_amount_cents, p_category, p_area, coalesce(nullif(p_method, ''), 'transferencia'),
      trim(coalesce(p_receipt_url, '')), trim(coalesce(p_notes, '')), v_contact, coalesce(v_contact_name, ''), v_me, v_me)
    returning * into v_new;
    insert into public.finance_log (who, who_name, action, movement_id, area, before, after)
    values (v_me, public.cesi_person_name(v_me), 'alta', v_new.id, v_new.area, null, public.cesi_finance_row(v_new));
    return v_new.id;
  end if;

  select * into v_old from public.finance_movements where id = v_id for update;
  if not found then
    raise exception 'Ese movimiento ya no existe.' using errcode = '22023';
  end if;
  update public.finance_movements
  set kind = p_kind, day = p_day, concept = trim(p_concept), amount_cents = p_amount_cents, category = p_category,
      area = p_area, method = coalesce(nullif(p_method, ''), 'transferencia'), receipt_url = trim(coalesce(p_receipt_url, '')),
      notes = trim(coalesce(p_notes, '')), contact_id = v_contact, contact_name = coalesce(v_contact_name, ''),
      updated_by = v_me, updated_at = now()
  where id = v_id
  returning * into v_new;
  insert into public.finance_log (who, who_name, action, movement_id, area, before, after)
  values (v_me, public.cesi_person_name(v_me), 'edicion', v_id, v_new.area, public.cesi_finance_row(v_old), public.cesi_finance_row(v_new));
  return v_id;
end;
$$;

-- Borrar un movimiento (Finanzas y la ceo). Queda en el historial.
create or replace function public.cesi_finance_delete(p_id uuid)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_me uuid := public.cesi_finance_writer();
  v_old public.finance_movements;
begin
  delete from public.finance_movements where id = p_id returning * into v_old;
  if not found then
    raise exception 'Ese movimiento ya no existe.' using errcode = '22023';
  end if;
  insert into public.finance_log (who, who_name, action, movement_id, area, before, after)
  values (v_me, public.cesi_person_name(v_me), 'borrado', p_id, v_old.area, public.cesi_finance_row(v_old), null);
end;
$$;

-- Presupuesto mensual de un área (Finanzas y la ceo). p_monthly_cents null: sin presupuesto.
create or replace function public.cesi_finance_budget_set(p_area text, p_monthly_cents bigint)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_me uuid := public.cesi_finance_writer();
  v_old bigint;
begin
  if p_area is null or not exists (select 1 from public.areas where id = p_area) then
    raise exception 'Esa área no existe.' using errcode = '22023';
  end if;
  if p_monthly_cents is not null and (p_monthly_cents < 0 or p_monthly_cents > 100000000000) then
    raise exception 'Presupuesto no válido.' using errcode = '22023';
  end if;
  select monthly_cents into v_old from public.finance_budgets where area = p_area;
  if p_monthly_cents is null then
    delete from public.finance_budgets where area = p_area;
  else
    insert into public.finance_budgets (area, monthly_cents, updated_by, updated_at)
    values (p_area, p_monthly_cents, v_me, now())
    on conflict (area) do update set monthly_cents = excluded.monthly_cents, updated_by = excluded.updated_by, updated_at = now();
  end if;
  insert into public.finance_log (who, who_name, action, area, before, after)
  values (v_me, public.cesi_person_name(v_me), 'presupuesto', p_area,
    case when v_old is null then null else jsonb_build_object('monthly_cents', v_old) end,
    case when p_monthly_cents is null then null else jsonb_build_object('monthly_cents', p_monthly_cents) end);
end;
$$;

-- -----------------------------------------------------------------------------
-- Permisos de las funciones
-- -----------------------------------------------------------------------------
revoke all on function public.cesi_finance_movements(uuid) from public, anon;
revoke all on function public.cesi_finance_summary(date, uuid) from public, anon;
revoke all on function public.cesi_finance_month_balance(uuid) from public, anon;
revoke all on function public.cesi_finance_log(uuid) from public, anon;
revoke all on function public.cesi_finance_contacts() from public, anon;
revoke all on function public.cesi_finance_save(uuid, text, date, text, bigint, text, text, text, text, text, text) from public, anon;
revoke all on function public.cesi_finance_delete(uuid) from public, anon;
revoke all on function public.cesi_finance_budget_set(text, bigint) from public, anon;
grant execute on function public.cesi_finance_movements(uuid) to authenticated;
grant execute on function public.cesi_finance_summary(date, uuid) to authenticated;
grant execute on function public.cesi_finance_month_balance(uuid) to authenticated;
grant execute on function public.cesi_finance_log(uuid) to authenticated;
grant execute on function public.cesi_finance_contacts() to authenticated;
grant execute on function public.cesi_finance_save(uuid, text, date, text, bigint, text, text, text, text, text, text) to authenticated;
grant execute on function public.cesi_finance_delete(uuid) to authenticated;
grant execute on function public.cesi_finance_budget_set(text, bigint) to authenticated;

-- ---------------------------------------------------------------------------
-- Parte 20: editar según permisos (RRHH y Directivo)
-- ---------------------------------------------------------------------------
-- -----------------------------------------------------------------------------
-- Permisos: RRHH puede editar Equipo y Vacantes
-- -----------------------------------------------------------------------------
insert into public.area_permissions (area, screen, level) values
  ('personas', 'equipo', 'write'),
  ('personas', 'vacantes', 'write')
on conflict (area, screen) do update set level = excluded.level;

-- -----------------------------------------------------------------------------
-- Registro de cambios
-- -----------------------------------------------------------------------------
--   doc_table  'contacts' | 'vacancies' | 'courses' | 'students' | 'extra_classes'
--   action     'alta' | 'edicion'
--   before / after  solo los campos que cambiaron
create table if not exists public.team_edit_log (
  id bigint generated always as identity primary key,
  at timestamptz not null default now(),
  who uuid references public.profiles (id) on delete set null,
  who_name text not null default '',
  who_area text,
  doc_table text not null,
  doc_id text not null,
  doc_name text not null default '',
  action text not null,
  before jsonb,
  after jsonb
);
create index if not exists team_edit_log_at_idx on public.team_edit_log (at desc);

alter table public.team_edit_log enable row level security;
drop policy if exists "team_edit_log: leer (la ceo)" on public.team_edit_log;
create policy "team_edit_log: leer (la ceo)" on public.team_edit_log
  for select to authenticated using (public.is_ceo());
revoke all on public.team_edit_log from anon, authenticated;
grant select on public.team_edit_log to authenticated;

-- -----------------------------------------------------------------------------
-- Lo que necesita una pantalla (como en la parte 16; los alumnos, según el permiso de Alumnos)
-- -----------------------------------------------------------------------------
-- Con «Editar» en Cursos pero no en Alumnos (Directivo), los alumnos llegan como con «Ver»: sin
-- email, teléfono, cumpleaños, notas ni Discord (sí su disponibilidad y su zona horaria, para
-- organizar horarios).
create or replace function public.cesi_screen_data(p_screen text, p_as uuid default null, p_area text default null)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_me uuid := (select auth.uid());
  v_who uuid := v_me;
  v_level text;
  v_full boolean;
  v_teacher boolean;
  v_alliance text;
  v_students_full boolean;
  v_out jsonb;
begin
  if p_as is not null and p_as <> v_who then
    if not public.is_ceo() then
      raise exception 'Sin permiso.' using errcode = '42501';
    end if;
    v_who := p_as;
  end if;
  if p_screen is null or p_screen not in ('contactos', 'equipo', 'vacantes', 'cursos', 'alumnos', 'asistencia') then
    raise exception 'Pantalla no válida.' using errcode = '22023';
  end if;
  if p_area is not null then
    -- «Ver como» un área (solo la ceo): sus permisos.
    if not public.is_ceo() then
      raise exception 'Sin permiso.' using errcode = '42501';
    end if;
    v_level := coalesce((select ap.level from public.area_permissions ap where ap.area = p_area and ap.screen = p_screen), 'none');
    v_teacher := p_area = 'formacion';
    v_alliance := case when p_area = 'alianzas' then 'edit' when p_area = 'direccion' then 'view' end;
  else
    v_level := public.cesi_level_for(v_who, p_screen);
    v_teacher := public.cesi_is_teacher_only(v_who);
    v_alliance := public.cesi_alliance_role(v_who);
  end if;
  if v_level not in ('read', 'write') then
    raise exception 'No tienes acceso a esta pantalla.' using errcode = '42501';
  end if;
  v_full := v_level = 'write';
  -- Los alumnos, con su propio permiso (Alumnos): con «Editar» en Cursos no llegan completos.
  v_students_full := case when p_screen = 'alumnos' then v_full
    when p_area is not null then coalesce((select ap.level from public.area_permissions ap where ap.area = p_area and ap.screen = 'alumnos'), 'none') = 'write'
    else public.cesi_level_for(v_who, 'alumnos') = 'write' end;

  with
  ceo as (select id from public.profiles where role = 'ceo'),
  -- Cursos del profesor (ninguno en «Ver como» un área sin persona).
  my_courses as (
    select c.id from public.cesi_teacher_courses(case when p_area is null then v_who end) as c (id)
  ),
  -- Contactos (con «Ver», sin email, teléfono, notas ni foto; sin CV de equipo).
  c_all as (
    select case when v_full then c0.data
      else (c0.data - 'email' - 'phone' - 'notes' - 'photo') #- '{teamProfile,cv}' end as data
    from (select case when v_alliance is null then c.data - 'alliance' else c.data end as data, c.user_id, c.deleted_at from public.contacts c) c0
    where c0.user_id in (select id from ceo) and c0.deleted_at is null
  ),
  c_flags as (
    select data,
      (data ? 'teamProfile' and jsonb_typeof(data -> 'teamProfile') = 'object') as team,
      (data ? 'teamProfile' and jsonb_typeof(data -> 'teamProfile') = 'object'
        and coalesce(data -> 'teamProfile' ->> 'status', 'active') <> 'former'
        and not coalesce((data ->> 'archived')::boolean, false)) as active,
      (coalesce((data ->> 'candidateOnly')::boolean, false) and not (data ? 'teamProfile' and jsonb_typeof(data -> 'teamProfile') = 'object')) as candidate_only,
      (jsonb_typeof(data -> 'candidacies') = 'array' and jsonb_array_length(data -> 'candidacies') > 0) as candidate,
      public.cesi_is_external_contact(data) as external
    from c_all
  ),
  -- Candidaturas: con «Ver», sin CV ni notas.
  c_cand as (
    select case when v_full then data
      else jsonb_set(data, '{candidacies}', coalesce((
        select jsonb_agg(x - 'cv' - 'notes') from jsonb_array_elements(data -> 'candidacies') as x
      ), '[]'::jsonb)) end as data
    from c_flags
    where candidate
  ),
  -- Profesores (para los cursos): solo lo que hace falta para nombrarlos y su disponibilidad.
  c_teachers as (
    select jsonb_build_object(
      'id', data ->> 'id', 'name', data ->> 'name', 'country', data -> 'country', 'timeZone', data -> 'timeZone',
      'availability', data -> 'availability',
      'teamProfile', jsonb_build_object('status', data -> 'teamProfile' -> 'status', 'area', data -> 'teamProfile' -> 'area',
        'role', data -> 'teamProfile' -> 'role', 'roles', data -> 'teamProfile' -> 'roles')
    ) as data
    from c_flags
    where team
  ),
  courses as (
    select co.data from public.courses co
    where co.user_id in (select id from ceo) and co.deleted_at is null
      and (not v_teacher or co.id in (select id from my_courses))
  ),
  -- Alumnos (con «Ver», sin email, teléfono, cumpleaños, notas ni Discord). Al profesor, solo los
  -- de sus cursos y, en courseIds, solo esos cursos.
  s_rows as (
    select case when v_students_full then s.data else s.data - 'email' - 'phone' - 'birthday' - 'notes' - 'discord' end as data
    from public.students s
    where s.user_id in (select id from ceo) and s.deleted_at is null
      and (not v_teacher or (
        jsonb_typeof(s.data -> 'courseIds') = 'array'
        and exists (select 1 from jsonb_array_elements_text(s.data -> 'courseIds') x where x in (select id from my_courses))
      ))
  ),
  s_all as (
    select case when v_teacher then jsonb_set(data, '{courseIds}', coalesce((
        select jsonb_agg(x) from jsonb_array_elements_text(data -> 'courseIds') x where x in (select id from my_courses)
      ), '[]'::jsonb)) else data end as data
    from s_rows
  )
  select jsonb_build_object(
    'level', v_level,
    'teacher', v_teacher,
    'canMark', v_teacher and p_area is null and v_who = v_me,
    'alliance', v_alliance is not null,
    'allianceEdit', coalesce(v_alliance = 'edit', false) and p_area is null and v_who = v_me and not public.is_ceo(),
    'contacts', case p_screen
      -- external: contacto externo (lo puede editar Alianzas).
      when 'contactos' then coalesce((select jsonb_agg((data - 'candidacies' - 'candidateOnly') || jsonb_build_object('external', external)) from c_flags where not active and not candidate_only), '[]'::jsonb)
      when 'equipo' then coalesce((select jsonb_agg(data - 'candidacies' - 'candidateOnly') from c_flags where team), '[]'::jsonb)
      when 'vacantes' then coalesce((select jsonb_agg(data) from c_cand), '[]'::jsonb)
      else coalesce((select jsonb_agg(data) from c_teachers), '[]'::jsonb)
    end,
    'groups', case when p_screen in ('contactos', 'equipo') then coalesce((
        select jsonb_agg(g.data) from public.groups g where g.user_id in (select id from ceo) and g.deleted_at is null
      ), '[]'::jsonb) else '[]'::jsonb end,
    'vacancies', case when p_screen = 'vacantes' then coalesce((
        select jsonb_agg(v.data) from public.vacancies v where v.user_id in (select id from ceo) and v.deleted_at is null
      ), '[]'::jsonb) else '[]'::jsonb end,
    'courses', case when p_screen in ('cursos', 'alumnos', 'asistencia') then coalesce((select jsonb_agg(data) from courses), '[]'::jsonb) else '[]'::jsonb end,
    'students', case when p_screen in ('cursos', 'alumnos', 'asistencia') then coalesce((select jsonb_agg(data) from s_all), '[]'::jsonb) else '[]'::jsonb end,
    'attendance', case when p_screen in ('cursos', 'alumnos', 'asistencia') then coalesce((
        select jsonb_agg(a.data) from public.attendance a
        where a.user_id in (select id from ceo) and a.deleted_at is null
          and (not v_teacher or a.data ->> 'courseId' in (select id from my_courses))
      ), '[]'::jsonb) else '[]'::jsonb end,
    'extraClasses', case when p_screen in ('cursos', 'alumnos', 'asistencia') then coalesce((
        select jsonb_agg(x.data) from public.extra_classes x
        where x.user_id in (select id from ceo) and x.deleted_at is null
          and (not v_teacher or x.data ->> 'courseId' in (select id from my_courses))
      ), '[]'::jsonb) else '[]'::jsonb end
  ) into v_out;
  return v_out;
end;
$$;

-- -----------------------------------------------------------------------------
-- Escribir en los datos de la ceo
-- -----------------------------------------------------------------------------
-- p_table: 'contacts' | 'vacancies' | 'courses' | 'students' | 'extra_classes'
-- p_id: el id del documento (al crear, el que ha generado la app).
-- p_patch: los campos que cambian ({ campo: valor nuevo }; null para quitarlo).
-- p_before: cómo estaban esos campos al abrir la ficha (para no pisar un cambio de otro).
-- p_create: crear el documento (si ya existe, error).
-- Quién puede qué:
--   RRHH          contacts (fichas de equipo y candidatos: ni fotos, ni alianzas; crear solo un
--                 candidato) y vacancies (crear y editar)
--   Directivo     courses (crear y editar), students (solo courseIds) y extra_classes (crear)
-- Nadie borra con esta función. Devuelve el documento guardado.
create or replace function public.cesi_ceo_doc_patch(p_table text, p_id text, p_patch jsonb, p_before jsonb, p_create boolean default false)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_me uuid := (select auth.uid());
  v_area text;
  v_ceo uuid;
  v_old jsonb;
  v_stamp_old timestamptz;
  v_new jsonb;
  v_stamp timestamptz;
  v_key text;
  v_changed jsonb := '{}'::jsonb;
  v_was jsonb := '{}'::jsonb;
  v_patch jsonb := coalesce(p_patch, '{}'::jsonb);
  v_before jsonb := coalesce(p_before, '{}'::jsonb);
  v_rrhh boolean;
  v_dir boolean;
begin
  select area into v_area from public.profiles where id = v_me and role = 'equipo';
  v_rrhh := v_area = 'personas';
  v_dir := v_area = 'direccion';
  if p_table is null or p_table not in ('contacts', 'vacancies', 'courses', 'students', 'extra_classes') then
    raise exception 'Tabla no válida.' using errcode = '22023';
  end if;
  if not coalesce(case p_table
      when 'contacts' then v_rrhh
      when 'vacancies' then v_rrhh
      else v_dir
    end, false) then
    raise exception 'No tienes permiso para cambiar estos datos.' using errcode = '42501';
  end if;
  if p_id is null or length(p_id) not between 1 and 200 or jsonb_typeof(v_patch) <> 'object' or v_patch = '{}'::jsonb then
    raise exception 'Cambio no válido.' using errcode = '22023';
  end if;
  if v_patch ?| array['id', 'createdAt', 'updatedAt'] then
    raise exception 'Cambio no válido.' using errcode = '22023';
  end if;

  -- Qué campos puede tocar cada uno.
  if p_table = 'contacts' and v_patch ?| array['photo', 'alliance', 'external'] then
    raise exception 'RRHH no puede cambiar la foto ni la alianza de un contacto.' using errcode = '42501';
  end if;
  if p_table = 'students' and (select count(*) from jsonb_object_keys(v_patch) k where k <> 'courseIds') > 0 then
    raise exception 'De los alumnos solo se pueden cambiar sus cursos.' using errcode = '42501';
  end if;
  if p_table = 'students' and p_create then
    raise exception 'Directivo no puede crear alumnos.' using errcode = '42501';
  end if;
  if p_table = 'extra_classes' and not p_create then
    raise exception 'Directivo solo puede crear clases sueltas.' using errcode = '42501';
  end if;

  select id into v_ceo from public.profiles where role = 'ceo' order by created_at limit 1;
  if v_ceo is null then
    raise exception 'No hay cuenta de la dirección.' using errcode = '22023';
  end if;
  execute format('select data, updated_at from public.%I where user_id = $1 and id = $2 and deleted_at is null for update', p_table)
    into v_old, v_stamp_old using v_ceo, p_id;

  if p_create then
    if v_old is not null then
      raise exception 'Ya existe.' using errcode = '22023';
    end if;
    v_old := jsonb_build_object('createdAt', public.cesi_iso(clock_timestamp()));
  elsif v_old is null then
    raise exception 'Esa ficha ya no existe.' using errcode = '22023';
  else
    -- Si alguno de los campos ya no está como estaba al abrir la ficha, no se guarda nada.
    for v_key in select jsonb_object_keys(v_patch) loop
      if coalesce(v_old -> v_key, 'null'::jsonb) is distinct from coalesce(v_before -> v_key, 'null'::jsonb) then
        raise exception 'Esta ficha ha cambiado mientras la editabas; vuelve a cargarla.' using errcode = '40001';
      end if;
    end loop;
  end if;

  -- Contactos (RRHH): solo fichas de equipo o de candidatos (antes y después).
  if p_table = 'contacts' then
    if not p_create and not (
      (jsonb_typeof(v_old -> 'teamProfile') = 'object')
      or (jsonb_typeof(v_old -> 'candidacies') = 'array' and jsonb_array_length(v_old -> 'candidacies') > 0)
    ) then
      raise exception 'RRHH solo puede cambiar fichas de equipo y de candidatos.' using errcode = '42501';
    end if;
    if p_create and not (jsonb_typeof(v_patch -> 'candidacies') = 'array' and jsonb_array_length(v_patch -> 'candidacies') > 0) then
      raise exception 'RRHH solo puede crear candidatos.' using errcode = '42501';
    end if;
  end if;
  -- Clase suelta: de un curso que existe.
  if p_table = 'extra_classes' and not exists (
    select 1 from public.courses co where co.user_id = v_ceo and co.id = v_patch ->> 'courseId' and co.deleted_at is null
  ) then
    raise exception 'Ese curso no existe.' using errcode = '22023';
  end if;
  -- Inscripciones: solo en cursos que existen.
  if p_table = 'students' and jsonb_typeof(v_patch -> 'courseIds') <> 'array' then
    raise exception 'Cursos no válidos.' using errcode = '22023';
  end if;
  if p_table = 'students' and exists (
    select 1 from jsonb_array_elements_text(v_patch -> 'courseIds') x
    where not exists (select 1 from public.courses co where co.user_id = v_ceo and co.id = x and co.deleted_at is null)
      and not ((v_old -> 'courseIds') ? x)
  ) then
    raise exception 'Alguno de esos cursos no existe.' using errcode = '22023';
  end if;

  -- Los campos que de verdad cambian (para el registro).
  for v_key in select jsonb_object_keys(v_patch) loop
    if coalesce(v_old -> v_key, 'null'::jsonb) is distinct from (v_patch -> v_key) then
      v_changed := v_changed || jsonb_build_object(v_key, v_patch -> v_key);
      v_was := v_was || jsonb_build_object(v_key, coalesce(v_old -> v_key, 'null'::jsonb));
    end if;
  end loop;
  if v_changed = '{}'::jsonb and not p_create then
    return v_old;
  end if;

  v_stamp := greatest(clock_timestamp(), coalesce(v_stamp_old + interval '1 millisecond', '-infinity'));
  v_new := v_old || v_patch || jsonb_build_object('id', p_id, 'updatedAt', public.cesi_iso(v_stamp));
  execute format(
    'insert into public.%I (user_id, id, data, updated_at, deleted_at) values ($1, $2, $3, $4, null)
     on conflict (user_id, id) do update set data = excluded.data, updated_at = excluded.updated_at, deleted_at = null',
    p_table) using v_ceo, p_id, v_new, v_stamp;

  insert into public.team_edit_log (who, who_name, who_area, doc_table, doc_id, doc_name, action, before, after)
  values (v_me, public.cesi_person_name(v_me), v_area, p_table, p_id,
    left(coalesce(nullif(v_new ->> 'name', ''), nullif(v_new ->> 'title', ''), nullif(v_new ->> 'note', ''), ''), 200),
    case when p_create then 'alta' else 'edicion' end,
    case when p_create then null else v_was end, v_changed);
  return v_new;
end;
$$;

-- Registro de cambios de RRHH y Directivo en los datos de la ceo (solo la ceo), los más nuevos
-- primero.
create or replace function public.cesi_team_edit_log(p_limit integer default 300)
returns table (
  id bigint, at timestamptz, who_name text, who_area text, doc_table text, doc_id text, doc_name text,
  action text, before jsonb, after jsonb
)
language plpgsql
stable
security definer
set search_path = ''
as $$
#variable_conflict use_column
begin
  if not public.is_ceo() then
    raise exception 'Solo la dirección ve el registro de cambios.' using errcode = '42501';
  end if;
  return query
    select l.id, l.at, l.who_name, l.who_area, l.doc_table, l.doc_id, l.doc_name, l.action, l.before, l.after
    from public.team_edit_log l
    order by l.at desc, l.id desc
    limit least(greatest(coalesce(p_limit, 300), 1), 1000);
end;
$$;

-- -----------------------------------------------------------------------------
-- Permisos de las funciones
-- -----------------------------------------------------------------------------
revoke all on function public.cesi_screen_data(text, uuid, text) from public, anon;
revoke all on function public.cesi_ceo_doc_patch(text, text, jsonb, jsonb, boolean) from public, anon;
revoke all on function public.cesi_team_edit_log(integer) from public, anon;
grant execute on function public.cesi_screen_data(text, uuid, text) to authenticated;
grant execute on function public.cesi_ceo_doc_patch(text, text, jsonb, jsonb, boolean) to authenticated;
grant execute on function public.cesi_team_edit_log(integer) to authenticated;

-- ---------------------------------------------------------------------------
-- Parte 21: mensajes del equipo
-- ---------------------------------------------------------------------------
-- -----------------------------------------------------------------------------
-- Tablas
-- -----------------------------------------------------------------------------
--   pair_key  en las privadas, los dos ids ordenados ('a:b'), para no repetir la conversación
create table if not exists public.chat_conversations (
  id uuid primary key default gen_random_uuid(),
  kind text not null check (kind in ('private', 'area', 'team')),
  area text references public.areas (id) on update cascade on delete cascade,
  pair_key text,
  created_at timestamptz not null default now(),
  last_message_at timestamptz,
  constraint chat_conversations_kind check (
    (kind = 'private' and pair_key is not null and area is null)
    or (kind = 'area' and area is not null and pair_key is null)
    or (kind = 'team' and area is null and pair_key is null)
  )
);
create unique index if not exists chat_conversations_area_idx on public.chat_conversations (area) where kind = 'area';
create unique index if not exists chat_conversations_pair_idx on public.chat_conversations (pair_key) where kind = 'private';
create unique index if not exists chat_conversations_team_idx on public.chat_conversations (kind) where kind = 'team';

create table if not exists public.chat_members (
  conversation_id uuid not null references public.chat_conversations (id) on delete cascade,
  profile_id uuid not null references public.profiles (id) on delete cascade,
  primary key (conversation_id, profile_id)
);
create index if not exists chat_members_profile_idx on public.chat_members (profile_id);

create table if not exists public.chat_messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.chat_conversations (id) on delete cascade,
  author_id uuid references public.profiles (id) on delete set null,
  author_gone_name text not null default '',
  body text not null default '' check (length(body) <= 4000),
  created_at timestamptz not null default now(),
  edited_at timestamptz,
  deleted_at timestamptz
);
create index if not exists chat_messages_conv_idx on public.chat_messages (conversation_id, created_at desc);

create table if not exists public.chat_reads (
  conversation_id uuid not null references public.chat_conversations (id) on delete cascade,
  profile_id uuid not null references public.profiles (id) on delete cascade,
  last_read_at timestamptz not null default now(),
  primary key (conversation_id, profile_id)
);

-- Las de área y «Todo el equipo».
insert into public.chat_conversations (kind) select 'team'
where not exists (select 1 from public.chat_conversations where kind = 'team');
insert into public.chat_conversations (kind, area)
select 'area', a.id from public.areas a
where not exists (select 1 from public.chat_conversations c where c.kind = 'area' and c.area = a.id);

create or replace function public.cesi_chat_area_created()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.chat_conversations (kind, area) values ('area', new.id)
  on conflict do nothing;
  return new;
end;
$$;

revoke all on function public.cesi_chat_area_created() from public, anon, authenticated;

drop trigger if exists areas_chat_created on public.areas;
create trigger areas_chat_created
  after insert on public.areas
  for each row execute function public.cesi_chat_area_created();

-- -----------------------------------------------------------------------------
-- Quién ve qué
-- -----------------------------------------------------------------------------
-- ¿Puede `p_me` leer (y escribir en) esa conversación?
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
        when 'area' then p.role = 'ceo' or p.area = 'direccion' or p.area = c.area
        else exists (select 1 from public.chat_members m where m.conversation_id = c.id and m.profile_id = p_me)
      end
  );
$$;

-- La usan las reglas de acceso de abajo (con la cuenta que lee): tiene que poder ejecutarse.
revoke all on function public.cesi_chat_can(uuid, uuid) from public, anon;
grant execute on function public.cesi_chat_can(uuid, uuid) to authenticated;

alter table public.chat_conversations enable row level security;
alter table public.chat_members enable row level security;
alter table public.chat_messages enable row level security;
alter table public.chat_reads enable row level security;

drop policy if exists "chat_conversations: las mías" on public.chat_conversations;
create policy "chat_conversations: las mías" on public.chat_conversations
  for select to authenticated using (public.cesi_chat_can((select auth.uid()), id));

drop policy if exists "chat_members: de mis conversaciones" on public.chat_members;
create policy "chat_members: de mis conversaciones" on public.chat_members
  for select to authenticated using (public.cesi_chat_can((select auth.uid()), conversation_id));

drop policy if exists "chat_messages: de mis conversaciones" on public.chat_messages;
create policy "chat_messages: de mis conversaciones" on public.chat_messages
  for select to authenticated using (public.cesi_chat_can((select auth.uid()), conversation_id));

drop policy if exists "chat_reads: de mis conversaciones" on public.chat_reads;
create policy "chat_reads: de mis conversaciones" on public.chat_reads
  for select to authenticated using (public.cesi_chat_can((select auth.uid()), conversation_id));

revoke all on public.chat_conversations, public.chat_members, public.chat_messages, public.chat_reads from anon;
revoke all on public.chat_conversations, public.chat_members, public.chat_messages, public.chat_reads from authenticated;
grant select on public.chat_conversations, public.chat_members, public.chat_messages, public.chat_reads to authenticated;

-- Realtime: los mensajes y las lecturas llegan solos (cada uno, solo los que puede ver).
do $$
declare
  t text;
begin
  foreach t in array array['chat_messages', 'chat_reads'] loop
    begin
      execute format('alter publication supabase_realtime add table public.%I', t);
    exception
      when duplicate_object then null;
      when undefined_object then null;
    end;
  end loop;
end;
$$;

-- -----------------------------------------------------------------------------
-- Ayudas
-- -----------------------------------------------------------------------------

-- La cuenta actual, si es de equipo o la ceo (si no, error). Nunca otra («Ver como» no vale aquí).
create or replace function public.cesi_chat_me()
returns uuid
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_me uuid := (select auth.uid());
begin
  if not exists (select 1 from public.profiles where id = v_me and role in ('ceo', 'equipo')) then
    raise exception 'Los mensajes son solo para el equipo.' using errcode = '42501';
  end if;
  return v_me;
end;
$$;

-- Desde cuándo cuentan los no leídos de alguien que aún no ha abierto la conversación: desde que
-- entró en el equipo (para no tener todo el historial sin leer).
create or replace function public.cesi_chat_since(p_me uuid)
returns timestamptz
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((select coalesce(role_set_at, created_at) from public.profiles where id = p_me), now());
$$;

revoke all on function public.cesi_chat_me() from public, anon, authenticated;
revoke all on function public.cesi_chat_since(uuid) from public, anon, authenticated;

-- -----------------------------------------------------------------------------
-- Leer
-- -----------------------------------------------------------------------------

-- Mis conversaciones, con la más reciente primero.
--   title        el área, «Todo el equipo» o la otra persona
--   other_id     en las privadas, la otra persona; other_read_at: hasta cuándo ha leído («visto»)
--   last_body    la última línea ('' si se borró: last_deleted), last_at, last_author_name
--   unread       mensajes de otros sin leer
create or replace function public.cesi_chat_list()
returns table (
  id uuid, kind text, area text, title text, other_id uuid, other_read_at timestamptz,
  last_body text, last_deleted boolean, last_at timestamptz, last_author_id uuid, last_author_name text,
  unread integer, my_read_at timestamptz
)
language plpgsql
stable
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  v_me uuid := public.cesi_chat_me();
  v_since timestamptz := public.cesi_chat_since(v_me);
begin
  return query
    select c.id, c.kind, c.area,
      case c.kind when 'team' then 'Todo el equipo' when 'area' then coalesce(a.name, c.area)
        else coalesce(public.cesi_name_or_gone(o.profile_id, null), 'Cuenta eliminada') end,
      o.profile_id,
      (select r.last_read_at from public.chat_reads r where r.conversation_id = c.id and r.profile_id = o.profile_id),
      case when lm.deleted_at is null then left(coalesce(lm.body, ''), 200) else '' end,
      lm.deleted_at is not null,
      lm.created_at, lm.author_id,
      case when lm.id is null then '' else public.cesi_name_or_gone(lm.author_id, lm.author_gone_name) end,
      (select count(*)::integer from public.chat_messages m
        where m.conversation_id = c.id and m.deleted_at is null and m.author_id is distinct from v_me
          and m.created_at > coalesce(mr.last_read_at, v_since)),
      mr.last_read_at
    from public.chat_conversations c
    left join public.areas a on a.id = c.area
    left join lateral (
      select m.profile_id from public.chat_members m where m.conversation_id = c.id and m.profile_id <> v_me limit 1
    ) o on c.kind = 'private'
    left join public.chat_reads mr on mr.conversation_id = c.id and mr.profile_id = v_me
    left join lateral (
      select m.id, m.body, m.created_at, m.author_id, m.author_gone_name, m.deleted_at
      from public.chat_messages m where m.conversation_id = c.id
      order by m.created_at desc limit 1
    ) lm on true
    where public.cesi_chat_can(v_me, c.id)
    order by coalesce(lm.created_at, c.created_at) desc, c.kind, a.sort nulls last;
end;
$$;

-- Mensajes de una conversación (los más recientes; p_before: los anteriores a esa hora), del más
-- antiguo al más nuevo. mine: los míos (se pueden editar y borrar).
create or replace function public.cesi_chat_messages(p_conversation uuid, p_before timestamptz default null, p_limit integer default 100)
returns table (
  id uuid, conversation_id uuid, author_id uuid, author_name text, body text,
  created_at timestamptz, edited_at timestamptz, deleted boolean, mine boolean
)
language plpgsql
stable
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  v_me uuid := public.cesi_chat_me();
begin
  if not public.cesi_chat_can(v_me, p_conversation) then
    raise exception 'No puedes ver esta conversación.' using errcode = '42501';
  end if;
  return query
    select x.id, x.conversation_id, x.author_id, x.author_name, x.body, x.created_at, x.edited_at, x.deleted, x.mine
    from (
      select m.id, m.conversation_id, m.author_id, public.cesi_name_or_gone(m.author_id, m.author_gone_name) as author_name,
        case when m.deleted_at is null then m.body else '' end as body,
        m.created_at, m.edited_at, m.deleted_at is not null as deleted, m.author_id = v_me as mine
      from public.chat_messages m
      where m.conversation_id = p_conversation and (p_before is null or m.created_at < p_before)
      order by m.created_at desc
      limit least(greatest(coalesce(p_limit, 100), 1), 300)
    ) x
    order by x.created_at;
end;
$$;

-- Personas con las que se puede abrir una privada: el equipo y la ceo (sin mí).
create or replace function public.cesi_chat_people()
returns table (id uuid, name text, area text, area_name text)
language plpgsql
stable
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  v_me uuid := public.cesi_chat_me();
begin
  return query
    select p.id, public.cesi_person_name(p.id), p.area,
      case when p.role = 'ceo' then 'Dirección' else coalesce(a.name, '') end
    from public.profiles p
    left join public.areas a on a.id = p.area
    where p.role in ('ceo', 'equipo') and p.id <> v_me
    order by 2;
end;
$$;

-- Total de mensajes sin leer (para el menú y el Inicio).
create or replace function public.cesi_chat_unread()
returns integer
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(sum(unread), 0)::integer from public.cesi_chat_list();
$$;

-- -----------------------------------------------------------------------------
-- Escribir
-- -----------------------------------------------------------------------------

-- Abrir (o crear) la conversación privada con otra persona del equipo o la ceo. Devuelve su id.
create or replace function public.cesi_chat_open_private(p_other uuid)
returns uuid
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_me uuid := public.cesi_chat_me();
  v_key text;
  v_id uuid;
begin
  if p_other is null or p_other = v_me or not exists (select 1 from public.profiles where id = p_other and role in ('ceo', 'equipo')) then
    raise exception 'Solo puedes escribir a otra persona del equipo.' using errcode = '22023';
  end if;
  v_key := least(v_me::text, p_other::text) || ':' || greatest(v_me::text, p_other::text);
  select c.id into v_id from public.chat_conversations c where c.kind = 'private' and c.pair_key = v_key;
  if v_id is null then
    insert into public.chat_conversations (kind, pair_key) values ('private', v_key)
    on conflict do nothing
    returning id into v_id;
    if v_id is null then
      select c.id into v_id from public.chat_conversations c where c.kind = 'private' and c.pair_key = v_key;
    end if;
  end if;
  insert into public.chat_members (conversation_id, profile_id) values (v_id, v_me), (v_id, p_other)
  on conflict do nothing;
  return v_id;
end;
$$;

-- Escribir un mensaje. Devuelve su id. También marca la conversación como leída.
create or replace function public.cesi_chat_send(p_conversation uuid, p_body text)
returns uuid
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_me uuid := public.cesi_chat_me();
  v_body text := trim(coalesce(p_body, ''));
  v_id uuid;
begin
  if not public.cesi_chat_can(v_me, p_conversation) then
    raise exception 'No puedes escribir en esta conversación.' using errcode = '42501';
  end if;
  if length(v_body) = 0 or length(v_body) > 4000 then
    raise exception 'Escribe el mensaje (como mucho 4000 caracteres).' using errcode = '22023';
  end if;
  insert into public.chat_messages (conversation_id, author_id, body) values (p_conversation, v_me, v_body)
  returning id into v_id;
  update public.chat_conversations set last_message_at = now() where id = p_conversation;
  insert into public.chat_reads (conversation_id, profile_id, last_read_at) values (p_conversation, v_me, now())
  on conflict (conversation_id, profile_id) do update set last_read_at = excluded.last_read_at;
  return v_id;
end;
$$;

-- Editar un mensaje mío (que no esté borrado).
create or replace function public.cesi_chat_edit(p_id uuid, p_body text)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_me uuid := public.cesi_chat_me();
  v_body text := trim(coalesce(p_body, ''));
begin
  if length(v_body) = 0 or length(v_body) > 4000 then
    raise exception 'Escribe el mensaje (como mucho 4000 caracteres).' using errcode = '22023';
  end if;
  update public.chat_messages set body = v_body, edited_at = now()
  where id = p_id and author_id = v_me and deleted_at is null
    and public.cesi_chat_can(v_me, conversation_id);
  if not found then
    raise exception 'Solo puedes editar tus mensajes.' using errcode = '42501';
  end if;
end;
$$;

-- Borrar un mensaje mío: se borra el texto y queda «Mensaje eliminado».
create or replace function public.cesi_chat_delete(p_id uuid)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_me uuid := public.cesi_chat_me();
begin
  update public.chat_messages set body = '', deleted_at = now()
  where id = p_id and author_id = v_me and deleted_at is null;
  if not found then
    raise exception 'Solo puedes borrar tus mensajes.' using errcode = '42501';
  end if;
end;
$$;

-- Marcar como leída una conversación (hasta ahora).
create or replace function public.cesi_chat_read(p_conversation uuid)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_me uuid := public.cesi_chat_me();
begin
  if not public.cesi_chat_can(v_me, p_conversation) then
    raise exception 'No puedes ver esta conversación.' using errcode = '42501';
  end if;
  insert into public.chat_reads (conversation_id, profile_id, last_read_at) values (p_conversation, v_me, now())
  on conflict (conversation_id, profile_id) do update set last_read_at = greatest(public.chat_reads.last_read_at, excluded.last_read_at);
end;
$$;

-- Al eliminar una cuenta, sus mensajes se quedan con su nombre.
create or replace function public.cesi_chat_gone()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.chat_messages
  set author_gone_name = left(coalesce(nullif(public.cesi_person_name(old.id), ''), 'Sin nombre'), 200)
  where author_id = old.id;
  return old;
end;
$$;

revoke all on function public.cesi_chat_gone() from public, anon, authenticated;

drop trigger if exists profiles_chat_gone on public.profiles;
create trigger profiles_chat_gone
  before delete on public.profiles
  for each row execute function public.cesi_chat_gone();

-- -----------------------------------------------------------------------------
-- Permisos de las funciones
-- -----------------------------------------------------------------------------
revoke all on function public.cesi_chat_list() from public, anon;
revoke all on function public.cesi_chat_messages(uuid, timestamptz, integer) from public, anon;
revoke all on function public.cesi_chat_people() from public, anon;
revoke all on function public.cesi_chat_unread() from public, anon;
revoke all on function public.cesi_chat_open_private(uuid) from public, anon;
revoke all on function public.cesi_chat_send(uuid, text) from public, anon;
revoke all on function public.cesi_chat_edit(uuid, text) from public, anon;
revoke all on function public.cesi_chat_delete(uuid) from public, anon;
revoke all on function public.cesi_chat_read(uuid) from public, anon;
grant execute on function public.cesi_chat_list() to authenticated;
grant execute on function public.cesi_chat_messages(uuid, timestamptz, integer) to authenticated;
grant execute on function public.cesi_chat_people() to authenticated;
grant execute on function public.cesi_chat_unread() to authenticated;
grant execute on function public.cesi_chat_open_private(uuid) to authenticated;
grant execute on function public.cesi_chat_send(uuid, text) to authenticated;
grant execute on function public.cesi_chat_edit(uuid, text) to authenticated;
grant execute on function public.cesi_chat_delete(uuid) to authenticated;
grant execute on function public.cesi_chat_read(uuid) to authenticated;
