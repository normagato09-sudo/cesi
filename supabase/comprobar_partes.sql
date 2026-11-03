-- =============================================================================
-- CIFA · Comprobar qué partes del SQL están ejecutadas (SOLO LECTURA)
-- =============================================================================
-- Ejecutar en Supabase → SQL Editor (proyecto fvswxhfjclvadcoyuqyu). No cambia nada: solo mira si
-- existe lo que crea cada parte (una tabla, una función, una columna o un cambio concreto) y lo
-- dice en una fila por parte. Se puede ejecutar siempre que se quiera.
--
-- «Sí»: la huella de esa parte está. «No»: falta (o se ejecutó una versión anterior).
-- Necesita las tablas de la parte 2 (areas y area_permissions); sin ellas da un error.

with fn as (
  -- Definición de una función de public por su nombre (la primera si hay varias).
  select p.proname as name, pg_get_functiondef(p.oid) as def
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.prokind = 'f'
),
col as (
  select table_name || '.' || column_name as name
  from information_schema.columns
  where table_schema = 'public'
),
checks (orden, parte, ok, huella) as (
  values
    (1, 'Reservas y horas (reservas_y_horas_2359)', to_regclass('public.booking_links') is not null, 'tabla booking_links'),
    (2, 'Parte 1a · cuentas y papeles', to_regclass('public.profiles') is not null, 'tabla profiles'),
    (3, 'Parte 1b · Google y Discord', exists (select 1 from col where name = 'profiles.auth_provider'), 'columna profiles.auth_provider'),
    (4, 'Parte 2 · papeles y permisos', to_regclass('public.area_permissions') is not null, 'tabla area_permissions'),
    (5, 'Parte 3 · portal de alumnos', to_regclass('public.student_profiles') is not null, 'tabla student_profiles'),
    (6, 'Parte 4 · perfil para todos', to_regclass('public.account_profiles') is not null, 'tabla account_profiles'),
    (7, 'Parte 5 · áreas', exists (select 1 from public.areas where id = 'direccion' and name = 'Directivo'), 'área «Directivo»'),
    (8, 'Parte 6 · calendario compartido', to_regclass('public.shared_meetings') is not null, 'tabla shared_meetings'),
    (9, 'Parte 7 · tareas y fichaje', to_regclass('public.clock_entries') is not null, 'tabla clock_entries'),
    (10, 'Parte 8 · panel de la ceo', exists (select 1 from col where name = 'clock_entries.owner_gone_name'), 'columna clock_entries.owner_gone_name'),
    (11, 'Parte 9 · sin reservas', to_regprocedure('public.cesi_booking_get(text)') is not null
       and not coalesce(has_function_privilege('anon', to_regprocedure('public.cesi_booking_get(text)'), 'execute'), true), 'enlace de reservas cerrado'),
    (12, 'Parte 10 · nueva reunión', exists (select 1 from fn where name = 'cesi_invitable_people_areas'), 'función cesi_invitable_people_areas'),
    (13, 'Parte 11 · pantallas del equipo', exists (select 1 from fn where name = 'cesi_screen_data'), 'función cesi_screen_data'),
    (14, 'Parte 12 · Inicio del equipo', to_regclass('public.home_alerts_seen') is not null, 'tabla home_alerts_seen'),
    (15, 'Parte 13 · tareas de varias personas', to_regclass('public.team_task_assignees') is not null, 'tabla team_task_assignees'),
    (16, 'Parte 14 · objetivos del mes', to_regclass('public.team_goals') is not null, 'tabla team_goals'),
    (17, 'Parte 15 · el profesor pasa lista', exists (select 1 from fn where name = 'cesi_teacher_attendance_save'), 'función cesi_teacher_attendance_save'),
    (18, 'Parte 16 · Alianzas', exists (select 1 from fn where name = 'cesi_alliance_role'), 'función cesi_alliance_role'),
    (19, 'Parte 17 · tableros de área', to_regclass('public.board_items') is not null, 'tabla board_items'),
    (20, 'Parte 18 · avisos del equipo', to_regclass('public.team_notices') is not null, 'tabla team_notices'),
    (21, 'Parte 19 · Finanzas', to_regclass('public.finance_movements') is not null, 'tabla finance_movements'),
    (22, 'Parte 20 · editar según permisos', to_regclass('public.team_edit_log') is not null, 'tabla team_edit_log'),
    (23, 'Parte 21 · mensajes del equipo', to_regclass('public.chat_messages') is not null, 'tabla chat_messages'),
    (24, 'Parte 22 · invitar y participantes', coalesce((select def like '%v_from = ''alumno'' and v_to = ''alumno''%' from fn where name = 'cesi_can_invite' limit 1), false),
       'cesi_can_invite con compañeros de curso'),
    (25, 'Parte 23 · Inicios por área', coalesce((select pg_get_function_result(p.oid) like '%late_count%' from pg_proc p
       join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and p.proname = 'cesi_board_counts' limit 1), false), 'cesi_board_counts con atrasados'),
    (26, 'Parte 24 · contactos de cada persona', to_regclass('public.team_contacts') is not null, 'tabla team_contacts'),
    (27, 'Parte 25 · cursos e inscripciones', exists (select 1 from fn where name = 'cesi_student_enroll'), 'función cesi_student_enroll'),
    (28, 'Parte 26 · portal para estrenar', coalesce((select def like '%''alumno''%' from fn where name = 'cesi_handle_new_user' limit 1), false),
       'las cuentas nuevas entran como alumno'),
    (29, 'Parte 27 · Directivo sin áreas', coalesce((select level = 'none' from public.area_permissions where area = 'direccion' and screen = 'vacantes'), false)
       and coalesce((select def not like '%''direccion'' then ''view''%' from fn where name = 'cesi_finance_role' limit 1), false), 'Directivo sin vacantes ni Finanzas'),
    (30, 'Parte 28 · organigrama', exists (select 1 from fn where name = 'cesi_org_chart') and exists (select 1 from col where name = 'profiles.direction_role'),
       'función cesi_org_chart y columna del puesto'),
    (31, 'Parte 29 · sin Equipo', coalesce((select def like '%v_rrhh := false%' from fn where name = 'cesi_ceo_doc_patch' limit 1), false)
       and not exists (select 1 from public.area_permissions where screen = 'equipo' and level <> 'none'), 'nadie con Equipo y RRHH sin fichas')
)
select parte, case when ok then 'Sí' else 'No' end as ejecutada, huella
from checks
order by orden;
